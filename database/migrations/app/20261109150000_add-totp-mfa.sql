-- Up Migration
-- TOTP MFA (roadmap T2.1): one enrollment row per user. The secret is
-- stored encrypted (AES-256-GCM, MFA_ENCRYPTION_KEY) — never plaintext —
-- and becomes usable only once enrolled is true: enrollment is a
-- two-step flow (start, then confirm with a valid code), so a row with
-- enrolled=false grants nothing.
CREATE TABLE user_mfa (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret_encrypted TEXT NOT NULL,
    enrolled BOOLEAN NOT NULL DEFAULT FALSE,
    enrolled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Recovery codes (roadmap T2.2): ten single-use codes per enrollment,
-- shown once at enrollment/regeneration. Only a salted SHA-256 hash is
-- stored (code_hash = SHA-256(salt || code)); the plaintext code never
-- reaches the database. A used code is marked, never deleted, so reuse
-- is detectable and the row stays auditable.
CREATE TABLE mfa_recovery_codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    code_salt TEXT NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mfa_recovery_codes_user_id_idx ON mfa_recovery_codes(user_id);
-- MFA challenge (roadmap T2.3): the single-use, 10-minute token issued
-- by login after the password is verified for an MFA-enrolled account.
-- Same shape as password_reset_tokens by design: 32 random bytes,
-- base64url, SHA-256 hash only, consumed_reason single-use tracking.
-- Only the challenge holder may complete login; the challenge itself
-- grants nothing without a valid TOTP or recovery code.
-- password_hash binds the challenge to the credential login verified:
-- if the password changes or resets before the challenge is used
-- (reset, change, or transparent Argon2id migration), the stored hash
-- no longer matches the account's and the challenge is invalidated,
-- so a stale challenge can never issue a session. The value is the
-- same password hash already stored on users.password_hash (same
-- database, same access controls); it is a hash, never a password.
CREATE TABLE mfa_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash BYTEA NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    consumed_reason TEXT CHECK (consumed_reason IN ('used', 'superseded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mfa_challenges_user_id_idx ON mfa_challenges(user_id);
-- Down Migration
DROP TABLE mfa_challenges;
DROP TABLE mfa_recovery_codes;
DROP TABLE user_mfa;
