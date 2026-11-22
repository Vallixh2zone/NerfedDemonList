import {
    NAME_RE,
    checkWriteRequest,
    error,
    getExistingNames,
    getUser,
    json,
    readJson,
} from '../_lib/server.js';

function publicUser(u) {
    return {
        name: u.name,
        nameVerified: !!u.name_verified,
        discordUsername: u.discord_username,
        staff: u.staff,
        banned: !!u.banned,
    };
}

// GET /api/me → who is logged in (or { user: null })
export async function onRequestGet({ request, env }) {
    const user = await getUser(request, env);
    return json({ user: user ? publicUser(user) : null });
}

// POST /api/me { name } → choose the one name your records go under.
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
    const name = String(body.name || '').trim().replace(/\s+/g, ' ');
    if (!NAME_RE.test(name)) {
        return error('Names must be 2–24 characters: letters, numbers, spaces, _ - .');
    }

    // Names can only be changed before you've submitted anything, so records stay under one name.
    if (user.name) {
        const count = await env.DB.prepare(
            'SELECT COUNT(*) AS n FROM submissions WHERE user_id = ?',
        )
            .bind(user.id)
            .first();
        if (count.n > 0) {
            return error('You already have submissions. Ask a list mod to change your name.');
        }
    }

    const lower = name.toLowerCase();
    const taken = await env.DB.prepare(
        'SELECT id FROM users WHERE name_lower = ? AND id != ?',
    )
        .bind(lower, user.id)
        .first();
    if (taken) return error('That name is already taken by another account.');

    // If the name already has records on the list, a mod must confirm it's really them.
    const existing = await getExistingNames(env, request);
    const verified = existing.has(lower) ? 0 : 1;

    await env.DB.prepare(
        'UPDATE users SET name = ?, name_lower = ?, name_verified = ? WHERE id = ?',
    )
        .bind(name, lower, verified, user.id)
        .run();

    return json({
        user: publicUser({ ...user, name, name_verified: verified }),
    });
}
