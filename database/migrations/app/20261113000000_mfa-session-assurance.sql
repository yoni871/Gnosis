-- Up Migration
-- Existing sessions have not proven MFA and must not acquire assurance
-- merely because an authenticator was later enrolled.
ALTER TABLE auth_sessions ADD COLUMN mfa_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth_sessions ADD COLUMN mfa_generation UUID;
ALTER TABLE user_mfa ADD COLUMN mfa_generation UUID NOT NULL DEFAULT gen_random_uuid();

-- Down Migration
ALTER TABLE user_mfa DROP COLUMN mfa_generation;
ALTER TABLE auth_sessions DROP COLUMN mfa_generation;
ALTER TABLE auth_sessions DROP COLUMN mfa_verified;
