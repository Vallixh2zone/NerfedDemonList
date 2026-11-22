import {
    SESSION_COOKIE,
    checkWriteRequest,
    cookie,
    getCookie,
    json,
    sha256,
} from '../../_lib/server.js';

// POST /api/auth/logout
export async function onRequestPost({ request, env }) {
    const bad = checkWriteRequest(request);
    if (bad) return bad;
    const token = getCookie(request, SESSION_COOKIE);
    if (token && token.length <= 100) {
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
            .bind(await sha256(token))
            .run();
    }
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) });
}
