// Client side of the account system. The real checks all happen on the server
// (functions/), this file only shows the right buttons.

export const session = Vue.reactive({
    user: null,
    loaded: false,
});

export async function api(path, options = {}) {
    const res = await fetch(path, {
        credentials: 'same-origin',
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = {};
    try {
        data = await res.json();
    } catch {}
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
}

export async function loadSession() {
    try {
        const { user } = await api('/api/me');
        session.user = user;
    } catch {
        session.user = null; // e.g. running locally without the backend
    }
    session.loaded = true;
}

export async function logout() {
    try {
        await api('/api/auth/logout', { method: 'POST', body: {} });
    } finally {
        session.user = null;
    }
}

/** Opens the Log in page (Discord or username + password). */
export function login(next) {
    const query = next ? `?next=${encodeURIComponent(next)}` : '';
    window.location.hash = `/login${query}`;
}

/** Log in (or sign up) with Discord. */
export function discordLogin() {
    window.location.href = '/api/auth/login';
}

/** Add Discord to the account you're logged into. */
export function linkDiscord() {
    window.location.href = '/api/auth/login?link=1';
}
