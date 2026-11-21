# Row-level security (RLS) — defence-in-depth for user data

RLS is the second layer of user isolation, not the first. The application
still binds every user-data query to the JWT `user_id` (`WHERE user_id =
$1`); the policies exist so that a forgotten `WHERE` in a future route
returns zero rows instead of another user's notes. If one control must be
chosen first, the application checks win. RLS must land before any second
client (mobile app, public API, direct database access) exists.

## What is covered

| Table | Policies | Notes |
| --- | --- | --- |
| `notes` | `user_isolation` (FOR ALL) | SELECT / INSERT / UPDATE / DELETE |
| `bookmarks` | `user_isolation` (FOR ALL) | SELECT / INSERT / UPDATE / DELETE |
| `highlights` | `user_isolation` (FOR ALL) | SELECT / INSERT / UPDATE / DELETE |
| `user_reading_state` | `user_isolation_select` / `_insert` / `_update` | No DELETE policy — the app role has no DELETE grant on this table, and the policies mirror the grants exactly |
| `user_mfa` | `user_isolation_select` / `_insert` / `_update` | No DELETE policy — the app role has no DELETE grant; UPDATE is column-scoped (enrolled, enrolled_at, secret_encrypted, key_version, last_totp_step, mfa_generation, updated_at) |
| `mfa_recovery_codes` | `user_isolation_select` / `_insert` / `_update` | No DELETE policy — the app role has no DELETE grant; UPDATE is column-scoped (used_at) |
| `known_login_devices` | `user_isolation_select` / `_insert` / `_update` | No DELETE policy — the app role has no DELETE grant; UPDATE is column-scoped (last_seen_at). The migration also adds the missing FK to `users`, so deleting a user cascades their device rows |

Every policy scopes rows to `user_id =
NULLIF(current_setting('app.user_id', true), '')::integer`. The
two-argument form of `current_setting` returns NULL instead of erroring
when no context is set, so a query without a context sees **zero rows**
and a write without one fails its `WITH CHECK` with `42501`. There is
no permissive fallback. The `NULLIF` guard is load-bearing: once a
session has set the variable (even transaction-locally), PostgreSQL
keeps the entry and it reverts to an empty string after COMMIT, not
NULL — and `''::integer` would raise `22P02` instead of matching
nothing. `NULLIF` turns `''` back into NULL (verified by the leak test
in `backend/test/application/rowLevelSecurity.test.js`, which asserts a
context-free read on the same pooled client returns zero rows after
both commit and rollback).

All seven tables have `FORCE ROW LEVEL SECURITY`: the policies apply to
the table owner as well as the app role. Without FORCE, any owner-context
tooling (migrations, the Neon console, `pg_dump`) would silently bypass
them.

Foreign-key cascades bypass RLS: a `DELETE FROM users` with no context
deletes the parent and cascades the child rows (verified by execution on
PostgreSQL 18.7), so cascades cannot be relied on to prevent
cascade-driven deletion. The `setUserContext` call in DELETE
`/account` is retained as defence-in-depth, not as a cascade
requirement — the cascade happens with or without it.

## What is deliberately NOT covered, and why

Twelve App tables carry a `user_id` column; seven are covered above and
the other five are deliberately NOT covered:

- **`users`.** No `user_id` column — its own `id` is the user key.
  Registration, verification, and password reset run
  unauthenticated or token-derived — there is no user to put in the
  context before the token lookup, and wiring one through those flows
  would add failure modes to the most security-critical paths for
  little gain: `users` rows hold email, `password_hash`, and
  `first_name`/`last_name`, and the app role's column-level grants
  (`UPDATE` only on `email_verified_at` and `password_hash`) are the
  control there. (Migration `20261104021959` already ran and never
  re-runs, so it is not a reason for the exclusion — the
  unauthenticated-flow argument carries it on its own.)
- **`email_verification_tokens`, `password_reset_tokens`.** Looked up
  by token hash before the user is known. Protected by hash +
  single-use + the application's own checks; RLS there adds failure
  modes (e.g. a reset flow that must update a token row before it
  knows the user).
- **`auth_sessions`.** Looked up by session id; the login flow that
  creates sessions runs before any user context exists.
- **`mfa_challenges`.** Looked up by token hash before the user is
  known, so no context exists to scope by —
  `backend/src/routes/mfaRoutes.js:137` and
  `backend/src/services/mfaService.js:315` resolve the owner from the
  token (`SELECT user_id FROM mfa_challenges WHERE token_hash = $1`).
  The table also holds a copy of `users.password_hash` alongside the
  token hash, so this is a deliberate, documented trade-off, not an
  oversight: the challenge must be resolvable before authentication,
  and the application's own checks (hash + single-use + expiry) are
  the control there.
