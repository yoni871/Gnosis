# PostgreSQL migrations

Issue #11 establishes schema history, not schema repairs or deployment automation.
The application still uses its existing `pg` pool. Migrations use a separate client
and are never run at application startup, in requests, or during frontend builds.

## Approved schema and adoption gate

`database/migrations/` is authoritative. The owner approved the shared 11-table
application schema after private local/Neon schema-only review. The initial
`20261023000000_baseline.sql` now includes nullable `users.first_name` and
`users.last_name` as varchar(100), without defaults, plus named unique constraints
`unique_book_chapter (book_id, chapter_number)` and
`unique_chapter_translation_verse (chapter_id, translation_id, verse_number)`.
These definitions support registration/profile queries, chapter importer upserts,
and the chapter/verse uniqueness documented in Technical_Design.md.

The baseline had never been adopted anywhere, so this correction is directly in
its CREATE TABLE definitions. Once adopted, never edit an applied migration.
`database/schema.sql` mirrors the initial blueprint for reference only; use
versioned migrations for initialization and upgrades. Imports and seeds remain
separate; migrations do not populate Bible/commentary content.

Private snapshots showed matching application definitions, two backup tables in
both databases, and one additional Neon demo table. Those auxiliary tables are
not application schema and must be preserved, not dropped or added to the baseline.
See [Auxiliary_Schema_Reconciliation.md](Auxiliary_Schema_Reconciliation.md) for
read-only checks and a separately authorized move into `gnosis_archive`.

**No merge, application database reconciliation, or baseline adoption is authorized
by this PR update.** Before adoption, an operator must review auxiliary table
counts, ownership, dependencies, destination conflicts and external consumers,
obtain execution approval, perform the reviewed preservation procedure, and run
fresh baseline/permissions checks. Do not bypass differences. Review snapshots
remain private outside Git; collection guidance is in
[Schema_Snapshot_Review.md](Schema_Snapshot_Review.md).

## Installation and explicit targets

Use Node 22 and `npm ci` from `backend/`. Stable `node-pg-migrate` is pinned at
8.0.4. All commands below run from `backend/` and require `--target`.
No command silently falls back to the application's DATABASE_URL.

- `local`: exclusively requires MIGRATION_DB_HOST (loopback only),
  MIGRATION_DB_PORT, MIGRATION_DB_NAME, MIGRATION_DB_USER and
  MIGRATION_DB_PASSWORD. All five must be nonempty; missing settings fail closed
  and name only the missing variables. No DB_* or DATABASE_URL fallback is used.
  Only this target loads backend/.env; existing environment values take precedence.
  Production-looking database names are refused.
- `test`: requires MIGRATION_TEST_DATABASE_URL, with an IP loopback host and a
  name matching `gnosis_migration_test_` plus 16 lowercase hexadecimal characters.
  URL query options are forbidden. Never use a real application's database.
- `production`: requires MIGRATION_DATABASE_URL injected by a secret manager,
  pointing to the direct Neon endpoint with sslmode=verify-full. Pooled Neon
  endpoints are refused. Writes additionally require MIGRATION_CONFIRM_PRODUCTION
  set to `yes`. Do not set that flag in routine application/preview environments.

Application DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD remain exclusively
application settings. Add the five MIGRATION_DB_* variables privately using
backend/.env.example as the key reference. Select an authorized migration/operator
role; do not grant extra privileges to bible_app. Changing DB_USER or PGUSER does
not select the local migration role. This separation does not authorize adoption
or permission changes. Test MIGRATION_TEST_DATABASE_URL and production
MIGRATION_DATABASE_URL behavior are unchanged.

Never paste credentials into shell history, logs, issues, or committed files.
Do not disable TLS verification. Driver messages are suppressed because they can
include private connection details. CLI check output is structural metadata only.

## Initialize an empty local database

Create/select an empty local database using your normal local PostgreSQL tools,
then configure the MIGRATION_DB_* variables described above.

