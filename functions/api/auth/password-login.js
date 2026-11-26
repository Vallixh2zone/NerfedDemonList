import { checkWriteRequest, error, isStaff, json, publicUser, readJson } from '../../_lib/server.js';
import { clearAttempts, clientIp, countAttempts, recordAttempt, startSession, verifyPassword } from '../../_lib/auth.js';

const WINDOW = 15 * 60; // seconds
const MAX_PER_IP = 20;
const MAX_PER_ACCOUNT = 8;

// POST /api/auth/password-login { username, password }
export async function onRequestPost({ request, env }) {
    const bad = checkWriteRequest(request);
    if (bad) return bad;

    let body;
    try {
        body = await readJson(request);
    } catch {
        return error('Invalid JSON');
    }
    const lower = String(body.username || '').trim().toLowerCase().slice(0, 64);
    const password = String(body.password || '').slice(0, 256);
    if (!lower || !password) return error('Enter your username and password.');

    // Slow down password guessing, both from one connection and against one account.
    const ipKey = `login-ip:${clientIp(request)}`;
    const userKey = `login-user:${lower}`;
    if ((await countAttempts(env, ipKey, WINDOW)) >= MAX_PER_IP) {
        return error('Too many wrong passwords from your connection. Wait 15 minutes and try again.', 429);
    }
    if ((await countAttempts(env, userKey, WINDOW)) >= MAX_PER_ACCOUNT) {
        return error('Too many wrong passwords for this account. Wait 15 minutes and try again.', 429);
    }

    const user = await env.DB.prepare('SELECT * FROM users WHERE username_lower = ?').bind(lower).first();
    // Always check a password (a dummy one if the username doesn't exist) so both take the same time.
    const ok = await verifyPassword(password, user?.password_hash);
    if (!user || !ok) {
        await recordAttempt(env, ipKey, userKey);
        return error('Wrong username or password.', 401);
    }
    if (user.banned) return error('This account is banned.', 403);

    await clearAttempts(env, userKey);
    const session = await startSession(env, user.id);
    return json(
        { user: publicUser({ ...user, staff: isStaff(env, user.discord_id) }) },
        200,
        { 'Set-Cookie': session.cookie },
    );
}
