import {
    checkWriteRequest,
    cleanText,
    error,
    getUser,
    json,
    now,
    readJson,
} from '../../_lib/server.js';

// POST /api/review/:id { action: "accept" | "reject" | "reopen", reason? }
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
    const reason = cleanText(body.reason, 300) || null;

    let status;
    if (body.action === 'accept') status = 'accepted';
    else if (body.action === 'reject') status = 'rejected';
    else if (body.action === 'reopen') status = 'pending';
    else return error('Unknown action');

    if (status === 'rejected' && !reason) {
        return error('Give a reason so the player knows what to fix.');
    }

    const result = await env.DB.prepare(
        `UPDATE submissions SET status = ?, reason = ?, reviewed_by = ?, reviewed_at = ?
         WHERE id = ?`,
    )
        .bind(status, reason, user.id, now(), id)
        .run();
    if (!result.meta.changes) return error('Submission not found', 404);

    return json({ ok: true });
}
