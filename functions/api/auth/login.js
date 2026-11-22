import { STATE_COOKIE, cookie, randomToken, error } from '../../_lib/server.js';

// GET /api/auth/login → sends the user to Discord to approve "identify" only.
export async function onRequestGet({ env }) {
    if (!env.DISCORD_CLIENT_ID || !env.DISCORD_REDIRECT_URI) {
        return error('Login is not configured yet', 500);
    }
    const state = randomToken(16);
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
    url.searchParams.set('redirect_uri', env.DISCORD_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'none');

    return new Response(null, {
        status: 302,
        headers: {
            Location: url.toString(),
            'Set-Cookie': cookie(STATE_COOKIE, state, 600),
            'Cache-Control': 'no-store',
        },
    });
}
