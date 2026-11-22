import { json } from '../_lib/server.js';

// GET /api/records → every accepted record, merged into the list by js/content.js
export async function onRequestGet({ env }) {
    const { results } = await env.DB.prepare(
        `SELECT s.level, u.name AS user, s.percent, s.link, s.hz, s.mobile
         FROM submissions s JOIN users u ON u.id = s.user_id
         WHERE s.status = 'accepted' AND u.banned = 0 AND u.name IS NOT NULL`,
    ).all();
    return json(
        {
            records: results.map((r) => ({ ...r, mobile: !!r.mobile })),
        },
        200,
        // Short public cache so the list stays fast but updates within a minute.
        { 'Cache-Control': 'public, max-age=60' },
    );
}
