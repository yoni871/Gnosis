-- Phase 1 controls #8/#9: supplemental catalog evidence for one database.
-- READ ONLY. Run as an authorized metadata-reading operator on each of the
-- App, Bible and Commentary Preview/Production branches, alongside
-- least-privilege-audit.sql. Do not include secrets, connection URLs, data
-- rows, pg_shadow, pg_authid, or pg_stat_activity in the evidence bundle.
BEGIN TRANSACTION READ ONLY;

-- Identify the connected database and role. Project/branch identity must
-- also be attested in Neon; current_database() alone is not unique.
SELECT current_database() AS database_name, current_user AS connected_role,
       session_user AS login_role, current_setting('server_version') AS server_version;

-- Database ACLs, including PUBLIC (grantee OID 0). Unexpected CREATE or
-- CONNECT should be reviewed against the approved role matrix.
SELECT d.datname AS database_name,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END AS grantee,
       a.privilege_type, a.is_grantable
FROM pg_database d
CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) a
LEFT JOIN pg_roles gr ON gr.oid = a.grantee
WHERE d.datname = current_database()
ORDER BY grantee, a.privilege_type;

-- Schema ACLs. A runtime role needs USAGE on its required schemas, not CREATE.
SELECT n.nspname AS schema_name,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END AS grantee,
       a.privilege_type, a.is_grantable
FROM pg_namespace n
CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
LEFT JOIN pg_roles gr ON gr.oid = a.grantee
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
ORDER BY n.nspname, grantee, a.privilege_type;

-- All explicit/effective sequence ACL entries, not only information_schema
-- USAGE grants. Compare USAGE/SELECT/UPDATE to actual INSERT requirements.
SELECT n.nspname AS schema_name, c.relname AS sequence_name,
       pg_get_userbyid(c.relowner) AS owner_role,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END AS grantee,
       a.privilege_type, a.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('S', c.relowner))) a
LEFT JOIN pg_roles gr ON gr.oid = a.grantee
WHERE c.relkind = 'S' AND n.nspname NOT LIKE 'pg_%'
ORDER BY n.nspname, c.relname, grantee, a.privilege_type;

-- Object ownership and RLS flags, without reading any table contents.
SELECT n.nspname AS schema_name, c.relname AS object_name,
       c.relkind AS object_kind, pg_get_userbyid(c.relowner) AS owner_role,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
ORDER BY n.nspname, c.relname;

-- Role-level configuration can silently alter search_path or row_security.
SELECT r.rolname AS role_name, d.datname AS database_name,
       split_part(config_item.setting_text, '=', 1) AS setting_name
FROM pg_db_role_setting s
LEFT JOIN pg_roles r ON r.oid = s.setrole
LEFT JOIN pg_database d ON d.oid = s.setdatabase
CROSS JOIN LATERAL unnest(s.setconfig) AS config_item(setting_text)
ORDER BY role_name, database_name, setting_name;

COMMIT;
