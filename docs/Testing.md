# Automated testing and CI

Use Node 22.14.0 and npm. Install reproducibly in both directories:

```sh
cd backend
npm ci
npm test
cd ../frontend
npm ci
npm test
npm run build:check
```

Backend tests use Node's built-in runner. All 20 existing authentication cases
remain, including missing JWT secret startup tests in development and production
modes. Database failures are stubbed in memory. The additional environment tests
use temporary files with synthetic values to prove isolation and normal dotenv
loading/precedence. No running application or PostgreSQL installation is needed.

Frontend tests use Vitest, jsdom, React Testing Library, jest-dom and user-event.
The small foundation suite verifies rendering, interaction, DOM assertions and
rejection of unexpected fetch requests. `npm run test:watch` enables watch mode.
Tests should mock requests explicitly; do not use real external services.
Setup cleans the DOM, browser storage, mocks and timers between tests.

### Frontend authentication races (issue #6)

`cd frontend && npm test` includes the eight generation-guard unit tests plus
rendered AuthProvider, LoginPage and RegisterPage regressions. All use Vitest;
there is no separate Node test command for the frontend guard tests now.
For just these tests, run:

```sh
npm test -- src/context/authSession.test.js src/context/AuthContext.test.jsx src/pages/LoginPage.test.jsx src/pages/RegisterPage.test.jsx
```

Provider tests control service promises explicitly to cover restoration, logout,
overlapping logins, registration's automatic login, stale successes/failures,
loading ownership, unmount/remount and React Strict Mode effect cleanup. They
assert rendered provider state and actual localStorage. Page tests render the
real provider and unchanged authentication service in a MemoryRouter, mock HTTP
responses, and assert feedback and navigation. Controlled 400 VALIDATION_FAILED
responses retain issue #3's server error messages without login/navigation.
Deferred promises determine request ordering; no timing-based sleeps or real
backend/email/database calls are used. Existing setup rejects unmocked fetches.

Each auth operation owns one generation ticket; a newer operation or logout makes
older tickets stale. Registration passes its ticket through automatic login.
Stale requests may finish but cannot mutate frontend session state/storage or
clear another operation's loading indicator. Superseded page submissions do not
navigate. This does not cancel or undo server-side registration, and does not add
cross-tab session synchronization or change authentication/validation contracts.

`npm run build:check` produces the normal production bundle in `frontend/dist`,
but ignores environment files and replaces the API URL with a synthetic address.
That bundle is for verification, not deployment. Normal `npm run build`, `dev`
and application startup retain their existing behavior.

## Disposable PostgreSQL tests

Install and start Docker Desktop (or Docker Engine on Linux). No local application
database credentials, Neon credentials, dumps or production secrets are needed.
From `backend/`:

```sh
npm run test:database -- 14
npm run test:database -- 18
```

Each command creates a fresh PostgreSQL container, without persistent volumes,
on an OS-assigned port bound to `127.0.0.1`. Credentials are synthetic. A generated
`gnosis_migration_test_` database name satisfies the existing strict migration
target guard. The isolated container uses trust authentication because the existing
permission fixture creates a passwordless synthetic login role. This is limited
to disposable test infrastructure (loopback locally); it does not change any
application authentication, migration target guard, or database privilege check.
Never use this authentication setup for a shared or application database.
The launcher accepts a supported version, never a database URL.
It checks the server version before running the unchanged migration suite.

The suite covers initialization, adoption, schema/history drift, transactions,
locking, rollback and permission failures. It creates synthetic roles, so its
disposable operator has role-creation privileges. It destroys public-schema
fixtures; never point the lower-level migration test command at application data.
The launcher then uses a fresh database to exercise the public migration CLI:
check, apply, assert no pending migrations, and assert a no-op second apply.

Database connections, generated databases and the container are cleaned up on
completion/failure. SIGINT/SIGTERM cleanup removes the created container. A hard
kill, host crash or Docker failure can leave a container: inspect `docker ps -a`
and remove only the disposable test container from that invocation. Never run
global Docker prune or delete an application database as test cleanup.

