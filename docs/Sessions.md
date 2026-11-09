# Sessions

Issue #7 replaces seven-day stateless JWTs with 15-minute HS256 access tokens
(issuer `gnosis`, audience `gnosis-api`) tied to a database session. Every
protected request checks session expiry and revocation, failing closed if the
database is unavailable. Existing tokens without a session ID are rejected;
users sign in again after rollout.

A login creates a session with an absolute seven-day expiry and a random
256-bit refresh token. Only its SHA-256 hash is stored. The refresh token is
sent exclusively as an HttpOnly, SameSite=Strict cookie scoped to `/api/auth`,
with Secure enabled in production. Access tokens stay in React provider memory; refresh credentials are never
available to frontend JavaScript. Startup removes the legacy `gnosisToken`
localStorage entry and obtains a fresh access token through the HttpOnly cookie.

`POST /api/auth/refresh` rotates the token in a transaction holding a session
row lock. A previously consumed token revokes the whole session, including its
access tokens. Used hashes are retained until session cleanup to detect replay.
Expiry is absolute and does not extend on refresh. `POST /api/auth/logout`
revokes the cookie's session, even through an old refresh token, and any signed
bearer session submitted by that tab (including an expired access token), then clears the
cookie. Both require `X-Gnosis-Session: 1`; requests carrying Origin must match
FRONTEND_URL exactly. CORS allows credentials only from that configured origin.
`POST /api/auth/logout-all` requires a valid bearer token and revokes all of that
user's sessions. Auth responses carrying tokens and logout responses use no-store.

The frontend renews every ten minutes, on returning to the tab or coming online, and during
every startup to restore the session without a persistent access token. Auth operation guards discard late state
updates. Cookie mutations are serialized, including logout after pending login,
and Web Locks coordinate tabs where available. Concurrent refreshes without Web
Locks can trigger replay revocation; the user must sign in again. A lost refresh
response can likewise require signing in again. Logout clears local state
immediately; network failure is logged and server revocation is not guaranteed
until the request succeeds or the session expires.

Apply `20261106210000_add-sessions.sql` through the existing explicit-target
migration workflow before deploying the backend. No application database is
modified by implementing this change. Grant the runtime database role SELECT,
INSERT, UPDATE on auth_sessions and auth_refresh_tokens through the reviewed
operator permission workflow (the disposable test role receives these grants).
Host frontend and API on the same site
(e.g. app.example.com and api.example.com), or proxy `/api`; unrelated domains
cannot use the Strict cookie. Set FRONTEND_URL to the exact browser origin and
NODE_ENV=production for HTTPS deployment. The development proxy origin must
match FRONTEND_URL too.

### Same-origin `/api` proxy (2026-11-07)

The preview frontend and API are on different `vercel.app` subdomains, which
browsers treat as different sites, so a `SameSite=Strict` refresh cookie is
never sent on a direct cross-site refresh — the browser session was lost at
the first 10-minute renewal. The fix is a same-origin proxy, not a weaker
cookie: the cookie stays `SameSite=Strict`, `HttpOnly`, and `Secure`.

- `frontend/api/auth/[...path].js` is a Vercel serverless function that
  forwards `/api/auth/*` to the Express API. The browser calls the
  frontend's own origin, so the cookie is same-origin and is set, stored,
  and sent normally. Only auth endpoints are proxied; every other frontend
  service still calls the deployed API origin directly.
- `frontend/src/services/authService.js` uses `AUTH_API_URL = "/api"` (see
  `frontend/src/api/api.js`). The local Vite dev proxy already maps `/api`
  to the backend, so development is unchanged.
- The backend origin comes from `GNOSIS_API_BASE_URL` (server-side, no
  `/api` suffix), falling back to `VITE_API_URL` with its trailing `/api`
  stripped. Set `GNOSIS_API_BASE_URL` per environment on the frontend
  Vercel project: Preview branch-scoped to that branch's API deployment,
  Production to the live API origin. The value is never baked into the
  browser bundle.
- The function forwards the request method, body, and headers (including
  `Cookie`, `Authorization`, `Origin`, `X-Gnosis-Session`, and
  `X-Forwarded-For`, so IP-based rate limiting still sees the real client),
  and passes through the status, headers, and every `Set-Cookie` header.
  Hop-by-hop headers and `Host` are not forwarded; redirects are never
  followed automatically, so the cookie cannot be carried to another origin.
- It is not an open proxy: the destination is the fixed configured backend
  origin, never derived from the request, and the sub-path is validated to
  stay under `/api/auth/` (a `..` segment is rejected). CSRF protection is
  unchanged — the Strict cookie is not sent cross-site, and the backend
  still requires `X-Gnosis-Session: 1` plus an exact `FRONTEND_URL` Origin.
- No backend change is needed: the cookie `Path=/api/auth` already matches
  the proxied path, and the Origin guard already expects the frontend origin.
