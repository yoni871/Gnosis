# Password reset (issue #10)

## The problem it solves

Before this change, there was no way to recover a Gnosis account with
a forgotten password: no reset route, no reset token, no reset email,
and no "Forgot your password?" link anywhere. A user who forgot their
password had no self-service path back into their account.

## How it works now, in plain terms

1. The login page offers a **Forgot your password?** link to
   `/forgot-password`.
2. The user enters an email address. The page always shows the same
   generic message — "If there is an account for this email, a
   password reset link has been sent." — whether or not an account
   exists for that address, so the form can never be used to probe
   which email addresses have accounts.
3. If a **verified** account exists for the address, the server emails
   a reset link. The link looks like
   `https://<frontend>/reset-password#token=<43 characters>`.
4. Opening the link shows a form for a new password (and its
   confirmation). Nothing is submitted until the user clicks **Reset
   my password** — a prefetch, a preview, or a forwarded link cannot
   consume the token by accident.
5. Submitting sets the new password and consumes the token. From then
   on, login works with the new password and the old password stops
   working. A reset does **not** log the user in — they sign in
   normally with the new password.
6. Unverified accounts receive no reset email: they cannot log in
   until they verify, so a reset link would be useless to them. The
   login page's resend flow is their path, and the forgot-password
   response is identical for them, so nothing leaks.

## Tokens

- A token is 32 random bytes, shown base64url-encoded (43 characters)
  in the link fragment. The fragment is never sent to a server, so it
  cannot leak through request logs, referrers, or analytics.
- The database stores **only the SHA-256 hash** of the token, never
  the token itself. A database read cannot be turned into a working
  link.
- Tokens expire after **1 hour** — shorter than the 24-hour
  verification tokens, because a reset token grants account access.
  `token_hash` is unique and indexed; `user_id` has its own index.
- A token row carries `used_at` and `consumed_reason`: `used`,
  `superseded`, or NULL while unused.
- A used, superseded, expired, nonexistent, or inconsistent token
  returns the same generic 400 (`INVALID_RESET_LINK`): the client
  cannot tell which case it hit. Unlike verification, a replayed reset
  token is **never** idempotent success: re-applying a password change
  must not succeed twice.
- A successful reset supersedes every other still-unused token for
  the same account in the same transaction, so an older link cannot
  outlive the password it was issued against.

## Concurrency and lock order

Forgot-password and reset-password share the verification lock order,
so they serialize instead of deadlocking:

1. Resolve the user id for routing.
2. Lock the user row with `FOR UPDATE`.
3. Lock and recheck the token rows (forgot locks them in
   deterministic id order).
4. Write and commit.

No lock is ever held during a network call to the email provider. The
forgot flow is a short transaction (supersede old tokens + insert the
new one), commit, and only then an awaited send. There is no sender
loop, no outbox table, no background worker, and no fire-and-forget
work.

Concurrent forgot requests may both complete and both send an email.
The later transaction supersedes the earlier token, both return the
same generic 200, and exactly one valid token remains. **Emails may
arrive out of order; only the newest link works.** The check-email and
invalid-link pages all say this.

## Forgot and reset

- The rate limiter runs **before** any account lookup, so unknown,
  unverified, and verified addresses count identically (5/hour per
  IP + email, 20/hour per IP; see `docs/RateLimiting.md`). The public
  response is the same generic message in every state, and an unknown
  or unverified address never bypasses counting.
- Reset is limited to 30 attempts per 15 minutes per IP. Generic 429
  responses use the maximum Retry-After across blocking policies.
- Validation failures never enter the limiter; internal failures
  release their reservation.
- A send failure preserves the account and its fresh token and changes
  nothing about the response: the user simply requests a fresh link.
