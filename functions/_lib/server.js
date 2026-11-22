// Shared helpers for the account system (Cloudflare Pages Functions).
// This file exports no onRequest handlers, so it does not create a route.

export const SESSION_COOKIE = '__Host-ndl_session';
export const STATE_COOKIE = '__Host-ndl_oauth_state';
export const SESSION_DAYS = 30;

// Video hosts a record link may point to. Keeps mods from being sent to random sites.
const ALLOWED_VIDEO_HOSTS = [
    'youtube.com',
    'youtu.be',
    'medal.tv',
    'twitch.tv',
    'streamable.com',
    'drive.google.com',
    'bilibili.com',
];

export function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...headers,
        },
    });
}

export function error(message, status = 400) {
    return json({ error: message }, status);
}

export function now() {
    return Math.floor(Date.now() / 1000);
}

export function randomToken(bytes = 32) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export async function sha256(text) {
    const buf = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(text),
    );
    return [...new Uint8Array(buf)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export function getCookie(request, name) {
    const header = request.headers.get('Cookie') || '';
    for (const part of header.split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === name) return v.join('=');
    }
    return null;
}

export function cookie(name, value, maxAge) {
    // __Host- prefix forces Secure + Path=/ + no Domain, so subdomains can't overwrite it.
    return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function isStaff(env, discordId) {
    const ids = (env.STAFF_DISCORD_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return ids.includes(String(discordId));
}

/** Returns the logged-in user row (plus `staff`) or null. */
export async function getUser(request, env) {
    const token = getCookie(request, SESSION_COOKIE);
    if (!token || token.length > 100) return null;
    const hash = await sha256(token);
    const user = await env.DB.prepare(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
        .bind(hash, now())
        .first();
    if (!user) return null;
    return { ...user, staff: isStaff(env, user.discord_id) };
}

/**
 * Blocks cross-site form posts (CSRF): state-changing requests must come from
 * this site's own pages and send JSON.
 */
export function checkWriteRequest(request) {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== new URL(request.url).origin) {
        return error('Bad origin', 403);
    }
    const type = request.headers.get('Content-Type') || '';
    if (!type.startsWith('application/json')) {
        return error('Expected JSON', 415);
    }
    return null;
}

export async function readJson(request) {
    const text = await request.text();
    if (text.length > 10_000) throw new Error('Body too large');
    return JSON.parse(text || '{}');
}

export function cleanText(value, max) {
    if (value == null) return '';
    return String(value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, max);
}

/** Returns a normalised https URL on an allowed video host, or null. */
export function cleanVideoUrl(value) {
    if (!value || typeof value !== 'string' || value.length > 300) return null;
    let url;
    try {
        url = new URL(value.trim());
    } catch {
        return null;
    }
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const ok = ALLOWED_VIDEO_HOSTS.some(
        (h) => host === h || host.endsWith('.' + h),
    );
    return ok ? url.toString() : null;
}

// ---- Reading the list's own JSON files (served as static assets) ----

async function asset(env, request, path) {
    const res = await env.ASSETS.fetch(new URL(path, request.url));
    if (!res.ok) throw new Error(`Missing ${path}`);
    return res.json();
}

/** ["nerfedflamewall", ...] in list order. */
export async function getListOrder(env, request) {
    return asset(env, request, '/data/_list.json');
}

/** { rank, data } for a level file name, or null if it is not on the list. */
export async function getLevel(env, request, path) {
    if (typeof path !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(path)) {
        return null;
    }
    const order = await getListOrder(env, request);
    const index = order.indexOf(path);
    if (index === -1) return null;
    const data = await asset(env, request, `/data/${path}.json`);
    return { rank: index + 1, data };
}

/** Lower-cased set of every player name already in the JSON files. */
export async function getExistingNames(env, request) {
    const names = new Set();
    const order = await getListOrder(env, request);
    const levels = await Promise.all(
        order.map((p) => asset(env, request, `/data/${p}.json`).catch(() => null)),
    );
    for (const level of levels) {
        if (!level) continue;
        if (level.verifier) names.add(String(level.verifier).toLowerCase());
        for (const r of level.records || []) {
            if (r.user) names.add(String(r.user).toLowerCase());
        }
    }
    try {
        const players = await asset(env, request, '/data/_players.json');
        Object.keys(players).forEach((n) => names.add(n.toLowerCase()));
    } catch {}
    return names;
}

export const NAME_RE = /^[A-Za-z0-9_.\- ]{2,24}$/;

export const NAME_COOLDOWN_DAYS = 30;

export function cleanName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

/**
 * Checks a name can be used by this user.
 * Returns { error } or { onList } (onList = the name already has records in the JSON files).
 */
export async function checkName(env, request, name, userId) {
    if (!NAME_RE.test(name)) {
        return { error: 'Names must be 2–24 characters: letters, numbers, spaces, _ - .' };
    }
    const lower = name.toLowerCase();
    const taken = await env.DB.prepare(
        `SELECT id FROM users WHERE id != ? AND (name_lower = ? OR lower(pending_name) = ?)`,
    )
        .bind(userId, lower, lower)
        .first();
    if (taken) return { error: 'That name is already taken by another account.' };
    const existing = await getExistingNames(env, request);
    return { onList: existing.has(lower) };
}

export function avatarUrl(u) {
    if (!u.show_avatar || !u.discord_avatar || !/^\d+$/.test(String(u.discord_id))) return null;
    const ext = u.discord_avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.discord_avatar}.${ext}?size=128`;
}

export function publicUser(u) {
    const changedAt = u.name_changed_at || 0;
    return {
        name: u.name,
        nameVerified: !!u.name_verified,
        discordUsername: u.discord_username,
        staff: !!u.staff,
        banned: !!u.banned,
        country: u.country || null,
        avatar: avatarUrl({ ...u, show_avatar: 1 }),
        showAvatar: !!u.show_avatar,
        pingOnReview: !!u.ping_on_review,
        pendingName: u.pending_name || null,
        nextNameChange: changedAt ? changedAt + NAME_COOLDOWN_DAYS * 86400 : null,
    };
}

/** Valid 2-letter country code (lower case), '' to clear, or null if invalid. */
export function cleanCountry(value) {
    if (value === '' || value == null) return '';
    const code = String(value).toLowerCase();
    if (!/^[a-z]{2}$/.test(code)) return null;
    // Region groups / placeholders, not countries.
    if (['eu', 'ez', 'un', 'qo', 'xa', 'xb', 'zz'].includes(code)) return null;
    try {
        const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase());
        if (!name || name.toUpperCase() === code.toUpperCase()) return null;
    } catch {
        return null;
    }
    return code;
}
