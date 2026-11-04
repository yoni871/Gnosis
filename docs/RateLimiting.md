# Authentication rate limiting (issue #4)

## What it does

Login and registration attempts are counted in PostgreSQL, so every
backend instance shares the same buckets. Counting never lives in
process memory, and no new vendor or service is required.

| Endpoint | Policy | Limit | Window | Key |
| --- | --- | --- | --- | --- |
| `POST /api/auth/login` | per (IP + submitted email) | 5 failures | 15 minutes | HMAC of IP + submitted email |
| `POST /api/auth/login` | per IP across accounts | 30 failures | 15 minutes | HMAC of IP |
| `POST /api/auth/register` | per IP | 5 valid attempts | 60 minutes | HMAC of IP |

There is deliberately no email-only pre-auth limit: one would let anyone
lock out any account by email alone. The per-IP policy caps what a
distributed attacker gets per address instead.

Counting rules:

- Unknown-email and wrong-password failures count.
- Validation failures (400) never create a reservation and never count.
- Internal failures (database, bcrypt, JWT) release their reservation
  and never count.
- Login successes release their reservation: they neither count nor
  reset prior failures. Only window expiry clears a bucket.
- Registration successes and duplicate-email (409) responses both
  count; registration 400s and 500s do not.
- A blocked attempt rolls back its own reservation, so a 429 never
  extends its own window.

Responses: a blocked request gets exactly
`{ "error": "Too many attempts. Please try again later.", "code": "RATE_LIMITED" }`
with a `Retry-After` header in whole seconds (the maximum over the
blocking policies). The body is identical regardless of policy or
account. `GET /api/auth/profile` is intentionally unthrottled.

## Keys and storage

Buckets are keyed by HMAC-SHA256, never by a raw IP or email address
and never by a plain hash (which is dictionary reversible). Inputs use
an unambiguous length-prefixed encoding, not delimiter joins. The
secret is a dedicated `RATE_LIMIT_KEY_SECRET`, injected through the
environment like `JWT_SECRET`. The server refuses to start without it,
and the limiter fails closed (generic 500) if it is missing at request
time. Rotating the secret orphans all buckets; limits loosen for at
most one window while old rows drain through the sweep.

Reservations use a short transaction with a per-key advisory lock:
lock, insert a provisional row, count, commit or roll back. The lock is
never held across bcrypt, database, or network work, and the
provisional row counts while the attempt is in flight, so a burst is
strict: exactly N of M concurrent attempts pass. After the attempt, a
counted failure keeps its row; a success or internal error deletes it.
A crash leaves at most in-flight phantom rows, which expire with the
window.

## Cleanup

Expired rows are swept by the portable in-response approach: before the
response is returned, a bounded sweep (at most 1000 rows, older than
the longest window) may run, gated by a per-instance throttle (once per
minute), a non-blocking advisory try-lock (exactly one instance
sweeps), and a shared `rate_limit_sweep_state` row enforcing the
global interval. Sweep failure rolls back only the sweep, never active
counters, and never affects the response. The winning request once per
interval takes a small latency hit; this is measured by the sweep tests
and accepted as the portable default until the backend host offers an
approved background mechanism (a waitUntil-style API or a scheduled
job), at which point the trigger — not the sweep itself — changes.

Honest limitation: database storage can still grow during an extreme
distributed attack, because counting inherently stores one row per
distinct attacker key per window. Edge-level protection or Redis may
eventually be necessary.

## Database objects

Added by migration `20261103010729_add-auth-rate-limiting.sql`:

- `rate_limit_attempts` (`id` UUID primary key, `key_hash` BYTEA,
  `policy` TEXT, `attempted_at` TIMESTAMPTZ): one row per counted
  attempt, with indexes on `(key_hash, policy, attempted_at)` for
  counting and on `(attempted_at)` for the sweep.
- `rate_limit_sweep_state` (single row, `id = 1`): the last sweep time
  shared by all instances.

No role name is hardcoded in the migration. Privileges are granted by
a separate operator step with the role name injected from the secure
release environment:

```sql
GRANT SELECT, INSERT, DELETE ON rate_limit_attempts TO <app_role>;
GRANT SELECT, UPDATE ON rate_limit_sweep_state TO <app_role>;
```

The application role must have no other privileges on these tables:
no UPDATE on attempts, no INSERT or DELETE on the sweep state, and no
sequence grants (both primary keys are UUIDs). The disposable test
role gets exactly these grants; see
`backend/scripts/testing/application-database.js`.

## Configuration

- `RATE_LIMIT_KEY_SECRET` (required): a long random secret, distinct
  from `JWT_SECRET`. Missing at startup or at request time fails
  closed with a generic 500.
- `TRUST_PROXY` (optional, disabled by default): the Express trust
  proxy setting, validated at startup. Accepted values: unset/empty,
  `0`/`false` (disabled), `true`, a hop count, or a comma-separated
  list of IPs, CIDRs, or subnet names (`loopback`, `linklocal`,
  `uniquelocal`). Anything else fails fast. No production value is
  guessed: the operator sets the value that matches the real proxy
  chain when the backend host is chosen, and verifies it with
  spoofed-header tests against staging on that host. Until then the
  default (disabled, `req.ip` from the socket) is correct, because
  nothing proxies the backend today.

## Issue #9 integration

This change delivers the reusable policy engine and middleware factory
only. Verification and resend limits are issue #9's to set; #9 will
add its own policies through the same factory. A rate limit must never
invalidate a verification token, and verification will use
cryptographically random, high-entropy, single-use tokens, not short
guessable codes.