```sh
npm run db:migrate:check -- --target local
npm run db:migrate -- --target local
```

The first run creates schema objects and tracking; later runs apply only pending
migrations. An existing untracked schema is refused, even if it is only partial.
A failed first batch may leave an empty migration tracking table, but no baseline
DDL; it is safe to retry after resolving the failure.

## Adopt an existing local database

```sh
npm run db:migrate:check -- --target local
npm run db:migrate:baseline -- --target local
npm run db:migrate:check -- --target local
```

Check is read-only apart from session settings and an advisory lock; it does not
create a history table. It lists applied/pending migrations and structural
differences. Check validates the live schema against the baseline plus the
catalog delta of every migration actually applied to that database, so a
correctly migrated database reports `baselineMatches: true` and `differences: []`
even though it differs from the *initial* baseline. `pending` separately reports
migrations not yet applied; `differences` reports drift from the applied state,
not merely distance from the baseline.

`baselineMatches: true` certifies structure, not permission to adopt. When the
schema matches, check also reports `adoptionLockPrivileges`: SHARE table locks
require UPDATE, DELETE or TRUNCATE on **every** application table. SELECT alone
is insufficient, even if the role can CREATE in public. This flag is null when
the schema differs; true covers only the lock prerequisite, not all write or
operational prerequisites. Use an authorized operator/migration role for adoption.
Do not grant extra application privileges or weaken the SHARE locks to force it.

Failures identify a safe stage: connection, session setup, locking, history/schema
validation, table locking, transaction begin, revalidation, history creation,
fake-runner (or migration runner), commit, or cleanup. Only fixed reason labels
are emitted for recognized error codes; raw driver messages, SQL, stacks and
connection details remain suppressed. A read-only session can pass the structure
check but fail at history creation; inspect the intended settings rather than
automatically overriding read-only mode. A commit failure can have an uncertain
outcome: check history before retrying. Cleanup failures retain the primary stage;
if commit succeeded, the error explicitly says the operation completed so an
operator does not accidentally repeat adoption.

Adoption requires an exact public-schema match against baseline.catalog.json.
That is the baseline command's rule only: adoption is for untracked baseline
schemas, so it compares against the baseline catalog alone. The check command
compares against the baseline plus the deltas of the migrations actually
applied, as described above.
Comparison includes columns/defaults, constraints, indexes, sequences and their
ownership, functions, triggers, relation options, views, rules, policies, types,
and inheritance. It intentionally excludes row data, sequence current values,
object owners, grants, schema ACLs, and operational metadata outside `public`.
Review roles, grants, extensions, and non-public schemas separately with an
operator; the comparison is not a permissions or database-wide security audit.
The manifest is generated from the baseline in isolated PostgreSQL 14 and checked
against the SQL in integration tests. Each post-baseline delta is generated the
same way, by diffing the catalog before and after applying that migration, and
is likewise pinned by the integration suite on PostgreSQL 14 and 18. PostgreSQL 18 additionally records validated
NOT NULL constraints in pg_constraint; these redundant rows are omitted because column attnotnull is
already compared on both versions. Unvalidated NOT NULL constraints remain in the
comparison. All other constraints and column nullability remain strictly checked.
Any other representation mismatch must be reviewed, never bypassed.

Adoption takes the shared migration advisory lock, validates first, then locks the
baseline tables briefly and validates again in a transaction. In that transaction
it uses node-pg-migrate's fake mode with count=1 to record **only the baseline**.
The wrapper owns BEGIN/COMMIT/ROLLBACK for adoption; the runner receives
`singleTransaction: false` and `noLock: true`. In pinned 8.0.4, fake mode only
inserts migration history and skips its normal transaction branch. The outer
advisory lock remains held until after commit/rollback, and table locks remain
held until transaction completion. Ordinary up/down transactions are owned by the
runner; their advisory lock is still owned by the wrapper.
No baseline DDL is executed. Future migrations remain pending. An adoption failure
rolls back all tracking changes. Existing history refuses adoption.