- **`security_events`** (audit log). `user_id` is populated for
  authenticated events but NULL for unauthenticated ones (failed
  logins, token replays) — audit rows must be writable with no user
  context, so a user-scoped policy would break the logger.

The remaining App tables carry no `user_id` column at all, so there is
nothing per-user to scope:

- **`auth_refresh_tokens`.** Keyed by `session_id` (→ `auth_sessions`,
  which cascades on user delete); no `user_id` column.
- **Rate-limit tables** (`rate_limit_attempts`,
  `rate_limit_sweep_state`). Keyed by HMAC hash, not by user; the
  limiter runs before authentication.
- **Licensed tables** (`licensed_chapter_cache`, `licensed_api_usage`,
  `licensed_ip_limits`). The cache writer runs for anonymous visitors
  under IP-based limits — there is no `user_id` to set, and a user
  policy there would break licensed fetches.
- **Bible / Commentary tables.** No per-user rows; the app roles there
  are SELECT-only.

The scope above matches the migration header
(`database/migrations/app/20261109220000_add-row-level-security.sql`);
the migration is the authority if the two ever disagree.

## The `withUser` contract

`backend/src/db/userContext.js` supplies the context helper for user-data
queries:

```js
const { withUser } = require('../db/userContext');
await withUser(pool, userId, (client) => client.query('SELECT * FROM notes WHERE user_id = $1', [userId]));
```

- `withUser` borrows one client, opens a transaction, sets the context
  with `SELECT set_config('app.user_id', $1, true)`, runs the callback,
  and commits. The third argument (`true`) makes the setting
  transaction-local: COMMIT or ROLLBACK clears it before the client
  returns to the pool, so a pooled client can never carry one user's id
  into another user's request. There is no reset-on-release to forget.
- The user id is validated as a positive integer before the client is
  borrowed, and is passed as a parameter, never interpolated into SQL.
- Reference reads against the Bible / Commentary pools stay outside the
  callback — they need no context. If a user-scoped write ever spans
  pools, the context must be set on both transactions (none does today:
  user-data validation reads happen on the Bible pool before the App
  write).
- `withUserBudget` owns the quota lock and transaction for note and bookmark
  writes. It sets `app.user_id` immediately after `BEGIN`, before quota
  reads, then retains the same client through the write and commit. Never
  wrap it in `withUser`: nested transactions on a pooled client would not
  share the quota lock or RLS context.
- Another exception: `saveHighlights` in
  `backend/src/services/highlightsService.js` already owns its
  transaction (with rollback logging), so it calls `setUserContext`
  directly after `BEGIN`, before budget reads, instead of going through `withUser`. Same
  primitive, same transaction-local semantics.
- Never set `app.user_id` with a session-level `SET` on a pooled
  client, and never run a user-data query on the App pool outside
  `withUser` — with no context it returns zero rows, which fails closed
  but silently, so a missing `withUser` looks like empty data rather
  than an error. The cross-user test suite
  (`backend/test/application/rowLevelSecurity.test.js`) is the guard:
  it proves, as the app role, that every RLS table isolates by user and
  that context-free reads return nothing.

## Migrations and FORCE RLS

Audit of App migrations through current main: no migration after
`20261109220000_add-row-level-security` performs DML on an RLS table. The only user-table DML anywhere is the
`users` backfill in `20261104021959_add-email-verification`, and `users`
is excluded (above). The RLS migration is DDL-only; later migrations change note and MFA schemas without user-row DML. Any future
migration that writes to an RLS table must either run before the RLS
migration in file order or set the context first — and the migration
test suite will catch a silent zero-row write only if the test asserts
row counts, so assert them.

## Owner-context backups, copies, and restores

`FORCE ROW LEVEL SECURITY` applies to the non-superuser table owner. An owner-run
`pg_dump` fails with `row_security=off`; a plain `COPY` or SELECT may instead
return zero rows. **Do not treat a successful COPY as proof of a complete backup.**
`SET row_security=off` does not bypass FORCE. The separate App role must remain
`NOBYPASSRLS` and must not own these tables.

For a planned owner-run backup or copy of a database where this migration is
active:

1. Put the application in maintenance mode and stop all writes.
2. As the table owner, run `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY` on
   each of those seven tables. Keep `ENABLE ROW LEVEL SECURITY` and all policies
   in place; the restricted App role remains subject to them. Check
   `pg_class.relforcerowsecurity = false` for all seven before extracting.
   Now record expected row counts for `notes`, `bookmarks`, `highlights`,
   `user_reading_state`, `user_mfa`, `mfa_recovery_codes`, and
   `known_login_devices` through that owner connection.
3. Run the owner-context dump or copy. Check its exit status and compare
   extracted row counts with the recorded counts. Abort on any mismatch.
