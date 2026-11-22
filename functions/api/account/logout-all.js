import {
    SESSION_COOKIE,
    checkWriteRequest,
    cookie,
    error,
    getUser,
    json,
} from '../../_lib/server.js';

// POST /api/account/logout-all → logs this account out on every device
export async function onRequestPost({ request, env }) {
    const bad = checkWriteRequest(request);
    if (bad) return bad;
    const user = await getUser(request, env);
    if (!user) return error('Not logged in', 401);
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) });
}
