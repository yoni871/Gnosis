-- Up Migration
-- Passkeys (WebAuthn) live alongside passwords: a user may register
-- several credentials, and any one of them can start a session. The
-- challenge table holds one live ceremony challenge per user and type;
-- starting a new ceremony supersedes the previous one, exactly like
-- the verification and reset token flows.
CREATE TABLE user_passkeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    transports TEXT[] NOT NULL DEFAULT '{}',
    backed_up BOOLEAN NOT NULL DEFAULT FALSE,
    label TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    flagged_at TIMESTAMPTZ
);
CREATE INDEX user_passkeys_user_id_idx ON user_passkeys(user_id);
CREATE TABLE webauthn_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
    challenge TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX webauthn_challenges_user_id_idx ON webauthn_challenges(user_id);
CREATE INDEX webauthn_challenges_expires_at_idx ON webauthn_challenges(expires_at);
-- Down Migration
DROP TABLE webauthn_challenges;
DROP TABLE user_passkeys;