4. In a guaranteed cleanup step, run `ALTER TABLE ... FORCE ROW LEVEL SECURITY`
   on all seven tables, including when the dump fails. Verify all seven flags
   are true before releasing maintenance mode. Alert an operator if cleanup
   or verification fails; leave writes stopped.
5. Test the restore into a **disposable** database with the same migration
   history and compare row counts and representative rows before relying on
   the backup — run `backend/scripts/db/verify-restore.js` for the
   comparison. A restore into a schema already using FORCE may require the
   same temporary owner bypass on the destination. The script detects a
   restored database that lost FORCE: it compares the as-found FORCE flags
   between source and restored target and fails with `forceMismatch`
   (exit 1) if they differ — but it does NOT re-enable FORCE itself.
   Remediation is the runbook's step 6; the script verifies, it does not
   fix.
6. After restoring into a database, re-enable FORCE ROW LEVEL SECURITY on the restored database and verify it before relying on the restored database. A dump or copy taken while FORCE was off restores without FORCE, and a restored database without FORCE silently leaves owner-context access unprotected. Run, as the table owner, on the restored database:

   ```sql
   ALTER TABLE notes FORCE ROW LEVEL SECURITY;
   ALTER TABLE bookmarks FORCE ROW LEVEL SECURITY;
   ALTER TABLE highlights FORCE ROW LEVEL SECURITY;
   ALTER TABLE user_reading_state FORCE ROW LEVEL SECURITY;
   ALTER TABLE user_mfa FORCE ROW LEVEL SECURITY;
   ALTER TABLE mfa_recovery_codes FORCE ROW LEVEL SECURITY;
   ALTER TABLE known_login_devices FORCE ROW LEVEL SECURITY;
   ```

   Then verify with:

   ```sql
   SELECT relname, relforcerowsecurity FROM pg_class
   WHERE relname IN ('notes','bookmarks','highlights','user_reading_state',
     'user_mfa','mfa_recovery_codes','known_login_devices')
   AND relnamespace = 'public'::regnamespace;
   ```

   All seven rows must show `relforcerowsecurity = true`. Note that `backend/scripts/db/verify-restore.js` also checks this: it compares the as-found FORCE flags between source and restored target and fails with `forceMismatch` if they differ, so re-run it after re-enabling FORCE to confirm. Do not rely on a restored database that fails this check.

Do not run the toggles and extraction inside one long transaction: PostgreSQL
holds `ALTER TABLE` locks until commit. There is therefore a brief owner-bypass
window; restrict owner credentials and the maintenance window accordingly.
The test harness checks application-role isolation; it cannot certify a hosted
backup. The operator must verify the backup and restore separately.

## Testing

Tests run only as a test role built from the clean grant set
(`NOBYPASSRLS`, same grants as the production app role — see
`backend/scripts/testing/application-database.js`), never as the owner
and never against Neon. Do not infer hosted-role properties from the disposable role; audit the
actual hosted App role and table ownership before deployment.

- `backend/test/application/rowLevelSecurity.test.js` (DB-backed
  suite): as the app role, proves per-table isolation for both users,
  context-free reads returning zero rows, context-free and cross-user
  writes failing or affecting zero rows, the missing DELETE policies on
  `user_reading_state`, `user_mfa`, `mfa_recovery_codes`, and
  `known_login_devices`, and that `withUser` clears the context on
  commit and on rollback (verified on a one-connection pool, so the
  follow-up query reuses the exact client).
- `backend/test/migrations/integration.test.js`: the full migration
  suite still applies cleanly with the RLS migration in place. Note
  the migration operator is a superuser and bypasses RLS, so that suite
  proves the migrations apply — it does not prove RLS enforcement.
- The registration flow (INSERT into `users` + verification token) is
  covered by the DB-backed `emailVerification` suite, which runs
  against the RLS-enabled schema; the licensed-cache write path is
  covered by the catalog assertion in the RLS test (the three licensed
  tables are pinned in the `UNPROTECTED` list: no RLS, no FORCE).
  There is no standalone app-role database check of the licensed write
  path — the licensed service's orchestration is proven against an
  in-memory fake pool in
  `backend/test/translations/licensedService.test.js`, not against a
  database.

## For the reviewer (Muse 1)

Policy draft for review: the seven tables, the policy set, and the
`users`/tokens/sessions/`mfa_challenges`/licensed exclusions above, against the audited
grant set. Open questions: none on the role model — the swap renames
the clean replacement into the same role name with identical grants,
so nothing here depends on the swap landing first. If the grant set
changes, the policies in
`database/migrations/app/20261109220000_add-row-level-security.sql`
must change with it; the harness grant test
(`test/application/harness.test.js`) pins the set.