- A rate limit never invalidates a token.
- The new password follows the registration rule: at least 8
  characters, at most 72 UTF-8 bytes (bcrypt's limit), no complexity
  rules. It is hashed with bcrypt (cost 12), exactly like
  registration.

## Configuration

No new environment variables. Reset links are built only from the
existing `FRONTEND_URL`, and delivery uses the existing Resend
configuration (`RESEND_API_KEY`, `EMAIL_FROM`), validated in
`backend/src/config/emailConfig.js` and imported through `app.js`:

- `RESEND_API_KEY` — nonempty; the sending key, never logged.
- `EMAIL_FROM` — a structurally valid sender address (bare address or
  `Display Name <address>`).
- `FRONTEND_URL` — an absolute HTTPS origin; reset links are built
  only from this value. In production this must be the production
  frontend origin (`https://studygnosis.com`), so reset links open
  the production reset page.

Email delivery goes through the injectable `resendClient` service
(`backend/src/utils/resendClient.js`). Tests inject stubs or a
loopback delivery server; CI never uses a real Resend key and never
calls Resend. `RESEND_API_BASE_URL` is honored only when
`GNOSIS_TEST_ISOLATION=1`; production always uses
`https://api.resend.com`.

## Database permissions

The migration contains **no GRANT statements**. The operator applies
grants separately (see "Operator steps" below). The runtime role gets:

- Existing SELECT and INSERT on `users`, plus
  UPDATE (`email_verified_at`, `password_hash`) only.
- SELECT and INSERT on `password_reset_tokens`, plus
  UPDATE (`used_at`, `consumed_reason`) only.

Live negative tests prove every other column update fails with
PostgreSQL error 42501.

## Frontend

- `authService` preserves controlled backend error codes on thrown
  errors (`error.code`); pages branch on the code, never on message
  text. The reset page branches on `INVALID_RESET_LINK` to show the
  invalid/expired state and on `VALIDATION_FAILED` to show the
  password rule.
- `ForgotPasswordPage` (`/forgot-password`) shows the same generic
  sent message in every case. It never says whether an account exists.
- `ResetPasswordPage` (`/reset-password`) removes the URL fragment
  immediately on mount, keeps the token only in component memory
  (never localStorage, sessionStorage, or a log), and submits only
  after the user enters a matching new password and clicks the reset
  button. It covers the form, success, invalid/expired, and no-token
  states, with a link to request a new link.
- `LoginPage` gains a **Forgot your password?** link under the
  password field.
- Both new pages carry `noindex, nofollow` metadata, and
  `robots.txt` disallows `/forgot-password` and `/reset-password`,
  like the other authentication pages. (The `/verify-email` Disallow
  is a separate open decision and is not bundled here.)
- Neither route is in the sitemap: authentication pages are never
  indexed.

## Known limitations

- **A successful reset revokes every session in the same transaction.**
  Existing access tokens and all refresh descendants fail after commit.
  Login locks the same user row and rechecks the password hash it verified,
  so an old-password login cannot create a surviving session across reset.
  Invalid/expired/replayed resets do not revoke sessions. Already-authorized
  requests may finish; revocation applies at the next authorization check.
- A reset link grants account access for 1 hour. Anyone who can read
  the recipient's inbox in that window can reset the password. That is
  inherent to email-based reset; the short TTL and single-use tokens
  bound it.

## Operator steps

1. Apply the migration (`20261105231211_add-password-reset.sql`) and
   confirm `db:migrate:check` reports no pending migrations and no
   differences.
2. Grant the runtime role, as in the test harness
   (`backend/scripts/testing/application-database.js`):
   `SELECT, INSERT` on `password_reset_tokens`,
   `UPDATE (used_at, consumed_reason)` on `password_reset_tokens`,
   and `UPDATE (password_hash)` on `users` (alongside the existing
   `email_verified_at` column grant). Verify the negative checks: no
   other column on either table is updatable by the runtime role.
3. Confirm production `FRONTEND_URL` is the production frontend
   origin. No new variables are required: `RESEND_API_KEY` and
   `EMAIL_FROM` are the ones already configured for verification
   emails.
4. Smoke-test the flow on a preview deployment with a test account:
   request a reset, open the link, set a new password, sign in with
   it, and confirm the old password no longer works and the link
   cannot be reused.
