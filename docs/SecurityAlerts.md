# Suspicious-login + token-replay alerts (T2.6)

Detection for account-takeover signals, built on the audit log
(`security_events`, T1.16 — see `docs/SecurityEvents.md`). This PR
adds detection and an operator alert record only. It does **not** send
user notification emails (that is a separate PR's job), does not block
or challenge any login, and does not change any auth response.

## The alert rule: refresh-token reuse

A `refresh_token.reused` event means a consumed refresh token was
presented again. Only a leaked or stolen token can do that, and the
session family was already revoked when the event was recorded
(`backend/src/services/sessionService.js`). So the rule has **no count
threshold: one reuse in the window is an alert**.

- Query: `backend/src/utils/securityAlerts.js` —
  `findRecentReuseAlerts(db, { since })` returns every reuse event in
  the window (default 24h), newest first, as `{ user_id, created_at }`
  rows. `findRecentNewDeviceAlerts(db, { since })` does the same for
  `login.new_device` events.
- Operator report: `backend/scripts/security-alerts.js` prints recent
  reuse + new-device events (text, or `--json`). It needs a read
  connection to the App database:
  `GNOSIS_APP_DATABASE_URL=postgresql://... node scripts/security-alerts.js [--hours N] [--since <ISO>] [--json]`
- Exit code: **1 when at least one reuse event falls in the window,
  0 otherwise.** New-device events are listed for review but never
  change the exit code — a new device is expected whenever a user
  signs in from a new phone, browser, or network.
- Acknowledgement: there is **no acknowledgement store** in this PR.
  The window IS the acknowledgement mechanism — a reuse found today
  stays visible to tomorrow's run until the window moves past it (or
  the operator re-runs with a shorter `--since`). A future operator
  step can add an explicit acknowledgement table.

## The new-device model

On a successful login, the route calls
`recordLoginDevice(pool, user.id, req.ip, req.get("user-agent"))`
(`backend/src/services/loginDevices.js`) — one line in
`backend/src/routes/authRoutes.js`, after `login.success` is audited.
All logic lives in the service module; the route holds no detection
logic.

- First login from an unseen device for that user: the device is
  recorded and `login.new_device` is audited. A repeat login from a
  known device only refreshes `last_seen_at` and emits nothing.
- The insert runs first (`INSERT ... ON CONFLICT DO NOTHING
  RETURNING id`), so concurrent first logins from the same new device
  cannot double-emit: exactly the inserter audits.
- **Best-effort, always.** A missing secret, a database failure, or a
  missing client address is logged as one safe line (code only) and
  the login keeps its original 200 response. Detection never breaks
  login.
- **Step-up MFA is DEFERRED** until Muse 3's TOTP work lands. A new
  device alone is not proof of compromise, so this PR records and
  alerts but does not challenge or block the login.

## What is stored (HMACs only)

`known_login_devices` (migration
`database/migrations/app/20261109200233_add-known-login-devices.sql`):

```sql
CREATE TABLE known_login_devices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL,
    device_key BYTEA NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, device_key)
);
CREATE INDEX known_login_devices_user_id_idx ON known_login_devices(user_id);
```

- The device key is an HMAC-SHA256 of the IP + user-agent under the
  dedicated `RATE_LIMIT_KEY_SECRET`, using the same length-prefixed
  encoding as `backend/src/utils/rateLimit.js` (`computeKeyHash` with
  the `"known_login_device"` policy namespace). The stored value is
  neither a raw IP nor a raw user-agent, and never a plain hash (which
  is dictionary reversible). No IP, user-agent, email, password, or
  token is ever stored by this module, and the key cannot be reversed
  into an IP or user-agent without the secret.
- There is deliberately NO foreign key from `user_id` to `users(id)`,
  matching `security_events`: deleting an account must neither delete
  its device history nor be blocked by it. (Account-deletion handling
  can delete by `user_id` when that work lands.)
- The migration contains no GRANT statements (repo convention); the
  operator applies them:

```sql
GRANT SELECT, INSERT ON known_login_devices TO gnosis_app;
GRANT UPDATE (last_seen_at) ON known_login_devices TO gnosis_app;
GRANT USAGE ON SEQUENCE known_login_devices_id_seq TO gnosis_app;
```

`SELECT, INSERT` plus a column-level `UPDATE` on `last_seen_at` only
is the full runtime privilege: the application records devices and
refreshes `last_seen_at`; it cannot rewrite a device's owner or key.
There is no `DELETE` grant: device history is append-mostly (rows are
only superseded by account deletion, run as operator). Retention
follows the audit log: 12 months, purged by the operator, not the
application:

```sql
DELETE FROM known_login_devices WHERE last_seen_at < now() - interval '12 months';
```

## What surfaces where

| Signal | Audit event | Operator view |
| --- | --- | --- |
| Refresh-token replay | `refresh_token.reused` (already wired by T1.16) | `security-alerts.js` exit 1 + listed rows; `findRecentReuseAlerts()` |
| First login from a new device | `login.new_device` (this PR) | `security-alerts.js` listed rows; `findRecentNewDeviceAlerts()` |
| Ordinary login | `login.success` | Audit log only; no alert |

## What was NOT tested

- No live verification against preview or production (soak in
  progress; no live database was touched). All verification is on
  disposable PostgreSQL 18.6.
- Step-up MFA: deferred, not implemented, not tested.
- User notification emails: out of scope for this PR (separate PR).
  They landed in the follow-up PR3 — see `docs/AccountNotifications.md`;
  the new-device email is wired into `services/loginDevices.js`.
- No acknowledgement workflow beyond the window semantics above.
