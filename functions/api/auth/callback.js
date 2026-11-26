import {
    MODE_COOKIE,
    STATE_COOKIE,
    cookie,
    getCookie,
    getUser,
    now,
} from '../../_lib/server.js';
import { startSession } from '../../_lib/auth.js';

function redirect(location, ...cookies) {
    const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', cookie(STATE_COOKIE, '', 0));
    headers.append('Set-Cookie', cookie(MODE_COOKIE, '', 0));
    for (const c of cookies) headers.append('Set-Cookie', c);
    return new Response(null, { status: 302, headers });
}

function fail(message, page = 'login') {
    // Send them back with a readable error.
    return redirect(`/#/${page}?error=${encodeURIComponent(message)}`);
}

// GET /api/auth/callback?code=...&state=...  (Discord redirects here)
export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const expected = getCookie(request, STATE_COOKIE);

    const linking = getCookie(request, MODE_COOKIE) === 'link';
    const back = linking ? 'account' : 'login';

    if (!code || !state || !expected || state !== expected) {
        return fail('Login expired or was tampered with. Please try again.', back);
    }

    // Swap the one-time code for an access token (server-side, secret never leaves Cloudflare).
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: env.DISCORD_CLIENT_ID,
            client_secret: env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: env.DISCORD_REDIRECT_URI,
        }),
    });
    if (!tokenRes.ok) return fail('Discord login failed.', back);
    const { access_token } = await tokenRes.json();

    const meRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!meRes.ok) return fail('Could not read your Discord account.', back);
    const me = await meRes.json();
    if (!me.id) return fail('Could not read your Discord account.', back);

    const discordId = String(me.id);
    const discordName = String(me.username || '').slice(0, 64);
    const avatar = /^(a_)?[0-9a-f]{32}$/.test(me.avatar || '') ? me.avatar : null;

    if (linking) {
        // Add Discord to the account you're already logged into.
        const current = await getUser(request, env);
        if (!current) return fail('Log in first, then link Discord from your Account page.', 'login');
        const owner = await env.DB.prepare('SELECT id FROM users WHERE discord_id = ?').bind(discordId).first();
        if (owner && owner.id !== current.id) {
            return fail(
                'That Discord account already has its own NDL account. Log in with Discord to use it, or ask a mod to merge the two.',
                'account',
            );
        }
        await env.DB.prepare(
            'UPDATE users SET discord_id = ?, discord_username = ?, discord_avatar = ? WHERE id = ?',
        )
            .bind(discordId, discordName, avatar, current.id)
            .run();
        return redirect('/#/account?linked=1');
    }

    const t = now();
    await env.DB.prepare(
        `INSERT INTO users (discord_id, discord_username, discord_avatar, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(discord_id) DO UPDATE SET
            discord_username = excluded.discord_username,
            discord_avatar = excluded.discord_avatar`,
    )
        .bind(discordId, discordName, avatar, t)
        .run();
    const user = await env.DB.prepare('SELECT id, banned FROM users WHERE discord_id = ?')
        .bind(discordId)
        .first();
    if (user.banned) return fail('This account is banned from submitting.');

    const session = await startSession(env, user.id);
    return redirect('/#/submit', session.cookie);
}
