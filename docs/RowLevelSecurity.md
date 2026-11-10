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

All four tables have `FORCE ROW LEVEL SECURITY`: the policies apply to
the table owner as well as the app role. Without FORCE, any owner-context
tooling (migrations, the Neon console, `pg_dump`) would silently bypass
them.

## What is deliberately NOT covered, and why

- **`users`.** Registration, verification, and password reset run
  unauthenticated or token-derived — there is no user to put in the
  context before the token lookup, and wiring one through those flows
  would add failure modes to the most security-critical paths for
  little gain: `users` rows hold no per-user private content beyond
  email and `password_hash`, and the app role's column-level grants
  (`UPDATE` only on `email_verified_at` and `password_hash`) are the
  control there. (Migration `20261104021959` already ran and never
  re-runs, so it is not a reason for the exclusion — the
  unauthenticated-flow argument carries it on its own.)
- **Tokens and sessions** (`email_verification_tokens`,
  `password_reset_tokens`, `auth_sessions`, `auth_refresh_tokens`).
  Protected by hash + single-use + the application's own checks; RLS
  there adds failure modes (e.g. a reset flow that must update a token
  row before it knows the user).
- **Rate-limit tables** (`rate_limit_attempts`,
  `rate_limit_sweep_state`). Keyed by HMAC hash, not by user; the
  limiter runs before authentication.
- **Licensed tables** (`licensed_chapter_cache`, `licensed_api_usage`,
  `licensed_ip_limits`). The cache writer runs for anonymous visitors
  under IP-based limits — there is no `user_id` to set, and a user
  policy there would break licensed fetches.
- **`security_events`** (audit log). The logger fires for
  unauthenticated events (failed logins, token replays) with no user.
- **Bible / Commentary tables.** No per-user rows; the app roles there
  are SELECT-only.

## The `withUser` contract

`backend/src/db/userContext.js` is the only way user-data code sets the
context:

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
- One exception: `saveHighlights` in
  `backend/src/services/highlightsService.js` already owns its
  transaction (with rollback logging), so it calls `setUserContext`
  directly after `BEGIN` instead of going through `withUser`. Same
  primitive, same transaction-local semantics.
- Never set `app.user_id` with a session-level `SET` on a pooled
  client, and never run a user-data query on the App pool outside
  `withUser` — with no context it returns zero rows, which fails closed
  but silently, so a missing `withUser` looks like empty data rather
  than an error. The cross-user test suite
  (`backend/test/application/rowLevelSecurity.test.js`) is the guard:
  it proves, as the app role, that every RLS table isolates by user and
  that context-free reads return nothing.

## Composing `withUser` with the storage budget (#91)

