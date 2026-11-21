-- Up Migration
--
-- Row-level security, defence-in-depth (roadmap T2.5; docs/RowLevelSecurity.md).
-- The application still binds every user-data query to its JWT user_id;
-- these policies are the backstop for a forgotten WHERE in a future
-- route. Each policy scopes rows to the per-transaction setting
-- `app.user_id`, set by backend/src/db/userContext.js (`withUser`) and
-- read here with current_setting(..., true): the two-argument form
-- returns NULL instead of erroring when no context is set, so a query
-- without a context sees zero rows and a write without one fails its
-- WITH CHECK — there is no permissive fallback. The NULLIF guard is
-- load-bearing: once a session has set the variable (even
-- transaction-locally), PostgreSQL keeps the entry and it reverts to
-- an empty string after COMMIT, not NULL — and ''::integer would raise
-- 22P02 instead of matching nothing. NULLIF turns '' back into NULL.
--
-- FORCE ROW LEVEL SECURITY is deliberate: it applies the policies to the
-- table owner as well, so owner-context tooling (migrations, the Neon
-- console, pg_dump) is subject to the same rules. Consequence, verified
-- on disposable PostgreSQL 18.6: pg_dump run as a non-superuser owner
-- FAILS LOUDLY (exit 1, "query would be affected by row-level security
-- policy") and leaves an incomplete dump — pg_dump sets row_security=off,
-- which FORCE overrides for the owner — while a COPY-based extract as
-- owner with no context silently yields zero rows. Before any
-- owner-context copy or dump, run
-- `ALTER TABLE <table> NO FORCE ROW LEVEL SECURITY` on the seven tables
-- and re-enable it afterwards (see docs/RowLevelSecurity.md).
-- Owner tooling note: backend/scripts/db/rotate-mfa-key.js reads and
-- rewrites user_mfa rows as the owner with no user context, so under
-- FORCE RLS it needs the same NO FORCE / re-FORCE dance on user_mfa.
--
-- Scope is the seven user-data tables whose rows are only ever read or
-- written for the authenticated user. Fourteen App tables carry a user_id
-- column; the other seven are deliberately NOT covered:
-- `users` (no user_id column — its own id; registration / verification /
-- reset run unauthenticated or token-derived; it holds email,
-- password_hash and first_name / last_name);
-- email_verification_tokens and password_reset_tokens (looked up by
-- token hash before the user is known; hash + single-use + app checks);
-- auth_sessions (looked up by session id; the login flow that creates
-- them runs before any user context exists);
-- mfa_challenges (looked up by token hash before the user is known, so
-- no context exists to scope by — backend/src/routes/mfaRoutes.js and
-- backend/src/services/mfaService.js resolve the owner from the token);
-- user_passkeys (looked up by credential_id before the user is known;
-- the login flow reads/updates the row before any context exists);
-- webauthn_challenges (looked up by challenge before the user is known;
-- backend/src/utils/webauthn.js:96 resolves the owner from the challenge);
-- security_events (Main's audit table; user_id is populated for
-- authenticated events but NULL for unauthenticated ones, and audit rows
-- must be writable with no user context).
-- Rate-limit and licensed-cache/usage/limits tables carry no user_id
-- (anonymous, IP-keyed writes). Bible/Commentary tables have no
-- per-user rows and no RLS.
--
-- No grants change here: the policies mirror the existing app-role
-- grants exactly (notes/bookmarks/highlights SELECT/INSERT/UPDATE/
-- DELETE; user_reading_state, user_mfa, mfa_recovery_codes and
-- known_login_devices SELECT/INSERT/UPDATE and no DELETE — so none of
-- the four gets a DELETE policy; the UPDATE grants are column-scoped:
-- user_mfa enrolled/enrolled_at/secret_encrypted/key_version/
-- last_totp_step/mfa_generation/updated_at, mfa_recovery_codes used_at,
-- known_login_devices last_seen_at).
--
-- known_login_devices also gains the foreign key it was created
-- without, so deleting a user cascades their device rows instead of
-- leaving them behind (the other user tables already cascade).

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes FORCE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON notes FOR ALL
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks FORCE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON bookmarks FOR ALL
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);

ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE highlights FORCE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON highlights FOR ALL
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);

