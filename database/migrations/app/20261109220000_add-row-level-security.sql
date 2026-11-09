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
-- `ALTER TABLE <table> NO FORCE ROW LEVEL SECURITY` on the four tables
-- and re-enable it afterwards (see docs/RowLevelSecurity.md).
--
-- Scope is the four user-data tables only. Deliberately NOT covered:
-- `users` (registration / verification / reset run unauthenticated or
-- token-derived); tokens and sessions (hash + single-use + app checks);
-- rate-limit and licensed-cache/usage/limits tables (anonymous,
-- IP-keyed writes with no user_id); `security_events` (Main's audit
-- table, written for unauthenticated events). Bible/Commentary tables
-- have no per-user rows and no RLS.
--
-- No grants change here: the policies mirror the existing app-role
-- grants exactly (notes/bookmarks/highlights SELECT/INSERT/UPDATE/
-- DELETE; user_reading_state SELECT/INSERT/UPDATE, no DELETE — so it
-- gets no DELETE policy).

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

-- Down Migration

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
