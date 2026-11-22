import {
    checkWriteRequest,
    cleanText,
    cleanVideoUrl,
    error,
    getLevel,
    getUser,
    json,
    now,
    readJson,
} from '../_lib/server.js';

const MAX_PENDING = 10;
const MAX_PER_DAY = 20;

// GET /api/submissions → your own submissions and their status
export async function onRequestGet({ request, env }) {
    const user = await getUser(request, env);
    if (!user) return error('Not logged in', 401);
    const { results } = await env.DB.prepare(
        `SELECT id, level, percent, link, hz, mobile, status, reason, created_at, reviewed_at
         FROM submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
        .bind(user.id)
        .all();
    return json({ submissions: results });
}

// POST /api/submissions { level, percent, link, rawFootage, hz, mobile, notes }
export async function onRequestPost({ request, env }) {
    const bad = checkWriteRequest(request);
    if (bad) return bad;
    const user = await getUser(request, env);
    if (!user) return error('Not logged in', 401);
    if (user.banned) return error('This account is banned from submitting.', 403);
    if (!user.name) return error('Choose your player name first.');
    if (!user.name_verified) {
        return error('A list mod needs to confirm your name before you can submit.', 403);
    }

    let body;
    try {
        body = await readJson(request);
    } catch {
        return error('Invalid JSON');
    }

    const level = await getLevel(env, request, body.level);
    if (!level) return error('Pick a level from the list.');
    if (level.rank > 150) return error('This level does not accept new records.');

    const percent = Number(body.percent);
    const minPercent = level.rank > 75 ? 100 : Number(level.data.percentToQualify) || 100;
    if (!Number.isInteger(percent) || percent < minPercent || percent > 100) {
        return error(`This level needs ${minPercent}% or better.`);
    }

    const link = cleanVideoUrl(body.link);
    if (!link) {
        return error('Video link must be https YouTube, Medal, Twitch, Streamable, Google Drive or Bilibili.');
    }
    let rawFootage = null;
    if (body.rawFootage) {
        rawFootage = cleanVideoUrl(body.rawFootage);
        if (!rawFootage) return error('Raw footage link is not on an allowed site.');
    }

    const hz = Number(body.hz);
    if (!Number.isInteger(hz) || hz < 30 || hz > 1000) {
        return error('Enter your FPS/Hz as a whole number (30–1000).');
    }
    const mobile = body.mobile ? 1 : 0;
    const notes = cleanText(body.notes, 500) || null;
    const t = now();

    // Spam limits and duplicates.
    const stats = await env.DB.prepare(
        `SELECT
            SUM(status = 'pending') AS pending,
            SUM(created_at > ?) AS today,
            SUM(level = ? AND status = 'pending') AS pendingHere,
            MAX(CASE WHEN level = ? AND status = 'accepted' THEN percent END) AS best
         FROM submissions WHERE user_id = ?`,
    )
        .bind(t - 86400, body.level, body.level, user.id)
        .first();
    if ((stats.pending || 0) >= MAX_PENDING) {
        return error(`You have ${MAX_PENDING} records waiting already. Wait for a mod to review them.`, 429);
    }
    if ((stats.today || 0) >= MAX_PER_DAY) {
        return error('Too many submissions today. Try again tomorrow.', 429);
    }
    if (stats.pendingHere) {
        return error('You already have a pending record on this level.');
    }
    if (stats.best != null && stats.best >= percent) {
        return error(`You already have ${stats.best}% accepted on this level.`);
    }

    await env.DB.prepare(
        `INSERT INTO submissions (user_id, level, percent, link, raw_footage, hz, mobile, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
        .bind(user.id, body.level, percent, link, rawFootage, hz, mobile, notes, t)
        .run();

    return json({ ok: true }, 201);
}