Use a maintenance window with **no concurrent manual DDL** during adoption.
Advisory locks serialize these commands, not arbitrary administrator sessions.
The brief table locks also block application writes while adoption is checked.

## Write and run future migrations

```sh
npm run db:migrate:create -- --target local add_example_field
npm run db:migrate -- --target local
```

Creation is file-only and never connects to a database. Names use UTC timestamps;
ensure timestamps are unique and ordered before merging concurrent work. Only
versioned SQL files belong in the migration directory. Use `-- Up Migration` and
`-- Down Migration` sections. Never edit, rename, or remove an applied migration;
ship a new corrective migration instead. History is validated against the exact
ordered filename prefix; SQL content immutability remains a code-review rule.

Every post-baseline migration ships a `<name>.catalog.json` delta file in
`database/migration-catalogs/`: the catalog rows it adds or changes, plus the
`kind:name` keys it removes, generated by diffing the catalog before and after
applying that migration. The delta lives outside the migrations directory
because the runner scans every file there; only versioned SQL files belong in
the migration directory. Check loads the baseline catalog plus the deltas of
the migrations actually applied to the target database; without a current
delta, that migration's objects appear as differences. Never hand-edit a delta:
regenerate it from the migration SQL. The integration suite regenerates every
delta from the migration files and pins the committed files, so a migration
cannot ship without a current delta. The baseline itself has no delta file; its
manifest is `database/baseline.catalog.json`.

Normal runs use one transaction for the pending batch and PostgreSQL advisory
locking. A competing runner fails safely and must retry later. Lock waits are
bounded at five seconds; statements at sixty seconds. Do not put BEGIN/COMMIT or
transaction-disabling directives inside SQL migrations. Nontransactional changes
(such as CREATE INDEX CONCURRENTLY) need a separately approved procedure; this
wrapper does not offer a nontransactional escape hatch.

## Deployment and later Neon adoption — operator only

This feature does not connect to Neon, run production migrations, or configure CI.
Issue #12 owns CI. Do not attach migrations to Vercel build/start commands or
preview deployments. The intended release order is:

1. Test the exact commit using an isolated PostgreSQL database. Review SQL and
   backward compatibility with the currently deployed application.
2. An authorized operator obtains reviewed schema-only metadata, confirms the
   intended Neon project/branch/database and direct TLS connection, and checks
   backups/recovery availability. Never export row data or secrets into Git.
3. During an appropriate window, run the following read-only check with the
   production migration connection securely injected:

   ```sh
   npm run db:migrate:check -- --target production
   ```

4. If any baseline difference exists, **stop**. Review and approve reconciliation
   separately; do not drop existing objects or invent migration history.
5. Only after those reviews and explicit production authorization, set the write
   confirmation flag in the secure release environment and run:

   ```sh
   npm run db:migrate:baseline -- --target production
   npm run db:migrate:check -- --target production
   npm run db:migrate -- --target production
   ```

6. A single release job/operator runs migrations before the compatible application
   deployment. Stop the release on failure. Verify tracking and application health;
   remove the confirmation flag afterward. Keep migration privileges confined to
   the release role rather than the routine application role.

The current baseline may refuse Neon; compatibility cannot be certified without
that later operator comparison. Preparing these commands is not authorization to
run them against production.

## Rollback and recovery

Transactional failure rolls back schema changes and history in the pending batch.
The tool may have created an empty tracking table before the batch; that is not a
partially applied baseline. Inspect check output before retrying.

Prefer a forward corrective migration. For a reviewed, data-safe reversal locally:

```sh
npm run db:migrate:down -- --target local
```

This reverses exactly one migration. The baseline is irreversible both in the
wrapper and its SQL; it cannot drop the application schema. A down migration
cannot recover deleted data. Never use automatic down operations in deployment.

