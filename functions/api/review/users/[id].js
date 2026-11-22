import {
    checkWriteRequest,
    error,
    getUser,
    json,
    readJson,
} from '../../../_lib/server.js';

// POST /api/review/users/:id { action: "verify-name" | "reset-name" | "ban" | "unban" }
export async function onRequestPost({ request, env, params }) {
    const bad = checkWriteRequest(request);
    if (bad) return bad;
    const user = await getUser(request, env);
    if (!user) return error('Not logged in', 401);
    if (!user.staff) return error('Mods only', 403);

    const id = Number(params.id);
    if (!Number.isInteger(id) || id < 1) return error('Bad id');

    let body;
    try {
        body = await readJson(request);
    } catch {
        return error('Invalid JSON');
    }

    const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    if (!target) return error('User not found', 404);

    const stmts = [];
    switch (body.action) {
        case 'verify-name':
            stmts.push(env.DB.prepare('UPDATE users SET name_verified = 1 WHERE id = ?').bind(id));
            break;
        case 'reset-name':
            // Lets the player pick a different name (only if they have no submissions).
            stmts.push(
                env.DB.prepare(
                    `UPDATE users SET name = NULL, name_lower = NULL, name_verified = 1
                     WHERE id = ? AND NOT EXISTS (SELECT 1 FROM submissions WHERE user_id = ?)`,
                ).bind(id, id),
            );
            break;
        case 'ban':
            stmts.push(env.DB.prepare('UPDATE users SET banned = 1 WHERE id = ?').bind(id));
            stmts.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id));
            break;
        case 'unban':
            stmts.push(env.DB.prepare('UPDATE users SET banned = 0 WHERE id = ?').bind(id));
            break;
        default:
            return error('Unknown action');
    }
    await env.DB.batch(stmts);
    return json({ ok: true });
}