ALTER TABLE user_reading_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reading_state FORCE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_select ON user_reading_state FOR SELECT
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);
CREATE POLICY user_isolation_insert ON user_reading_state FOR INSERT
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);
CREATE POLICY user_isolation_update ON user_reading_state FOR UPDATE
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);

-- user_mfa, mfa_recovery_codes and known_login_devices hold the most
-- sensitive per-user material (TOTP secret, recovery-code hashes,
-- device HMAC keys). Same shape as user_reading_state — separate
-- SELECT / INSERT / UPDATE policies, no DELETE policy, mirroring the
-- grants exactly (no DELETE grant on any of the three).
ALTER TABLE user_mfa ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mfa FORCE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_select ON user_mfa FOR SELECT
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);
CREATE POLICY user_isolation_insert ON user_mfa FOR INSERT
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);
CREATE POLICY user_isolation_update ON user_mfa FOR UPDATE
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);

ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_recovery_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_select ON mfa_recovery_codes FOR SELECT
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);
CREATE POLICY user_isolation_insert ON mfa_recovery_codes FOR INSERT
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);
CREATE POLICY user_isolation_update ON mfa_recovery_codes FOR UPDATE
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);

ALTER TABLE known_login_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE known_login_devices FORCE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_select ON known_login_devices FOR SELECT
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);
CREATE POLICY user_isolation_insert ON known_login_devices FOR INSERT
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);
CREATE POLICY user_isolation_update ON known_login_devices FOR UPDATE
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);

-- Deletion path for device rows: the create migration
-- (20261109200233) defined no foreign key, so a deleted user's device
-- history survived indefinitely. Unnamed, matching the codebase's
-- inline unnamed-FK style (PostgreSQL names it
-- known_login_devices_user_id_fkey).
ALTER TABLE known_login_devices ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Down Migration

ALTER TABLE known_login_devices DROP CONSTRAINT known_login_devices_user_id_fkey;

DROP POLICY IF EXISTS user_isolation_update ON known_login_devices;
DROP POLICY IF EXISTS user_isolation_insert ON known_login_devices;
DROP POLICY IF EXISTS user_isolation_select ON known_login_devices;
ALTER TABLE known_login_devices NO FORCE ROW LEVEL SECURITY;
ALTER TABLE known_login_devices DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_isolation_update ON mfa_recovery_codes;
DROP POLICY IF EXISTS user_isolation_insert ON mfa_recovery_codes;
DROP POLICY IF EXISTS user_isolation_select ON mfa_recovery_codes;
ALTER TABLE mfa_recovery_codes NO FORCE ROW LEVEL SECURITY;
ALTER TABLE mfa_recovery_codes DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_isolation_update ON user_mfa;
DROP POLICY IF EXISTS user_isolation_insert ON user_mfa;
DROP POLICY IF EXISTS user_isolation_select ON user_mfa;
ALTER TABLE user_mfa NO FORCE ROW LEVEL SECURITY;
ALTER TABLE user_mfa DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_isolation_update ON user_reading_state;
DROP POLICY IF EXISTS user_isolation_insert ON user_reading_state;
DROP POLICY IF EXISTS user_isolation_select ON user_reading_state;
ALTER TABLE user_reading_state NO FORCE ROW LEVEL SECURITY;
ALTER TABLE user_reading_state DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_isolation ON highlights;
ALTER TABLE highlights NO FORCE ROW LEVEL SECURITY;
ALTER TABLE highlights DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_isolation ON bookmarks;
ALTER TABLE bookmarks NO FORCE ROW LEVEL SECURITY;
ALTER TABLE bookmarks DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_isolation ON notes;
ALTER TABLE notes NO FORCE ROW LEVEL SECURITY;
ALTER TABLE notes DISABLE ROW LEVEL SECURITY;
