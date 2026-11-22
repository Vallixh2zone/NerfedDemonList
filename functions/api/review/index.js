import { error, getExistingNames, getUser, json } from '../../_lib/server.js';

// GET /api/review → everything a mod needs: pending records, names to confirm, recent decisions
export async function onRequestGet({ request, env }) {
    const user = await getUser(request, env);
    if (!user) return error('Not logged in', 401);
    if (!user.staff) return error('Mods only', 403);

    const [pending, claims, recent, renames] = await env.DB.batch([
        env.DB.prepare(
            `SELECT s.*, u.name AS user, u.discord_username, u.discord_id
             FROM submissions s JOIN users u ON u.id = s.user_id
             WHERE s.status = 'pending' AND u.banned = 0
             ORDER BY s.created_at ASC LIMIT 200`,
        ),
        env.DB.prepare(
            `SELECT id, name, discord_username, discord_id, created_at FROM users
             WHERE name IS NOT NULL AND name_verified = 0 AND banned = 0
             ORDER BY created_at ASC`,
        ),
        env.DB.prepare(
            `SELECT s.id, s.level, s.percent, s.link, s.status, s.reason, s.reviewed_at,
                    u.name AS user, r.name AS reviewer, r.discord_username AS reviewer_discord
             FROM submissions s
             JOIN users u ON u.id = s.user_id
             LEFT JOIN users r ON r.id = s.reviewed_by
             WHERE s.status != 'pending'
             ORDER BY s.reviewed_at DESC LIMIT 50`,
        ),
        env.DB.prepare(
            `SELECT u.id, u.name, u.pending_name, u.pending_name_at, u.discord_username, u.discord_id,
                    (SELECT COUNT(*) FROM submissions WHERE user_id = u.id AND status = 'accepted') AS accepted
             FROM users u
             WHERE u.pending_name IS NOT NULL AND u.banned = 0
             ORDER BY u.pending_name_at ASC`,
        ),
    ]);

    // Flag renames that touch names already in the JSON files.
    const onList = renames.results.length ? await getExistingNames(env, request) : new Set();

    return json({
        pending: pending.results,
        claims: claims.results,
        recent: recent.results,
        renames: renames.results.map((r) => ({
            ...r,
            newNameOnList: onList.has(r.pending_name.toLowerCase()),
            oldNameOnList: onList.has(String(r.name).toLowerCase()),
        })),
    });
}