- Vercel routing: serverless functions in `api/` take precedence over the
  SPA rewrite in `frontend/vercel.json`, so `/api/auth/*` reaches the
  function and every other path still falls through to `/index.html`.

Operators may periodically delete expired auth_sessions; ON DELETE CASCADE
removes their refresh hashes. Retain all hashes for live sessions to preserve
replay detection. Revocation cannot cancel an operation already authorized and
in progress when logout occurs.

## Review findings and operating limits

- Access JWTs are limited to 900 seconds and checked against the database on
  every protected request. Revocation takes effect on the next authorization
  check; it cannot cancel work that has already passed that check.
- Rotation is atomic and serializes on the session row. Reusing any consumed
  refresh token commits revocation of that family. No raw refresh token is
  stored in the database or returned in JSON.
- Network or server errors during periodic renewal preserve the current user
  and private drafts and retry after one minute or when connectivity returns.
  An explicit invalid-session response clears authentication. An expired access
  token still cannot authorize a protected operation while renewal is unavailable.
- Session mutation requests time out after 15 seconds so a stalled request does
  not indefinitely hold the frontend queue/Web Lock. A request whose response
  is lost may already have committed. Replaying a consumed refresh token then
  requires signing in again; rotation is never silently weakened with a grace period.
- Access tokens remain in provider memory only. An active XSS attack can still
  act through an authenticated browser. HttpOnly refresh storage and shorter
  access lifetime reduce exposure but do not solve XSS. Continue escaping and
  content sanitization; CSP is tracked separately in Stage 3.
- Logout clears local state immediately and attempts server revocation. If the
  network/database is unavailable, remote revocation cannot be guaranteed; the
  error is logged, and the session persists until revocation succeeds or its
  absolute expiry. Callers requiring confirmation must await the auth service's
  `logoutSession` result. Logout-all requires a currently valid access token;
  renew or sign in again before retrying it after access expiry.
- Each session has an absolute seven-day lifetime. Keep used refresh hashes for
  that lifetime for replay detection; deleting them early defeats that check.

## Preview isolation and merge requirements

`main` is the integration/staging branch. `production` is the live deployment
branch. This change does not change those roles or configure an automatic
promotion. Creating this PR does not authorize either a merge or a deployment.

A separate preview/staging database **is required before running this branch or
main's staging deployment**. It may be a dedicated Neon branch/database or a
separate PostgreSQL instance, but it must not be the live database. Use a
separate runtime role and migration role, distinct JWT_SECRET and
RATE_LIMIT_KEY_SECRET, and separate application/CI secrets. Do not point preview
DATABASE_URL, migration settings, or fallback DB_* values at the live service.
Confirm the selected endpoint/database in the provider control panel without
printing credentials. No preview database is provisioned by this implementation.

Use an isolated HTTPS preview frontend and API under the same site, or a
same-origin `/api` proxy. Set FRONTEND_URL to the exact preview browser origin,
VITE_API_URL to the preview API (or leave unset for the proxy), and
NODE_ENV=production on the hosted backend so cookies are Secure. A preview
frontend on an unrelated hosting domain cannot use a Strict refresh cookie
against the live/custom API domain. Configure preview-only email settings and
approved test recipients; do not reuse live session secrets.

Before merging into main:

1. Require review and passing backend, frontend/build and PostgreSQL 14/18 PR CI
   jobs. Existing baseline lint errors must be distinguished from new findings;
   this change must introduce none. Confirm the PR contains only issue #7 work.
2. Provision/confirm the isolated preview environment above. Complete any
   previously required baseline adoption/reconciliation from
   [Database_Migrations.md](Database_Migrations.md); do not bypass schema drift
   or adopt a nonmatching schema as part of this release.
3. Apply the pending versioned migrations and runtime grants to **preview only**
   using its separate operator credentials, then run migration check again.
4. Deploy the feature branch to preview only after explicit deployment approval.
   Smoke-test verified login, refresh across the 15-minute access boundary,
   draft preservation, logout, logout-all in two browsers, refresh replay rejection,
   and legacy-token rejection. Check the actual browser cookie flags and CORS.
5. Obtain explicit merge approval before merging the PR into main. If main
   automatically deploys staging, complete its isolated database/configuration
   prerequisites before that approval and merge.

### Preview migration-history reconciliation (2026-11-06)

