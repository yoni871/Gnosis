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
