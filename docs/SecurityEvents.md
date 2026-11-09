# Security events (audit logging baseline, T1.16)

`security_events` is the append-only audit log for account-security
events (audit §4 fix gate). One row records that an event happened —
its kind, the user, and the time — and nothing else. It exists so a
later monitoring step (roadmap T2.6: suspicious-login and
token-replay alerts) can query recent events instead of scraping
logs.

## The helper contract (stable)

`backend/src/utils/auditLog.js` exports `audit(db, kind, userId)`:

- `db` is a pg Pool or Client; the helper uses `db.query` only.
- `kind` must be in `AUDIT_EVENT_KINDS` (below) or `audit()` throws
  before touching the database. Kind strings are stable: never
  rename one, and add new kinds only as new entries with an owner PR.
- `userId` is an integer user id, or `null` when no account is known
  (for example a login failure for an unknown email). Any other value
  throws.
- `audit()` NEVER throws on a database failure: the failure is logged
  as one safe line (`[audit] insert failed kind=<kind> code=<code>`,
  following the `logAuthFailure` discipline — no messages, stacks,
  tokens, or request data) and the caller continues with its original
  response. Callers await it after their primary transaction commits,
  so an audit row is never written for a rolled-back change and never
  blocks the auth response.

Until Muse 3's PR2 shared safe logger lands, this helper builds on
the current `authErrors.js` discipline directly. When PR2 lands, the
helper adopts its logger; the `audit(db, kind, userId)` signature and
the kind strings do not change.

## Kind allowlist and owners

| Kind | Wired by | Meaning |
| --- | --- | --- |
| `login.success` | This PR (T1.16) | A login issued a session. |
| `login.failure` | This PR (T1.16) | Unknown email, wrong password, or a password changed after login verified it. |
| `password_reset.completed` | This PR (T1.16) | A reset token was consumed and the password changed. PR3 (breached-password checks on the reset flow) must NOT re-emit this kind at the same point; its own event is `breached_password.rejected`. |
| `refresh_token.reused` | This PR (T1.16) | A consumed refresh token was replayed; the session family was revoked. |
| `logout.all` | This PR (T1.16) | The logout-all revocation ran for the account. |
| `session.revoked` | PR8 (auth hardening) | A single session was revoked. |
| `password.changed` | PR8 (auth hardening) | An authenticated password change completed. |
| `mfa.enrolled` | PR7 (auth hardening) | TOTP enrolled. |
| `mfa.verified` | PR7 (auth hardening) | TOTP verification succeeded. |
| `mfa.verification_failed` | PR7 (auth hardening) | TOTP verification failed. |
| `mfa.removed` | PR7 (auth hardening) | TOTP removed. |
| `recovery_code.used` | PR7 (auth hardening) | A recovery code was used. |
| `recovery_codes.regenerated` | PR7 (auth hardening) | Recovery codes were regenerated. |
| `account_deletion.requested` | PR5 (auth hardening) | Account deletion was requested. |
| `account_deletion.completed` | PR5 (auth hardening) | Account deletion completed. |
| `passkey.registered` | PR10 (auth hardening) | A passkey was registered. |
| `passkey.login` | PR10 (auth hardening) | A passkey login succeeded. |
| `passkey.removed` | PR10 (auth hardening) | A passkey was removed. |
| `breached_password.rejected` | PR3 (auth hardening) | A breached password was rejected. |
| `secret_strength.boot_failed` | PR3 (auth hardening) | The server refused to boot on a weak secret. |

## Schema

Migration `database/migrations/app/20261109194138_add-security-events.sql`
(App project) creates:

```sql
CREATE TABLE security_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind TEXT NOT NULL,
    user_id INTEGER NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Indexes on `(kind, created_at)` and `(user_id, created_at)` cover
the monitoring queries (recent events of a kind; events for a user).
There is deliberately NO foreign key from `user_id` to `users(id)`:
audit rows are evidence independent of the account, so deleting an
account (including after `account_deletion.completed`) must neither
delete its audit trail nor be blocked by it. The migration contains
no GRANT statements (repo convention); the operator applies them.

## Operator grants (apply once, per environment)

```sql
GRANT SELECT, INSERT ON security_events TO gnosis_app;
GRANT USAGE ON SEQUENCE security_events_id_seq TO gnosis_app;
REVOKE UPDATE, DELETE ON security_events FROM gnosis_app;
```

`SELECT, INSERT` is the full runtime privilege: the application
writes rows and monitoring reads them; nothing in the application
updates or deletes them. (The `REVOKE` is belt-and-braces for
append-only: a fresh role holds no `UPDATE`/`DELETE` by default, but
the revoke makes the intent explicit and survives a future broad
grant.) The disposable-database test harness applies the same grants
to its generated app role (`backend/scripts/testing/application-database.js`).

## Retention (operator step)

Retention is **12 months** (the roadmap allows 90 days–12 months;
12 months chosen so a full year of suspicious-login history is
available to the T2.6 alerting work). Purge with:

```sql
DELETE FROM security_events WHERE created_at < now() - interval '12 months';
```

Run it as a scheduled operator step, not from the application: the
runtime role has no `DELETE` privilege by design. Before the first
purge, confirm with the operator whether any incident investigation
needs older rows held longer.

## What is NEVER stored

Only `kind`, `user_id`, and `created_at` are stored. The table never
holds passwords, password hashes, tokens, token hashes, email
addresses, IP addresses, user agents, request bodies, error messages,
or stack traces. A `login.failure` for an unknown email records
`user_id = NULL`, never the submitted address. Nothing in this table
can be used to log in, reset a password, or identify a person beyond
the user id already known to the account system.
