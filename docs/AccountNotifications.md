# Account-security notifications (roadmap PR3)

User notification emails for security events that change what can sign
in to an account. Built on the audit log (`security_events`, T1.16 —
see `docs/SecurityEvents.md`) and on the new-device detection from
PR #82 (`backend/src/services/loginDevices.js` — see
`docs/SecurityAlerts.md`). This PR sends the emails; it does not
block or challenge any login and does not change any auth response.

## Which event triggers which email

| Audit kind | Email | When it is sent |
| --- | --- | --- |
| `login.new_device` | "New sign-in to your Gnosis account" | **Live in this PR.** First login from a device key not previously seen for that user. |
| `password.changed` | "Your Gnosis password was changed" | **Wired later** — template + helper ready; call site lands with Muse 3's PR8 (see below). |
| `mfa.enrolled` | "Two-factor authentication was turned on for your Gnosis account" | **Wired later** — template + helper ready; call site lands with Muse 3's PR7 (see below). |
| `mfa.removed` | "Two-factor authentication was turned off for your Gnosis account" | **Wired later** — template + helper ready; call site lands with Muse 3's PR7 (see below). |

Kind strings are the audit contract (`backend/src/utils/auditLog.js`)
— this PR uses them as-is and renames nothing.

Deliberately **not** notified by email here:

- `password_reset.completed` — a password reset already notifies the
  user through its own reset email; this module never re-emits it.
- `mfa.verified` / `mfa.verification_failed` — verifying a code is
  routine, not a change to what can sign in; only enrolment and
  removal notify.
- `refresh_token.reused` — operator alert only (PR #82); a replay
  revokes the session family, and the user is not emailed from this
  module.

## What the emails say

Every template is plain language: what happened, when (UTC), and what
to do if it was not you. Each one ends with the same guidance: if it
was you, no action is needed; if it was not you, reset your password
right away via the forgot-password link.

- New device: "A new device signed in to your Gnosis account at
  \<time\>."
- Password change: "Your Gnosis password was changed at \<time\>."
- MFA enrolled: "Two-factor authentication was turned on for your
  Gnosis account at \<time\>."
- MFA removed: "Two-factor authentication was turned off for your
  Gnosis account at \<time\>. Your account no longer asks for a second
  step when you sign in."

The only link in any template is the frontend forgot-password page
(`${FRONTEND_URL}/forgot-password`, the real page from issue #10),
built from `FRONTEND_URL` like the verification and reset links. No
other URL is invented.

## Content policy: no PII beyond the recipient

The only personal data in an email is the recipient address itself
(the `To` field, never repeated in the body). Templates never render
a token, a password, a raw IP, a user-agent, or a device fingerprint:
the new-device email says only that a new device signed in, never
which one. The recipient address is resolved from the `users` table
by id at send time; nothing about the device is stored in or read
from the email path (device keys stay HMACs in `known_login_devices`,
per PR #82).

## How it is built

- Policy layer: `backend/src/services/accountNotifications.js` —
  kind-to-template mapping (`NOTIFICATION_KINDS`), pure template
  rendering (`renderAccountSecurityEmail`), the sending helper
  (`sendAccountSecurityEmail`), and the best-effort entry point
  (`notifyAccountSecurityEvent(db, userId, kind)`, plus the
  `notifyNewDeviceLogin` wrapper). It is a new module rather than a
  method on the Resend client: `resendClient.js` stays the transport
  layer (one method per provider call), and this file owns the
  notification rules. The one transport addition is a generic
  `sendEmail({ to, subject, html, text })` method on the client,
  mirroring `sendPasswordResetEmail`'s contract (config validation,
  `RESEND_API_BASE_URL` honored only under `GNOSIS_TEST_ISOLATION=1`,
  5 s timeout, throws on non-2xx with `.status` attached).
- Wiring, new device: `services/loginDevices.js` calls
  `notifyNewDeviceLogin(db, userId)` after the `login.new_device`
  audit insert. `backend/src/routes/authRoutes.js` is **untouched** —
  it still calls `recordLoginDevice()` and nothing else. The sender
  is injectable (`recordLoginDevice(..., { notifyNewDevice })`) so
  unit tests never touch the provider.
- Sender: the existing Resend configuration (`RESEND_API_KEY`,
  `EMAIL_FROM`, `FRONTEND_URL`); no new environment variables.

## Failure discipline: best-effort, always

Sending failure must never break auth. `notifyAccountSecurityEvent`
never throws: a missing user row, a bad stored address, bad email
configuration, or a provider failure logs exactly one safe line —
`[account-notifications] send failed kind=<kind> code=<code>` — and
returns `{ sent: false }`. The login path guards the call a second
time, so even a misbehaving injected sender cannot flip the `isNew`
result: a notification failure is one `[login-devices] notify failed
kind=login.new_device code=<code>` line and the login keeps its
original 200 response. No log line ever carries an address, a
message, or a stack (authErrors.js discipline).

## Wiring points for Muse 3's PR7 / PR8

The password-change and MFA-change emails have templates and a
helper in this PR, but no live call site — their features do not
exist yet. When they land, the owner PR wires one call each; no
change to this module is needed:

- **PR8 (authenticated password change):** in the service function
  that completes the password change, immediately after the
  `audit(db, "password.changed", userId)` call, add
  `await notifyAccountSecurityEvent(db, userId, "password.changed")`.
  Same best-effort discipline: the call never throws, so it cannot
  change the password-change response.
- **PR7 (TOTP enrol / remove):** in the service functions that
  complete TOTP enrolment and removal, immediately after the
  `audit(db, "mfa.enrolled", userId)` / `audit(db, "mfa.removed",
  userId)` calls, add
  `await notifyAccountSecurityEvent(db, userId, "mfa.enrolled")` /
  `await notifyAccountSecurityEvent(db, userId, "mfa.removed")`.

The helper resolves the recipient from the database by user id, so
the call sites need only `db` and `userId` — no email plumbing. Do
not add a notification call to the password-reset flow: that flow
already emails the user, and `password_reset.completed` is not a
notifiable kind.

## Tests

- Unit: `backend/test/auth/accountNotifications.test.js` — the four
  kinds and their subjects/wording, the content policy (no IP,
  user-agent, token, or password in any template; the forgot-password
  link is the only URL), unknown-kind / bad-time / bad-URL rejection,
  the Resend send with an injected fetch (including provider failure
  with status and bad config throwing before any fetch), and the
  best-effort notifier (unknown user, bad stored address, provider
  failure, database failure — each one safe log line, never a throw).
- Unit: `backend/test/auth/loginDevices.test.js` — the notifier is
  called exactly once per new device and never for a known device,
  and a throwing notifier never flips `isNew`.
- Application: `backend/test/application/accountNotifications.test.js`
  — against a disposable PostgreSQL 18.6 database and a loopback
  Resend stub (the issue #9 pattern): a synthetic new-device login
  delivers exactly one new-device email to the user, a known-device
  login delivers nothing further, a second new device delivers a
  second email, and a stub provider failure keeps the login at 200
  with nothing delivered.

## What was NOT tested

- No live Resend send: delivery is verified only against the
  loopback stub. No live verification against preview or production
  (soak in progress; no live database was touched).
- The password-change and MFA-change emails are template + helper
  only until Muse 3's PR7/PR8 land; their live wiring is untested
  until those call sites exist.