The storage budget (`backend/src/utils/storageBudget.js`,
`withUserBudget`, from the #85/#91 error-budgets work) also owns a
transaction: it opens one, takes a transaction-scoped advisory lock,
checks the quota, and commits the write with the check. Both helpers
owning a transaction is a real conflict, not a style point — nesting
them as two owners silently breaks both:

- an inner `BEGIN` inside an outer transaction is a no-op in
  PostgreSQL (warning only), while an inner `COMMIT` commits the
  outer transaction early;
- that early commit clears the transaction-local RLS context
  (`SET LOCAL app.user_id`), so any query after it in the outer
  callback runs with no context — and it also releases the advisory
  lock, so the quota check and the write are no longer atomic.

The resolution (integration fold, verified on disposable PostgreSQL
18.6 as the app role): exactly one helper owns the transaction, and
it is always `withUser`. `withUserBudget` takes an optional third
argument, the client of an already-open transaction; when it is
given, it takes the advisory lock and runs the work on that client
with no `BEGIN`/`COMMIT` of its own, and when it is not given, it
opens its own transaction exactly as before. Call sites compose
them as:

```js
await withUser(pool, userId, client => withUserBudget(userId, async budgetClient => {
    await ensureCapacity(budgetClient, userId, 'notes', { add: 1, bytes: ... });
    return budgetClient.query('INSERT INTO notes (...) VALUES (...) RETURNING *', [...]);
}, client));
```

`saveHighlights` is the one exception, as above: it already owns its
transaction, so it calls `setUserContext` directly after `BEGIN`
(and takes its budget lock in the same transaction). Never call the
no-client form of `withUserBudget` from inside a `withUser`
callback, and never wrap `withUser` inside `withUserBudget` — both
directions nest two transaction owners. Pagination is unaffected by
the composition: list queries run inside `withUser` (so RLS scopes
the rows before the cursor/limit applies) and keep the #91 caps
(notes 20, bookmarks/highlights 100) via `readPage`/`sendPage`.

For Muse 3 / PR #95: when #95 rebases onto the merged #85/#91
work, its controller rewrites must carry this composition (not the
plain `withUser` calls from its original base, which would drop the
quota checks) and the `withUserBudget(userId, work, client)` seam
from `storageBudget.js`. The composed-path test in
`backend/test/application/rowLevelSecurity.test.js` is the guard:
it creates a note through the composed path, proves user B and
context-free reads see nothing, proves an over-budget write is
refused before any insert, and proves a cross-user insert under the
owner's context fails the policy `WITH CHECK`.

## Migrations and FORCE RLS

Audit of all App migrations at the time RLS landed (migration
`20261109220000_add-row-level-security`, the 10th): no migration
performs DML on an RLS table. The only user-table DML anywhere is the
`users` backfill in `20261104021959_add-email-verification`, and `users`
is excluded (above). The RLS migration itself is DDL-only and sorts
last, so every earlier migration runs before RLS exists. Any future
migration that writes to an RLS table must either run before the RLS
migration in file order or set the context first — and the migration
test suite will catch a silent zero-row write only if the test asserts
row counts, so assert them.

## Owner-context copies and dumps (read this before Phase 4)

Verified on disposable PostgreSQL 18.6 (2026-11-09):

- `pg_dump` run as a **non-superuser owner** (the Neon case:
  `neondb_owner`) **fails loudly** (exit 1, `ERROR: query would be
  affected by row-level security policy`) and leaves an incomplete
  dump — the COPY header with no data rows. `pg_dump` issues `SET
  row_security = off`, but with FORCE RLS that does **not** help the
  owner: a plain SELECT in that state errors outright. A COPY-based
  extract as owner with no context, by contrast, silently yields zero
  rows with a successful exit code — that is the silent-data-loss
  shape, and the one a manual copy script must guard against.
- `SET row_security = off` is **not** superuser-only (any role may set
  it), but it is **not** the remedy for the owner under FORCE RLS.
- The remedy is to drop FORCE around the copy, as the table owner:
  `ALTER TABLE <table> NO FORCE ROW LEVEL SECURITY` on the four tables
  before the copy/dump, then re-enable it afterwards. Verified: the
  owner then sees all rows, and re-enabling restores enforcement.
  A superuser session would also bypass RLS, but Neon offers no
  superuser access, so the runbook must use NO FORCE.
- The Phase 4 production copy procedure and any restore test must
  include this step if RLS is live on the source tables. The
  launch-readiness checklist records the same gotcha.

## Testing

Tests run only as a test role built from the clean grant set
(`NOBYPASSRLS`, same grants as the production app role — see
`backend/scripts/testing/application-database.js`), never as the owner
and never against Neon. The live preview role's `rolbypassrls` was
never audited, so testing against it would give false passes if it
bypasses RLS.

- `backend/test/application/rowLevelSecurity.test.js` (DB-backed
  suite): as the app role, proves per-table isolation for both users,
  context-free reads returning zero rows, context-free and cross-user
  writes failing or affecting zero rows, the missing DELETE policy on
  `user_reading_state`, and that `withUser` clears the context on
  commit and on rollback (verified on a one-connection pool, so the
  follow-up query reuses the exact client).
- `backend/test/migrations/integration.test.js`: the full migration
  suite still applies cleanly with the RLS migration in place. Note
  the migration operator is a superuser and bypasses RLS, so that suite
  proves the migrations apply — it does not prove RLS enforcement.
- The registration flow (INSERT into `users` + verification token) is
  covered by the DB-backed `emailVerification` suite, which runs
  against the RLS-enabled schema; the licensed-cache write path is
  covered by the catalog assertion (no policies, no RLS flag) plus a
  standalone app-role check with the full grant set.

## For the reviewer (Muse 1)

Policy draft for review: the four tables, the policy set, and the
`users`/tokens/sessions/licensed exclusions above, against the audited
grant set. Open questions: none on the role model — the swap renames
the clean replacement into the same role name with identical grants,
so nothing here depends on the swap landing first. If the grant set
changes, the policies in
`database/migrations/app/20261109220000_add-row-level-security.sql`
must change with it; the harness grant test
(`test/application/harness.test.js`) pins the set.
