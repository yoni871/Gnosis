-- Least-privilege audit for one Neon branch (Gnosis, gnosis-bible, or
-- gnosis-commentary; production or preview).
--
-- READ-ONLY. Run as the project owner (neondb_owner) in the Neon console
-- SQL Editor, one branch at a time. Nothing here writes, grants, revokes,
-- or creates anything. Compare the output against the expected grant set
-- for the branch's runtime role(s):
--   * App (Gnosis project): gnosis_app (production) / gnosis_preview_app
--     (preview, until the §13 swap) — see NeonInfrastructureSetup.md §11.
--   * Bible: gnosis_bible_app / gnosis_bible_preview_app — SELECT only.
--   * Commentary: gnosis_commentary_app / gnosis_commentary_preview_app —
--     SELECT only.
-- Any row outside the expected set is a finding: an over-privileged role,
-- a stray membership, a PUBLIC grant, or a default ACL that grants more
-- than the owner.
--
-- Q1 — Role attributes. Runtime roles must be NOLOGIN until enabled, and
-- must never be superuser / CREATEROLE / CREATEDB / REPLICATION. The
-- owner (neondb_owner) legitimately holds CREATEROLE/CREATEDB/REPLICATION.

SELECT rolname, rolsuper, rolinherit, rolcreatedb, rolcreaterole, rolcanlogin,
       rolreplication
FROM pg_roles
ORDER BY rolname;

-- Q2 — Role memberships. A runtime role must be a member of at most its
-- own project role (e.g. gnosis_preview_app_next is a member of
-- gnosis_app). Membership in neon_superuser is the known preview finding:
-- it cannot be revoked in place (the owner lacks ADMIN OPTION), which is
-- why the fix is a clean replacement role, not a REVOKE.

SELECT r.rolname AS role, m.rolname AS member_of
FROM pg_roles r
JOIN pg_auth_members am ON am.member = r.oid
JOIN pg_roles m ON m.oid = am.roleid
ORDER BY 1, 2;

-- Q3 — Table-level grants per grantee. Bible/Commentary runtime roles
-- must show SELECT only. The App runtime role shows the staged set from
-- §11 (SELECT/INSERT/UPDATE/DELETE exactly where the feature docs say).

SELECT grantee, table_schema, table_name,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE grantee <> 'PUBLIC'
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- Q4 — Column-level UPDATE grants. These are the sensitive ones: the App
-- runtime role must hold exactly six UPDATE column pairs (users
-- email_verified_at + password_hash; email_verification_tokens and
-- password_reset_tokens used_at + consumed_reason) and must NOT hold
-- UPDATE on token_hash, expires_at, or users.email.

SELECT grantee, table_schema, table_name, column_name
FROM information_schema.role_column_grants
WHERE privilege_type = 'UPDATE'
ORDER BY 1, 2, 3, 4;

-- Q5 — USAGE grants (schemas, sequences, types). Runtime roles need USAGE
-- on the public schema and on the sequences their INSERTs use. Anything
-- else is a finding.

SELECT grantee, object_schema, object_name, object_type,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_usage_grants
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3;

-- Q6 — PUBLIC grants. Expect zero rows. Any PUBLIC grant on a table or
-- column is a finding.

SELECT grantee, table_name FROM information_schema.role_table_grants
WHERE grantee = 'PUBLIC'
UNION ALL
SELECT grantee, table_name FROM information_schema.role_column_grants
WHERE grantee = 'PUBLIC'
ORDER BY 1, 2;

-- Q7 — Default privileges. Expect zero rows (or owner-only entries).
-- A default ACL that grants to a runtime role or PUBLIC would silently
-- widen every future table.

SELECT defaclrole::regrole AS role, defaclnamespace::regnamespace AS schema,
       defaclobjtype AS objtype, defaclacl AS acl
FROM pg_default_acl
ORDER BY 1, 2, 3;

-- Q8 — Public table count (sanity: 0 on the empty Bible/Commentary
-- production branches; 15 on Gnosis production at the 1853b92 baseline).

SELECT count(*) AS public_table_count
FROM information_schema.tables
WHERE table_schema = 'public';
