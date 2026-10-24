# PostgreSQL migrations

Issue #11 establishes schema history, not schema repairs or deployment automation.
The application still uses its existing `pg` pool. Migrations use a separate client
and are never run at application startup, in requests, or during frontend builds.

## Authority and known discrepancies

`database/migrations/` is authoritative. The first migration,
`20261023000000_baseline.sql`, preserves the previously committed schema exactly.
There were no earlier migrations. `database/schema.sql` is historical reference
only: do not execute it for initialization or upgrades. Content imports and seeds
are separate operations; migrations do not import Bible/commentary content.

The baseline does **not** certify that local or Neon schemas match the repository.
Known discrepancies are deliberately unrepaired:

- Authentication reads/writes `users.first_name` and `users.last_name`, which the
  recorded schema lacks. Their actual types/defaults are not known from source.
- The chapter importer uses `ON CONFLICT (book_id, chapter_number)`, but the
  recorded schema lacks that unique constraint.
- Technical_Design.md describes chapter and verse uniqueness not fully present
  in schema.sql and contains outdated deployment information.

A database containing those additions will correctly fail baseline adoption.
Stop, review schema-only metadata, and obtain approval for reconciliation before
adoption. Do not bypass the check, remove existing columns/constraints, or claim
this baseline makes a fresh database fully compatible with all application code.
No actual application database was inspected to construct this baseline.

## Installation and explicit targets

Use Node 22 and `npm ci` from `backend/`. Stable `node-pg-migrate` is pinned at
8.0.4. All commands below run from `backend/` and require `--target`.
No command silently falls back to the application's DATABASE_URL.

- `local`: requires DB_HOST (loopback only), DB_PORT, DB_NAME, DB_USER and, if
  needed, DB_PASSWORD. Only this target loads backend/.env; existing environment
  values take precedence. Production-looking database names are refused.
- `test`: requires MIGRATION_TEST_DATABASE_URL, with an IP loopback host and a
  name matching `gnosis_migration_test_` plus 16 lowercase hexadecimal characters.
  URL query options are forbidden. Never use a real application's database.
- `production`: requires MIGRATION_DATABASE_URL injected by a secret manager,
  pointing to the direct Neon endpoint with sslmode=verify-full. Pooled Neon
  endpoints are refused. Writes additionally require MIGRATION_CONFIRM_PRODUCTION
  set to `yes`. Do not set that flag in routine application/preview environments.

Never paste credentials into shell history, logs, issues, or committed files.
Do not disable TLS verification. Driver messages are suppressed because they can
include private connection details. CLI check output is structural metadata only.

## Initialize an empty local database

Create/select an empty local database using your normal local PostgreSQL tools,
then configure the DB_* variables described above.

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
create a history table. It lists applied/pending migrations and baseline structural
differences. After future migrations, differences from the *initial* baseline are
expected; this field is not a general latest-schema drift detector.

Adoption requires an exact public-schema match against baseline.catalog.json.
Comparison includes columns/defaults, constraints, indexes, sequences and their
ownership, functions, triggers, relation options, views, rules, policies, types,
and inheritance. It intentionally excludes row data, sequence current values,
object owners, grants, schema ACLs, and operational metadata outside `public`.
Review roles, grants, extensions, and non-public schemas separately with an
operator; the comparison is not a permissions or database-wide security audit.
The manifest is generated from the baseline in isolated PostgreSQL 14 and checked
against the SQL in integration tests. Different PostgreSQL major versions can
format definitions differently: a false mismatch must be reviewed, never bypassed.

Adoption takes the shared migration advisory lock, validates first, then locks the
baseline tables briefly and validates again in a transaction. In that transaction
it uses node-pg-migrate's fake mode with count=1 to record **only the baseline**.
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
Known schema discrepancies are asserted as unchanged, not repaired.

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
