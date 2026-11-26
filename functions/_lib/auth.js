// Username/password sign-in helpers: password hashing, rate limits and sessions.
// This file exports no onRequest handlers, so it does not create a route.

import { SESSION_COOKIE, SESSION_DAYS, cookie, now, randomToken, sha256 } from './server.js';

// ---------- Discord placeholder ----------
// Accounts made with a username and password have no Discord ID yet. The users table
// needs one, so they get a stand-in "local:..." value until they link Discord.
export const LOCAL_PREFIX = 'local:';

export function hasDiscord(user) {
    return !!user.discord_id && !String(user.discord_id).startsWith(LOCAL_PREFIX);
}

export function newLocalId() {
    return LOCAL_PREFIX + randomToken(12);
}

// ---------- Usernames & passwords ----------

export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function checkUsername(username) {
    if (!USERNAME_RE.test(username)) {
        return 'Usernames are 3–24 characters: letters, numbers, _ . -';
    }
    return null;
}

export function checkPassword(password, username) {
    if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
        return `Passwords need at least ${PASSWORD_MIN} characters.`;
    }
    if (password.length > PASSWORD_MAX) return `Passwords can be at most ${PASSWORD_MAX} characters.`;
    if (username && password.toLowerCase().includes(username.toLowerCase())) {
        return "Your password can't contain your username.";
    }
    if (/^(.)\1+$/.test(password) || /^(password|12345678|qwerty)/i.test(password)) {
        return 'That password is too easy to guess.';
    }
    return null;
}

// PBKDF2-SHA256. 100,000 rounds is the most Cloudflare Workers allows.
const ITERATIONS = 100000;

function toB64(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}
function fromB64(text) {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function derive(password, salt, iterations) {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password.normalize('NFKC')),
        'PBKDF2',
        false,
        ['deriveBits'],
    );
    return new Uint8Array(
        await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256),
    );
}

/** Returns "pbkdf2$<rounds>$<salt>$<hash>". The password itself is never stored. */
export async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(password, salt, ITERATIONS);
    return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

function sameBytes(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

// Used when the username doesn't exist, so a wrong username takes as long as a wrong password.
const DUMMY = `pbkdf2$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

export async function verifyPassword(password, stored) {
    const [scheme, rounds, salt, hash] = String(stored || DUMMY).split('$');
    if (scheme !== 'pbkdf2') return false;
    const actual = await derive(String(password), fromB64(salt), Number(rounds));
    return sameBytes(actual, fromB64(hash)) && !!stored;
}

// ---------- Rate limits (stored in D1) ----------

export function clientIp(request) {
    return request.headers.get('CF-Connecting-IP') || 'unknown';
}

/** How many attempts with this key happened in the last `seconds`. */
export async function countAttempts(env, key, seconds) {
    const row = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND at > ?',
    )
        .bind(key, now() - seconds)
        .first();
    return row.n;
}

export async function recordAttempt(env, ...keys) {
    const t = now();
    await env.DB.batch([
        // Tidy up anything older than a day.
        env.DB.prepare('DELETE FROM login_attempts WHERE at < ?').bind(t - 86400),
        ...keys.map((k) => env.DB.prepare('INSERT INTO login_attempts (key, at) VALUES (?, ?)').bind(k, t)),
    ]);
}

export async function clearAttempts(env, key) {
    await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();
}

// ---------- Sessions ----------

/** Creates a login session and returns the Set-Cookie header value. */
export async function startSession(env, userId) {
    const token = randomToken(32);
    const maxAge = SESSION_DAYS * 86400;
    const t = now();
    await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t),
        env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(
            await sha256(token),
            userId,
            t + maxAge,
        ),
    ]);
    return { cookie: cookie(SESSION_COOKIE, token, maxAge), tokenHash: await sha256(token) };
}
