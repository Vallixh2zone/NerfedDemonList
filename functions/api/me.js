import {
    checkName,
    checkWriteRequest,
    cleanName,
    error,
    getUser,
    json,
    publicUser,
    readJson,
} from '../_lib/server.js';

// GET /api/me → who is logged in (or { user: null })
export async function onRequestGet({ request, env }) {
    const user = await getUser(request, env);
    return json({ user: user ? publicUser(user) : null });
}

// POST /api/me { name } → choose your first player name (before you've submitted anything).
// After that, name changes go through /api/account/name and need a mod.
export async function onRequestPost({ request, env }) {
    const bad = checkWriteRequest(request);
    if (bad) return bad;
    const user = await getUser(request, env);
    if (!user) return error('Not logged in', 401);
    if (user.banned) return error('Banned', 403);

    let body;
    try {
        body = await readJson(request);
    } catch {
        return error('Invalid JSON');
    }
    const name = cleanName(body.name);

    if (user.name) {
        const count = await env.DB.prepare(
            'SELECT COUNT(*) AS n FROM submissions WHERE user_id = ?',
        )
            .bind(user.id)
            .first();
        if (count.n > 0) {
            return error('You already have submissions. Request a name change on your Account page.');
        }
    }

    const check = await checkName(env, request, name, user.id);
    if (check.error) return error(check.error);
    const verified = check.onList ? 0 : 1;

    await env.DB.prepare(
        'UPDATE users SET name = ?, name_lower = ?, name_verified = ?, pending_name = NULL WHERE id = ?',
    )
        .bind(name, name.toLowerCase(), verified, user.id)
        .run();

    return json({ user: publicUser({ ...user, name, name_verified: verified, pending_name: null }) });
}
