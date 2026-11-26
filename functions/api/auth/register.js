import { checkWriteRequest, error, getUser, json, now, publicUser, readJson } from '../../_lib/server.js';
import {
    checkPassword,
    checkUsername,
    clientIp,
    countAttempts,
    hashPassword,
    newLocalId,
    recordAttempt,
    startSession,
} from '../../_lib/auth.js';

// POST /api/auth/register { username, password } → make an account without Discord, and log in
export async function onRequestPost({ request, env }) {
    const bad = checkWriteRequest(request);
    if (bad) return bad;
    if (await getUser(request, env)) return error("You're already logged in.");

    let body;
    try {
        body = await readJson(request);
    } catch {
        return error('Invalid JSON');
    }
    const username = String(body.username || '').trim();
    const password = body.password;

    const usernameProblem = checkUsername(username);
    if (usernameProblem) return error(usernameProblem);
    const passwordProblem = checkPassword(password, username);
    if (passwordProblem) return error(passwordProblem);

    // At most 5 new accounts per hour from one internet connection.
    const ipKey = `register:${clientIp(request)}`;
    if ((await countAttempts(env, ipKey, 3600)) >= 5) {
        return error('Too many new accounts from your connection. Try again in an hour.', 429);
    }

    const lower = username.toLowerCase();
    const taken = await env.DB.prepare('SELECT id FROM users WHERE username_lower = ?').bind(lower).first();
    if (taken) return error('That username is taken.');

    const hash = await hashPassword(password);
    let created;
    try {
        created = await env.DB.prepare(
            `INSERT INTO users (discord_id, username, username_lower, password_hash, created_at)
             VALUES (?, ?, ?, ?, ?) RETURNING *`,
        )
            .bind(newLocalId(), username, lower, hash, now())
            .first();
    } catch {
        return error('That username is taken.'); // lost a race with someone else
    }
    await recordAttempt(env, ipKey);

    const session = await startSession(env, created.id);
    return json({ user: publicUser({ ...created, staff: false }) }, 201, { 'Set-Cookie': session.cookie });
}