## Environment isolation

### Application database integration harness (issue #17)

The same `npm run test:database -- 14` and `-- 18` commands now also run application
integration tests. Install/start Docker locally; CI reuses its existing fresh
PostgreSQL service container. No new dependency, package script or secret is needed.

The runner keeps the migration-suite database alive while creating a different
application-test database. Their generated names are asserted unequal. Both names
use the existing `gnosis_migration_test_<16 hex>` format so the official migration
target guard is unchanged. Application schema is initialized exclusively through
`scripts/migrate.js up --target test`, then checked for no pending migrations.
The operator seeds just one synthetic reference book. No schema snapshots,
imports, local application data or production credentials are used.

Only provisioning code receives the synthetic disposable operator configuration.
It creates a generated `gnosis_app_<16 hex>` role with a synthetic password,
NOINHERIT and no superuser, database/role creation, replication or RLS-bypass rights.
The role owns no objects and belongs to no other roles. Its explicit privileges are:

- CONNECT to the application database and USAGE on public.
- SELECT on the seven Bible/commentary reference tables.
- SELECT/INSERT on users.
- SELECT/INSERT/UPDATE/DELETE on notes, bookmarks and highlights.
- USAGE only on those four writable tables' id sequences.

PUBLIC database/schema/table/sequence/function privileges are removed in this
application fixture, including temporary-object creation. There are no migration
history grants, reference-data writes, DDL, TRUNCATE or sequence reset privileges.
Future issues must explicitly extend the test permission list for their approved
migrations; this harness creates no rate-limit or verification schema.

Application files run in an explicit list with `node --test --test-concurrency=1`:
`test/application/harness.test.js`, then `test/application/safety.test.js`. Add future
files to the runner's list deliberately. Individual cases can acquire independent
clients or start multiple workers to exercise concurrency. Do not wrap an entire
HTTP suite in one transaction: worker connections must see real commits.

Reusable helpers live under `backend/test/helpers/`:

- `createTestPool(context)` returns `{pool, close}` and verifies current_user,
  current_database, role attributes and absence of role memberships before use.
- `withClient(pool, callback)` releases the acquired client even on failure.
- `withTransaction(pool, callback)` runs BEGIN, every callback query, COMMIT or
  ROLLBACK on that one checked-out client. Use the supplied client, never pool.query
  for statements inside the transaction.
- `installApplicationPool(pool)` supplies that real pool as the CommonJS database
  module export before importing services. Production database configuration never
  executes in this test process. It refuses installation after application imports.
- `startBackend(context)` starts an independent real Express app with its own pool
  and ephemeral loopback port, and returns `{url, pid, stop}`. Stop it in finally.

Workers receive only an allowlisted OS environment, synthetic JWT/configuration
and their restricted descriptor over IPC. No operator/migration settings,
DATABASE_URL, DB_*, PG*, dotenv file paths, inherited NODE_OPTIONS or execArgv are
forwarded. Context validation rejects missing fields, extra pg options, remote/DNS
hosts, mismatched generated database/role names and non-synthetic credentials before
opening a connection. Direct invocation without runner context fails closed.
Workers reject outbound fetch/HTTP/HTTPS requests; future delivery tests must use
explicit fake adapters. This is a guard for ordinary test code, not a sandbox for
malicious tests or a guarantee against every possible transport.

The smoke suite proves official schema initialization, exact grants, persistence
across pools, rollback, independent connections, real service reads and two backend
workers reading the same database. Safety tests prove poison dotenv/environment
settings do not redirect the pool and close rolls back an unreleased transaction.

