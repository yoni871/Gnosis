# Email verification (issue #9)

## The problem it solves

Before this change, registration created an account and logged the user
straight in. Anybody could register with somebody else's email address
and immediately use the account, and nothing ever proved the address
belonged to the person who typed it.

## How it works now, in plain terms

1. Registration creates an **unverified** account and does **not** log
   the user in. The page shows a "check your email" state instead.
2. The server emails a verification link to the registered address.
   The link looks like
   `https://<frontend>/verify-email#token=<43 characters>`.
3. Opening the link shows a confirmation page. Nothing is submitted
   until the user clicks **Verify my email** — a prefetch, a preview,
   or a forwarded link cannot consume the token by accident.
4. Clicking verifies the account. From then on, login works normally.
   Until then, a correct-password login is refused with a controlled
   `403 EMAIL_NOT_VERIFIED` response, and the login page offers to
   resend the link.
5. Accounts created before this change are **grandfathered**: the
   migration stamps them verified, so nobody is locked out by the
   rollout.

## Tokens

- A token is 32 random bytes, shown base64url-encoded (43 characters)
  in the link fragment. The fragment is never sent to a server, so it
  cannot leak through request logs, referrers, or analytics.
- The database stores **only the SHA-256 hash** of the token, never
  the token itself. A database read cannot be turned into a working
  link.
- Tokens expire after **24 hours**. `token_hash` is unique and
  indexed; `user_id` has its own index.
- A token row carries `used_at` and `consumed_reason`: `verified`,
  `superseded`, or NULL while unused.
- Reusing the exact token that previously verified an account returns
  idempotent success, but only while that account is still verified.
  Superseded, expired, nonexistent, and inconsistent tokens all return
  the same generic 400: the client cannot tell which case it hit.

## Concurrency and lock order

Verify and resend share one lock order, so they serialize instead of
deadlocking:

1. Resolve the user id for routing.
2. Lock the user row with `FOR UPDATE`.
3. Lock and recheck the token rows (resend locks them in
   deterministic id order).
4. Write and commit.

No lock is ever held during a network call to the email provider. The
register and resend flows are a short transaction (user + token),
commit, and only then an awaited send. There is no sender loop, no
outbox table, no background worker, and no fire-and-forget work.

Concurrent resends may both complete and both send an email. The later
transaction supersedes the earlier token, both return the same generic
200, and exactly one valid token remains. **Emails may arrive out of
order; only the newest link works.** The check-email, resend, and
invalid-link pages all say this.

## Resend

- The rate limiter runs **before** any account lookup, so unknown,
  verified, and unverified addresses count identically (5/hour per
  IP + email, 20/hour per IP; see `docs/RateLimiting.md`). The public
  response is the same generic message in every state, and a verified
  or unknown address never bypasses counting.
- Verify is limited to 30 attempts per 15 minutes per IP. Generic 429
  responses use the maximum Retry-After across blocking policies.
- Validation failures never enter the limiter; internal failures
  release their reservation.
- A send failure preserves the unverified account and changes nothing
  about the response: the user simply resends for a fresh token.
- A rate limit never invalidates a token.

## Configuration

All domain-specific values live outside source code, validated in
`backend/src/config/emailConfig.js` and imported through `app.js`
(Vercel does not run `server.js`, so import-time validation is the
entry-path guarantee; the send path re-validates at request time):

- `RESEND_API_KEY` — nonempty; the sending key, never logged.
- `EMAIL_FROM` — a structurally valid sender address (bare address or
  `Display Name <address>`).
- `FRONTEND_URL` — an absolute HTTPS origin; verification links are
  built only from this value.

Startup fails fast with a generic message (no variable names or values
in the output) when any of the three is missing or malformed.
`.env.example` carries empty placeholders only. Nothing in the code
hardcodes `onboarding@resend.dev`, a domain, a sender address, or a
frontend origin.

