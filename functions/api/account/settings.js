import {
    checkWriteRequest,
    cleanCountry,
    error,
    getUser,
    json,
    publicUser,
    readJson,
} from '../../_lib/server.js';

// POST /api/account/settings { country?, showAvatar?, pingOnReview? }
export async function onRequestPost({ request, env }) {
    const bad = checkWriteRequest(request);
    if (bad) return bad;
    const user = await getUser(request, env);
    if (!user) return error('Not logged in', 401);

    let body;
    try {
        body = await readJson(request);
    } catch {
        return error('Invalid JSON');
    }

    const updated = { ...user };
    if ('country' in body) {
        const country = cleanCountry(body.country);
        if (country === null) return error('Pick a country from the list.');
        updated.country = country || null;
    }
    if ('showAvatar' in body) updated.show_avatar = body.showAvatar ? 1 : 0;
    if ('pingOnReview' in body) updated.ping_on_review = body.pingOnReview ? 1 : 0;

    await env.DB.prepare(
        'UPDATE users SET country = ?, show_avatar = ?, ping_on_review = ? WHERE id = ?',
    )
        .bind(updated.country, updated.show_avatar, updated.ping_on_review, user.id)
        .run();

    return json({ user: publicUser(updated) });
}
