import {
    SESSION_COOKIE,
    STATE_COOKIE,
    SESSION_DAYS,
    cookie,
    getCookie,
    randomToken,
    sha256,
    now,
} from '../../_lib/server.js';

function fail(message) {
    // Send them back to the submit page with a readable error.
    return new Response(null, {
        status: 302,
        headers: {
            Location: `/#/submit?error=${encodeURIComponent(message)}`,
            'Set-Cookie': cookie(STATE_COOKIE, '', 0),
            'Cache-Control': 'no-store',
        },
    });
}

// GET /api/auth/callback?code=...&state=...  (Discord redirects here)
export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const expected = getCookie(request, STATE_COOKIE);

    if (!code || !state || !expected || state !== expected) {
        return fail('Login expired or was tampered with. Please try again.');
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
    if (!tokenRes.ok) return fail('Discord login failed.');
    const { access_token } = await tokenRes.json();

    const meRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!meRes.ok) return fail('Could not read your Discord account.');
    const me = await meRes.json();
    if (!me.id) return fail('Could not read your Discord account.');

    const t = now();
    await env.DB.prepare(
        `INSERT INTO users (discord_id, discord_username, discord_avatar, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(discord_id) DO UPDATE SET
            discord_username = excluded.discord_username,
            discord_avatar = excluded.discord_avatar`,
    )
        .bind(
            String(me.id),
            String(me.username || '').slice(0, 64),
            /^(a_)?[0-9a-f]{32}$/.test(me.avatar || '') ? me.avatar : null,
            t,
        )
        .run();
    const user = await env.DB.prepare('SELECT id, banned FROM users WHERE discord_id = ?')
        .bind(String(me.id))
        .first();
    if (user.banned) return fail('This account is banned from submitting.');

    const token = randomToken(32);
    const maxAge = SESSION_DAYS * 86400;
    await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t),
        env.DB.prepare(
            'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
        ).bind(await sha256(token), user.id, t + maxAge),
    ]);

    const headers = new Headers({ Location: '/#/submit', 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', cookie(SESSION_COOKIE, token, maxAge));
    headers.append('Set-Cookie', cookie(STATE_COOKIE, '', 0));
    return new Response(null, { status: 302, headers });
}