The runner also provisions a separate fixture and deliberately runs a failing
application test after starting a worker. It expects exactly that failure, preserves
the original error, and verifies database and role removal. That expected failure's
TAP is captured; unexpected failures fail the job. Cleanup is called twice to prove
idempotence after both success and intentional failure. Worker shutdown closes HTTP
connections and pools; IPC disconnect also triggers shutdown. Pool close destroys
unreleased clients, causing PostgreSQL to roll back open transactions. Provisioning
then drops only the recorded database (forcing residual sessions closed), drops the
recorded role and checks the catalogs. Cleanup errors cannot replace the primary
test failure and also fail the run.

SIGINT/SIGTERM unwind application cleanup before removing the local container.
On macOS/Linux the application suite has its own process group, so timeout/crash
cleanup also terminates surviving test-file and backend worker descendants.
Windows process-tree cleanup is not covered by the macOS/Linux validation here.
Hard kills/host crashes can leave local containers; follow the manual recovery
guidance above. The inherited trust-authenticated disposable container supports
the legacy migration permission fixture. Restricted-role checks verify PostgreSQL
authorization, not protection against hostile code impersonating another role.
This test bootstrap deliberately does not test production connection/TLS settings.

`npm test` starts a child process with an allowlisted environment, excluding
application credentials, PostgreSQL defaults and inherited Node preload options.
`GNOSIS_TEST_ISOLATION=1` skips dotenv only for explicitly isolated runs. It is
independent of NODE_ENV, so startup tests can cover development and production.
Outside that opt-in, dotenv still uses its existing cwd lookup and preserves
already-injected variables. Application connection selection is unchanged.

The database launcher constructs its own synthetic environment and test-only
preload. That preload prevents the existing migration suite's local-CLI fixtures
from reading backend/.env; their explicitly supplied disposable MIGRATION_DB_*
settings still pass the unchanged migration protections. No local, production,
TLS, locking, baseline or target safeguards have been relaxed.

Vitest and the build-check wrapper disable environment-file loading and use
`https://api.example.invalid/api`. VITE_* values are public bundle data, never
secrets. Normal application environment files must never contain test-isolation
flags. Never print or upload connection strings, JWTs, environment dumps or data.

## GitHub Actions

Pull requests targeting main, pushes to main and manual workflow runs execute:

- Backend tests on Node 22.14.0.
- Frontend tests and isolated production build.
- The complete migration suite and public CLI checks on PostgreSQL 14 and 18.

Database jobs use fresh GitHub service containers with health checks and synthetic
credentials. The internal `--ci` launcher option requires GitHub Actions and the
service's mapped port. It never accepts a database connection URL. Jobs have
timeouts, read-only repository permissions and no deployment/production secrets.
Actions are pinned to commit hashes. PostgreSQL images track their supported
major's patch updates. npm download caches use the separate committed lockfiles.
Tests/builds fail the job on failure; missing database setup never skips tests.
Repository owners can require these status checks through branch protection once
the workflow has run. This workflow does not deploy or run application migrations.

## Existing frontend lint debt

Issue #12 deliberately leaves full frontend lint outside the blocking CI checks.
The inspected main branch reports **19 errors and one warning** under
`cd frontend && npm run lint`: unused values/imports, React ref diagnostics,
state updates in effects, and an AuthContext dependency warning. No existing rule
is disabled and no unrelated components/hooks/pages are changed to silence them.

Recommended follow-up issue: **Resolve frontend lint debt and enable CI lint gate**.
It should review the hook/ref diagnostics, preserve session/navigation behavior,
add appropriate regressions, and enable blocking lint once the baseline passes.
Feature coverage and full auth-validation coverage belong to their own issues.
Issue #3 may intentionally change an existing missing-password response assertion;
coordinate that expected contract change with its implementation.

## Verification and rollback

Run all commands above before submitting a PR. Verify test totals, no skips and
successful container cleanup. The migration protections are also tested through
the existing configuration suite, which requires no database. Review the final
diff for application behavior changes and secrets. Revert these infrastructure
commits to roll back; no application schema/data is changed and no down migration
is needed. Never automatically reverse an application migration for CI cleanup.
