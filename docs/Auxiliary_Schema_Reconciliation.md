# One-time auxiliary table preservation — operator only

The approved application baseline contains 11 application tables. Private schema
review identified these auxiliary tables in public:

| Table | Expected location |
| --- | --- |
| commentary_entries_jfb_backup_20260918 | Local and Neon |
| commentary_entries_mh_backup_20260918 | Local and Neon |
| playing_with_neon | Neon only |

Preserve them in `gnosis_archive`, including their contents. Do not delete them,
include them in the application baseline, or silently exclude arbitrary public
objects from baseline comparison. This procedure is intentionally outside normal
migrations: existing databases must reconcile public before baseline adoption,
and fresh databases do not need these historical objects.

**Nothing below has been executed against either application database.** Schema
approval permits preparing this procedure only. Execution requires a later
operator review and explicit approval of the target and exact move plan. Keep
counts, ownership details, dependency results and external-reference findings
private; never publish raw snapshots or connection settings.

## Read-only preflight

Use the intended database's existing approved read-only connection, not commands
containing connection URLs. Run through psql with `-X --set=ON_ERROR_STOP=1`.
The operator should confirm current_database/current_user privately, recovery
availability, sufficient catalog visibility, and an appropriate maintenance window.

```sql
BEGIN READ ONLY;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT current_database(), current_user, current_setting('server_version');

-- Presence, ownership, relation kind and row security (counts need full visibility).
SELECT n.nspname, c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
 'commentary_entries_jfb_backup_20260918',
 'commentary_entries_mh_backup_20260918', 'playing_with_neon');

-- Exact counts. Execute generated SELECTs only; no row contents are exported.
SELECT format('SELECT %L AS table_name, count(*) AS row_count FROM %I.%I;',
              c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN (
 'commentary_entries_jfb_backup_20260918',
 'commentary_entries_mh_backup_20260918', 'playing_with_neon')
ORDER BY c.relname
\gexec

-- Inspect destination owner/ACL and every existing destination object.
-- This includes potential table, index, sequence and composite-type collisions.
SELECT nspname, pg_get_userbyid(nspowner) AS owner, nspacl
FROM pg_namespace WHERE nspname = 'gnosis_archive';
SELECT c.relname, c.relkind
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='gnosis_archive' ORDER BY c.relname;
SELECT t.typname, t.typtype
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='gnosis_archive' ORDER BY t.typname;

-- Dependencies in both directions, including column dependencies and owned
-- sequences/indexes. Review each result; presence alone does not imply breakage.
WITH targets AS (
 SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN (
  'commentary_entries_jfb_backup_20260918',
  'commentary_entries_mh_backup_20260918', 'playing_with_neon')
)
SELECT DISTINCT d.deptype,
 pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent,
 pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) AS referenced
FROM pg_depend d
WHERE (d.refclassid='pg_class'::regclass AND d.refobjid IN (SELECT oid FROM targets))
   OR (d.classid='pg_class'::regclass AND d.objid IN (SELECT oid FROM targets))
ORDER BY dependent, referenced;

-- Text references can lack dependency records, especially dynamic SQL and
-- string-bodied functions. Inspect results privately: definitions can hold secrets.
WITH definitions AS (
 SELECT 'function' AS kind, p.oid::regprocedure::text AS object,
        pg_get_functiondef(p.oid) AS definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prokind IN ('f','p') AND n.nspname !~ '^pg_'
   AND n.nspname <> 'information_schema'
 UNION ALL
 SELECT 'view', schemaname || '.' || viewname, definition FROM pg_views
 WHERE schemaname !~ '^pg_' AND schemaname <> 'information_schema'
 UNION ALL
 SELECT 'materialized view', schemaname || '.' || matviewname, definition FROM pg_matviews
 UNION ALL
 SELECT 'rule', schemaname || '.' || tablename || '.' || rulename, definition FROM pg_rules
)
SELECT kind, object FROM definitions
WHERE definition ~* 'commentary_entries_(jfb|mh)_backup_20260918|playing_with_neon';
COMMIT;
```

Stop if an expected table is missing, counts are unavailable/filtered, a name or
type conflicts, or ownership/dependencies are unexplained. Review attached indexes,
owned sequences and their destination names from dependency results. Review any
existing destination schema's privileges before approving it; do not automatically
reuse a schema with unknown ownership or access. A failed/timed-out query is not
evidence of no rows or no dependencies.

Database catalogs cannot prove absence of external references. Before execution,
the operator must inspect other applications, SQL scripts, scheduled jobs,
reporting tools, saved queries and dynamic SQL, and obtain confirmation from their
owners. A read-only starting point in each relevant source checkout is:

```sh
rg -n --hidden -g '!.git/**' -g '!node_modules/**' -g '!**/.env*' \
  'commentary_entries_(jfb|mh)_backup_20260918|playing_with_neon' .
```

Review search results privately and distinguish procedural documentation from
actual consumers. The current Gnosis application/importer code has no references,
but that does not certify other consumers. Resolve consumers that use public or
unqualified names before moving; do not add gnosis_archive to application search
paths or create compatibility objects in public without a separately reviewed plan.

## Proposed move — do not run before execution approval

Use the confirmed owning/operator role. No row updates or ownership changes are
needed. If preflight confirms that the destination does not exist, the exact plan
for both databases is:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE SCHEMA gnosis_archive;
REVOKE ALL ON SCHEMA gnosis_archive FROM PUBLIC;
LOCK TABLE public.commentary_entries_jfb_backup_20260918,
           public.commentary_entries_mh_backup_20260918 IN ACCESS EXCLUSIVE MODE;
-- Recount under these locks and retain counts privately before the moves.
SELECT count(*) FROM public.commentary_entries_jfb_backup_20260918;
SELECT count(*) FROM public.commentary_entries_mh_backup_20260918;
ALTER TABLE public.commentary_entries_jfb_backup_20260918 SET SCHEMA gnosis_archive;
ALTER TABLE public.commentary_entries_mh_backup_20260918 SET SCHEMA gnosis_archive;
-- On Neon ONLY, additionally run the following within this transaction:
-- LOCK TABLE public.playing_with_neon IN ACCESS EXCLUSIVE MODE;
-- SELECT count(*) FROM public.playing_with_neon;
-- ALTER TABLE public.playing_with_neon SET SCHEMA gnosis_archive;

SELECT count(*) FROM gnosis_archive.commentary_entries_jfb_backup_20260918;
SELECT count(*) FROM gnosis_archive.commentary_entries_mh_backup_20260918;
-- Neon ONLY: SELECT count(*) FROM gnosis_archive.playing_with_neon;
-- Verify equal counts, ownership, dependency resolution and sequence ownership.
-- ROLLBACK on any discrepancy; COMMIT only after those checks pass.
```

The script deliberately leaves the transaction open for verification and an
explicit COMMIT or ROLLBACK. If gnosis_archive already exists, stop and approve a
revised plan rather than substituting CREATE SCHEMA IF NOT EXISTS. The table move
also moves associated indexes, constraints and column-owned sequences. Existing
object ownership and table ACLs persist; review intended archive access explicitly.

After commit, repeat the private count/ownership/dependency checks with the archive
schema selected, verify `playing_with_neon_id_seq` remains owned by the archived
table's id column on Neon, and confirm the auxiliary names are absent from public.
Then run the migration tool's read-only check and separately review permissions,
extensions and non-public schemas. Approve baseline adoption only when public
matches exactly. Do not mark history manually. Reconciliation and baseline
adoption remain separate actions; this document authorizes neither.
