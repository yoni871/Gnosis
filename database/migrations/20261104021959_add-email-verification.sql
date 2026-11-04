-- Up Migration

-- Issue #9: email verification. New accounts start unverified
-- (email_verified_at NULL); the login gate refuses them until they
-- verify. Existing accounts are grandfathered as verified by the
-- backfill below, so the gate never locks out a pre-existing user.
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;

UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL;

-- One row per issued verification link. Only the SHA-256 hash of the
-- token is stored; the raw token exists only in the email and in the
-- browser's memory. consumed_reason is NULL while the token is unused
-- and becomes 'verified' or 'superseded' when consumed. The UNIQUE
-- constraint on token_hash doubles as the lookup index; user_id gets
-- its own index for the resend lock-order queries.
CREATE TABLE email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash BYTEA NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    consumed_reason TEXT CHECK (consumed_reason IN ('verified', 'superseded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX email_verification_tokens_user_id_idx ON email_verification_tokens(user_id);

-- Down Migration

DROP TABLE IF EXISTS email_verification_tokens;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
