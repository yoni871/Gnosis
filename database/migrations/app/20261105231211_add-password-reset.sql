-- Up Migration

-- Issue #10: secure password reset. One row per issued reset link.
-- Only the SHA-256 hash of the token is stored; the raw token exists
-- only in the email and in the browser's memory. consumed_reason is
-- NULL while the token is unused and becomes 'used' or 'superseded'
-- when consumed. The UNIQUE constraint on token_hash doubles as the
-- lookup index; user_id gets its own index for the forgot lock-order
-- queries. Tokens live for 1 hour: shorter than the 24-hour
-- verification tokens, because a reset token grants account access.
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash BYTEA NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    consumed_reason TEXT CHECK (consumed_reason IN ('used', 'superseded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);

-- Down Migration

DROP TABLE IF EXISTS password_reset_tokens;
