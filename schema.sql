-- Nerfed Demon List account system — D1 schema
-- Run this once in the Cloudflare dashboard: D1 → your database → Console.

CREATE TABLE IF NOT EXISTS users (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id       TEXT    NOT NULL UNIQUE,
    discord_username TEXT,
    name             TEXT,                       -- the one name records go under
    name_lower       TEXT    UNIQUE,             -- for case-insensitive uniqueness
    name_verified    INTEGER NOT NULL DEFAULT 1, -- 0 = claims a name already on the list, needs a mod
    banned           INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL,
    country          TEXT,                       -- 2-letter code, e.g. "us"
    discord_avatar   TEXT,                       -- Discord avatar hash
    show_avatar      INTEGER NOT NULL DEFAULT 1,
    ping_on_review   INTEGER NOT NULL DEFAULT 1,
    pending_name     TEXT,                       -- requested new name, waiting for a mod
    pending_name_at  INTEGER,
    name_changed_at  INTEGER,
    username         TEXT,                       -- sign-in name for username/password accounts
    username_lower   TEXT,
    password_hash    TEXT                        -- PBKDF2 hash; the password itself is never stored
);
-- Accounts made without Discord store "local:<random>" in discord_id until Discord is linked.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username_lower);

-- Failed logins and sign-ups, used to slow down password guessing. Rows older than a day are deleted.
CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT    NOT NULL,
    at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(key, at);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT    PRIMARY KEY,              -- SHA-256 of the cookie token, never the token itself
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS submissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    level       TEXT    NOT NULL,                -- file name from data/_list.json, e.g. "nerfedkot"
    percent     INTEGER NOT NULL,
    link        TEXT    NOT NULL,
    raw_footage TEXT,
    hz          INTEGER NOT NULL,
    mobile      INTEGER NOT NULL DEFAULT 0,
    notes       TEXT,
    status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at  INTEGER NOT NULL,
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at INTEGER,
    reason      TEXT
);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
