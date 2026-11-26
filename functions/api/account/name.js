import {
    checkName,
    checkWriteRequest,
    cleanName,
    error,
    getUser,
    json,
    now,
    publicUser,
    readJson,
} from '../../_lib/server.js';

// POST /api/account/name { name } → ask a mod to change your name
// POST /api/account/name { cancel: true } → withdraw the request
export async function onRequestPost({ request, env }) {
    const bad = checkWriteRequest(request);
    if (bad) return bad;
    const user = await getUser(request, env);
    if (!user) return error('Not logged in', 401);
    if (user.banned) return error('Banned', 403);
    if (!user.name) return error('Choose a name on the Submit page first.');

    let body;
    try {
        body = await readJson(request);
    } catch {
        return error('Invalid JSON');
    }

    if (body.cancel) {
        await env.DB.prepare(
            'UPDATE users SET pending_name = NULL, pending_name_at = NULL WHERE id = ?',
        )
            .bind(user.id)
            .run();
        return json({ user: publicUser({ ...user, pending_name: null }) });
    }

    const name = cleanName(body.name);
    if (name === user.name) return error("That's already your name.");

    const nextChange = (user.name_changed_at || 0) + 7 * 86400;
    if (user.name_changed_at && now() < nextChange) {
        const days = Math.ceil((nextChange - now()) / 86400);
        return error(`You can change your name again in ${days} day(s).`);
    }

    // Only the capitalisation changes (e.g. "cesium" → "Cesium"): no mod needed.
    if (name.toLowerCase() === user.name.toLowerCase()) {
        await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, user.id).run();
        return json({ user: publicUser({ ...user, name }) });
    }

    const check = await checkName(env, request, name, user.id);
    if (check.error) return error(check.error);

    await env.DB.prepare(
        'UPDATE users SET pending_name = ?, pending_name_at = ? WHERE id = ?',
    )
        .bind(name, now(), user.id)
        .run();
    return json({ user: publicUser({ ...user, pending_name: name }) });
}
