-- Up Migration
-- MFA encryption-key versioning (design §3.2): records which key
-- version encrypted each TOTP secret, so a rotation can decrypt a
-- mixed population — old rows via MFA_ENCRYPTION_KEY_PREVIOUS, new
-- rows via MFA_ENCRYPTION_KEY. Version 1 is the original
-- MFA_ENCRYPTION_KEY; version 2 is the first rotation. Without this
-- column, a rotation orphans every enrolled secret (the "re-enrollment
-- required" outcome the design replaces).
ALTER TABLE user_mfa ADD COLUMN key_version INTEGER NOT NULL DEFAULT 1;
COMMENT ON COLUMN user_mfa.key_version IS 'MFA encryption key version: 1 is the original MFA_ENCRYPTION_KEY, 2 is the first rotation (see MFA-Recovery-Key-Rotation-Design.md §3).';
-- Down Migration
ALTER TABLE user_mfa DROP COLUMN key_version;