Use additive expand/contract changes across releases so older application code
can keep running. Before destructive changes, confirm a usable backup or Neon
recovery point and retention settings, document the restore procedure, and test
it away from production. If committed data is lost, stop writes and have an
operator restore to a separate recovery database/branch, validate it, then plan a
controlled cutover. Restore tooling, production recovery, and destructive schema
reconciliation are outside this issue. Never manually delete history to force a
rerun or baseline acceptance.

## Focused tests

No external email/API calls and no Neon connections occur. There is no new CI or
frontend test framework. Tests use Node's built-in runner and **destroy public** in
the explicitly selected disposable database, so never reuse an application DB.

Start a fresh local PostgreSQL cluster on a dedicated loopback port and create a
fresh database named `gnosis_migration_test_` plus 16 random lowercase hex digits.
Use initdb/pg_ctl/createdb with explicit local host/port; do not use production
settings or point to a normal local application database. Securely set
MIGRATION_TEST_DATABASE_URL to this disposable database without printing it.

```sh
npm run test:migrations -- --target test
```

Missing configuration fails rather than skipping integration tests. Remote hosts,
localhost DNS names, production-looking names and URL overrides are refused
before connecting. Stop and remove your disposable cluster after the test run.
The integration suite covers initialization/no-op reruns, exact adoption and data/
sequence preservation, partial/drift refusal, pending migrations left unmarked,
transactional rollback/retry, reversible down and irreversible baseline, advisory
lock contention, invalid history, search triggers, and credential-safe CLI errors.
The suite also covers registration/profile name queries, chapter and verse
uniqueness, valid Bible/commentary imports, personal study queries and cascades,
and meaningful drift rejection. Run the same suite against disposable PostgreSQL
14 and 18 databases; the manifest is generated from 14 and must match both.
Public npm CLI regression tests additionally exercise the local target, partial
application-role lock grants, operator adoption, read-only history creation,
tracking rollback and credential-safe diagnostics. These tests create and remove
a temporary login role inside the disposable cluster, so the test role needs
CREATEROLE (the isolated initdb owner/synthetic container operator has it).

Example disposable setup (run from `backend/`; choose an unused dedicated port):

```sh
migration_test_root=$(mktemp -d "${TMPDIR:-/tmp}/gnosis-migration-tests.XXXXXX")
migration_test_name="gnosis_migration_test_$(node -e "process.stdout.write(require('node:crypto').randomBytes(8).toString('hex'))")"
initdb -D "$migration_test_root/cluster" -A trust --no-locale -E UTF8
pg_ctl -D "$migration_test_root/cluster" -l "$migration_test_root/server.log" -o "-h 127.0.0.1 -p 55439 -k $migration_test_root" start
createdb -h 127.0.0.1 -p 55439 -U "$(id -un)" "$migration_test_name"
export GNOSIS_DISPOSABLE_TEST_NAME="$migration_test_name"
node <<'JS'
const { spawnSync } = require('node:child_process');
const connection = new URL('postgresql://127.0.0.1');
connection.port = '55439';
connection.username = require('node:os').userInfo().username;
connection.pathname = '/' + process.env.GNOSIS_DISPOSABLE_TEST_NAME;
const result = spawnSync('npm', ['run', 'test:migrations', '--', '--target', 'test'], {
    env: { ...process.env, MIGRATION_TEST_DATABASE_URL: connection.href },
    stdio: 'inherit'
});
process.exitCode = result.status ?? 1;
JS
pg_ctl -D "$migration_test_root/cluster" stop
unset GNOSIS_DISPOSABLE_TEST_NAME
```

This creates a separate trust-authenticated cluster restricted to loopback for
synthetic tests. Stop it even if tests fail; remove only that newly created
`migration_test_root` directory afterward. Do not use trust authentication for
application or shared databases. No connection string is printed by this example.
