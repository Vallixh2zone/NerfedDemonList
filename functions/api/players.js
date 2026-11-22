import { avatarUrl, json } from '../_lib/server.js';

// GET /api/players → public profile info (country flag, picture) for every account with a name
export async function onRequestGet({ env }) {
    const { results } = await env.DB.prepare(
        `SELECT name, country, discord_id, discord_avatar, show_avatar FROM users
         WHERE name IS NOT NULL AND name_verified = 1 AND banned = 0`,
    ).all();
    return json(
        {
            players: results.map((u) => ({
                name: u.name,
                country: u.country || null,
                avatar: avatarUrl(u),
            })),
        },
        200,
        { 'Cache-Control': 'public, max-age=60' },
    );
}
