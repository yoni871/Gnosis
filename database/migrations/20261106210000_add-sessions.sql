-- Up Migration
CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE TABLE auth_refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
    used_at TIMESTAMPTZ
);
CREATE INDEX auth_refresh_tokens_session_id_idx ON auth_refresh_tokens(session_id);
-- Down Migration
DROP TABLE auth_refresh_tokens;
DROP TABLE auth_sessions;
