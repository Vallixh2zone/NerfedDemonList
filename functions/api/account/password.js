import {
    SESSION_COOKIE,
    checkWriteRequest,
    error,
    getCookie,
    getUser,
    json,
    publicUser,
    readJson,
    sha256,
} from '../../_lib/server.js';
import {
    checkPassword,
    checkUsername,
    countAttempts,
    hashPassword,
    recordAttempt,
    verifyPassword,
} from '../../_lib/auth.js';

// POST /api/account/password
//   Discord accounts without a password: { username, newPassword } → adds username + password sign-in
//   Accounts with a password:            { currentPassword, newPassword } → changes the password
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

    let username = user.username;
    if (user.password_hash) {
        // Changing an existing password: prove you know the current one.
        const key = `change-password:${user.id}`;
        if ((await countAttempts(env, key, 900)) >= 8) {
            return error('Too many wrong passwords. Wait 15 minutes and try again.', 429);
        }
        if (!(await verifyPassword(String(body.currentPassword || '').slice(0, 256), user.password_hash))) {
            await recordAttempt(env, key);
            return error('Your current password is wrong.', 401);
        }
    } else {
        // Adding a password to a Discord account: also pick a username to sign in with.
        username = String(body.username || '').trim();
        const usernameProblem = checkUsername(username);
        if (usernameProblem) return error(usernameProblem);
        const taken = await env.DB.prepare('SELECT id FROM users WHERE username_lower = ? AND id != ?')
            .bind(username.toLowerCase(), user.id)
            .first();
        if (taken) return error('That username is taken.');
    }

    const passwordProblem = checkPassword(body.newPassword, username);
    if (passwordProblem) return error(passwordProblem);

    const hash = await hashPassword(body.newPassword);
    const currentToken = getCookie(request, SESSION_COOKIE) || '';
    const statements = [
        env.DB.prepare('UPDATE users SET username = ?, username_lower = ?, password_hash = ? WHERE id = ?').bind(
            username,
            username.toLowerCase(),
            hash,
            user.id,
        ),
    ];
    if (user.password_hash) {
        // A changed password logs out every other device (in case someone else knew the old one).
        statements.push(
            env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(
                user.id,
                await sha256(currentToken),
            ),
        );
    }
    try {
        await env.DB.batch(statements);
    } catch {
        return error('That username is taken.');
    }

    return json({
        user: publicUser({ ...user, username, password_hash: hash }),
    });
}