Email delivery goes through an injectable `resendClient` service
(`backend/src/utils/resendClient.js`). Tests inject stubs or a
loopback delivery server; CI never uses a real Resend key and never
calls Resend. `RESEND_API_BASE_URL` is honored only when
`GNOSIS_TEST_ISOLATION=1`; production always uses
`https://api.resend.com`.

## Database permissions

The migration contains **no GRANT statements**. The operator applies
grants separately (see "Operator steps" below). The runtime role gets:

- Existing SELECT and INSERT on `users`, plus
  UPDATE (`email_verified_at`) only.
- SELECT and INSERT on `email_verification_tokens`, plus
  UPDATE (`used_at`, `consumed_reason`) only.

Live negative tests prove every other column update fails with
PostgreSQL error 42501.

## Frontend

- `AuthContext.register` returns `{ email }` and touches no session
  state: no token, no user, no `sessionVersion` bump. Registration can
  never disturb an existing login, logout, or restore (issue #8
  private-state behavior is preserved).
- `authService` preserves controlled backend error codes on thrown
  errors (`error.code`); pages branch on the code, never on message
  text. Login branches on `EMAIL_NOT_VERIFIED` to show the resend
  panel.
- `VerifyPage` (`/verify-email`) removes the URL fragment immediately
  on mount, keeps the token only in component memory (never
  localStorage, sessionStorage, or a log), and submits only after the
  confirm click. It covers the confirm, success, invalid/expired, and
  no-token states, with an inline resend form and most-recent-email
  guidance.
- `RegisterPage` shows the check-email state (24-hour expiry,
  most-recent-email guidance, resend) instead of navigating anywhere.

## Operator steps

Apply the migration first, then the grants, before deploying code
that enforces verification:

```sql
-- Run with the migration role (see docs/Database_Migrations.md).
-- Then, as a privileged role, for the runtime role:
GRANT UPDATE (email_verified_at) ON users TO <runtime_role>;
GRANT SELECT, INSERT ON email_verification_tokens TO <runtime_role>;
GRANT UPDATE (used_at, consumed_reason) ON email_verification_tokens TO <runtime_role>;
```

Set on the backend host (Vercel project variables for the deployed
backend): `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`. The
frontend build must bake `VITE_API_URL` pointing at the backend origin
from its own dashboard; the frontend `vercel.json` is SPA-fallback
only and provides no `/api` rewrite.

## Preview and staging isolation

- Preview deployments use an isolated Neon preview branch/database, a
  restricted preview runtime role, and a separate preview Resend key.
  The feature migration and grants go only to the isolated preview
  database during staging.
- Preview deployments never receive production database credentials,
  production Resend keys, JWT secrets, rate-limit secrets, or other
  production credentials, and preview verification links stay in
  preview because each preview pairs its own frontend and backend
  origins.
- No production user data is copied or used in automated testing. A
  real test inbox controlled by the operator may be used for the
  manual staging-delivery test.

## Production release gate (blocking)

Production release is **blocked** until both of these hold:

1. The operator owns and has verified a sending domain in Resend.
2. A real staging delivery succeeds using that verified domain: a
   verification email from a preview deployment reaches a real inbox,
   the link is followed, the account verifies, and login succeeds.

`onboarding@resend.dev` is development and manual-smoke-test only (it
delivers only to the Resend account's own email) and must never be
hardcoded. Mandatory email verification must not be merged or deployed
to production before this gate is satisfied.

## Changing to a custom domain later

No code edit, migration, or user-account change is needed:

1. Verify the domain/subdomain in Resend.
2. Change `EMAIL_FROM` on the backend host.
3. Change `FRONTEND_URL` if the website origin changes.
4. Redeploy.

## Known limitations

- The 24-hour link lifetime and the resend/verify limits are fixed
  policy values, not per-user settings.
- If a user's mailbox reorders delivery, an older email's link is
  already dead when a newer one was requested; the pages explain this,
  but the user must find the newest message.
- During an extreme distributed attack, database-backed attempt rows
  can still grow; see the honest limitation in `docs/RateLimiting.md`.
