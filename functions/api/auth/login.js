import { MODE_COOKIE, STATE_COOKIE, cookie, randomToken, error } from '../../_lib/server.js';

// GET /api/auth/login        → log in (or sign up) with Discord
// GET /api/auth/login?link=1 → link Discord to the account you're logged into
export async function onRequestGet({ request, env }) {
    if (!env.DISCORD_CLIENT_ID || !env.DISCORD_REDIRECT_URI) {
        return error('Login is not configured yet', 500);
    }
    const link = new URL(request.url).searchParams.get('link') === '1';
    const state = randomToken(16);
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
    url.searchParams.set('redirect_uri', env.DISCORD_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'none');

    const headers = new Headers({ Location: url.toString(), 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', cookie(STATE_COOKIE, state, 600));
    headers.append('Set-Cookie', cookie(MODE_COOKIE, link ? 'link' : 'login', 600));
    return new Response(null, { status: 302, headers });
}