The shared preview database carries migrations from unmerged branches, so its
`pgmigrations` history does not match any single branch's file order today
(it already holds the password-reset migration from unmerged PR #29 and the
original-language migration from unmerged PR #52). The runner's history check
compares applied rows to the migration files index by index and fails closed
— it refuses to run rather than applying anything — so this is a workflow
blocker, not data corruption, and the backend itself never runs migrations
on startup.

One pair was genuinely out of order: the original-language migration
(`20261106234443`, applied to preview 2026-11-07 00:28 UTC) sat at history
row 7 ahead of the sessions migration (`20261106210000`, row 8), although
the sessions file sorts first. The two tracking rows were renumbered on
preview only (row 7 is now sessions, row 8 is original-language), changing
no table, no data, and no migration file. After that fix the preview history
is `[baseline, auth-rate-limiting, email-verification, password-reset,
licensed-translations, user-reading-state, sessions, original-language]`,
which is exactly the file order main will have once PR #29, PR #39, and
PR #52 have all merged — so `db:migrate:check` against main will pass then.
Until those merges land, the check still fails against main and against any
single branch, for the pre-existing reason that preview holds the other
branches' migrations.

Merge-order note: this branch's migration integration test expects six
migrations and does not include the password-reset migration, because this
branch does not carry that file. If PR #29 merges first, this branch must be
updated with main and its test expectations reconciled to include it before
merging (and the same applies in reverse if this PR merges first).

## Exact migration and grant procedure (operator only)

Commands run from `backend/`. No command here was run against an application
or production database while implementing or reviewing issue #7. Select a
reviewed environment first; keep all credentials in its secret manager.

For a reviewed local preview database, set all five MIGRATION_DB_* variables
from .env.example to that database and its operator role, then run, once per
project (Bible first in a shared database, then App, then Commentary):

```sh
npm run db:migrate:check -- --target local --project app
npm run db:migrate -- --target local --project app
npm run db:migrate:check -- --target local --project app
```

For a reviewed remote preview database, securely inject **its preview-only**
MIGRATION_APP_DATABASE_URL with a direct connection and `sslmode=verify-full`.
The existing CLI calls its remote policy `production`; that target name is not
an environment selector. The URL selects the actual database. Verify that URL
belongs to preview before authorizing any write. The existing confirmation flag
is required even when using that policy for a remote preview:

```sh
npm run db:migrate:check -- --target production --project app
MIGRATION_CONFIRM_PRODUCTION=yes npm run db:migrate -- --target production --project app
npm run db:migrate:check -- --target production --project app
```

Expected new migration: `20261106210000_add-sessions.sql`; it creates
public.auth_sessions and public.auth_refresh_tokens. Its committed catalog
manifest must match, and no pending migrations or schema differences should
remain after applying the approved migration set. Do not edit applied migrations.

Using psql connected as the **same selected environment's operator**, set the
psql variable `runtime_role` to that environment's existing least-privileged
application role and execute these exact table grants (psql identifier quoting
is intentional):

```sql
GRANT SELECT, INSERT, UPDATE
ON TABLE public.auth_sessions, public.auth_refresh_tokens
TO :"runtime_role";
```

No new sequence grants, DELETE, ownership, superuser privileges, or migration
history access are required by the runtime role. Existing schema USAGE and
other application grants remain prerequisites. Verify both SELECT and the
required INSERT/UPDATE operations using the runtime role before serving traffic.
Grants are an explicit operator step; they are not silently applied by requests.

## Later live deployment and rollback

After main has passed staging validation, obtain **separate explicit approval**
for the live database migration, production-branch promotion, and deployment.
Take/verify the provider's backup or restore point and review the live migration
plan. Apply migrations and the same grants to the approved live runtime role
before starting the new backend. Promote the reviewed commit through the existing
production-branch process and deploy the matching frontend/backend together.
Do not merge main into production or deploy either branch automatically for this PR.

Existing users **must sign in again after deployment**: old seven-day JWTs lack
a database session ID and are intentionally rejected. Announce that sign-in
requirement before rollout. Verify Secure/HttpOnly/SameSite cookie behavior on
the real HTTPS site and smoke-test login, rotation and logout after release.

Prefer a forward fix for session defects. Reverting the backend to the old
stateless JWT implementation would remove immediate revocation and could accept
old seven-day tokens again. Any approved rollback to that code must also rotate
JWT_SECRET and force fresh sign-ins. Stop the new backend before an approved
schema rollback; dropping these tables loses all session/replay history and must
never run while requests still depend on them.

## Password reset and Stage 1 compatibility

A successful password reset revokes all account sessions in the password-change
transaction. Session creation locks the user row and compares the current hash
with the hash that login verified. If reset wins, stale login returns the same
401 as invalid credentials and sets no cookie; if login wins, reset revokes its
session. Refresh rotation serializes with revocation on the session row. All
refresh hashes remain available for replay detection; no cleanup is introduced.

Memory-only access tokens retain reload sign-in through the existing refresh
cookie. Startup needs the same-origin auth proxy and network access; without
those, no cached access token is used. Private drafts continue to use the existing
ownership guards. Multiple tabs coordinate cookie mutations through Web Locks
where available. No signing key is changed and existing database sessions are
not bulk-revoked by deployment of this patch. Users of an older stateless-token
production deployment still need the separately approved session-model cutover
already described above; this patch does not authorize that rollout.
