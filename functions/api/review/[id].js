import {
    checkWriteRequest,
    cleanText,
    error,
    getLevel,
    getUser,
    json,
    now,
    readJson,
} from '../../_lib/server.js';
import { notifyReview } from '../../_lib/discord.js';

// POST /api/review/:id { action: "accept" | "reject" | "reopen", reason? }
export async function onRequestPost({ request, env, params, waitUntil }) {
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

    // Post the result to Discord in the background (doesn't slow down the review page).
    if (status !== 'pending') {
        const s = await env.DB.prepare(
            `SELECT s.*, u.name AS player, u.discord_id, u.ping_on_review FROM submissions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
        )
            .bind(id)
            .first();
        const level = await getLevel(env, request, s.level).catch(() => null);
        waitUntil(
            notifyReview(env, {
                ...s,
                levelName: level?.data?.name || s.level,
                reviewer: user.name || user.discord_username,
            }),
        );
    }

    return json({ ok: true });
}
