# Account deletion and expired-auth purge

## Self-serve account deletion

`DELETE /api/auth/account` (authenticated, current password in the
body as confirmation) deletes the account irreversibly:

1. The password is checked with bcrypt **before** any lock or
   transaction, then rechecked against the locked user row inside the
   transaction, so a concurrent password change cannot delete an
   account on a stale credential.
2. Every session for the account is revoked, then the user row is
   deleted in the same transaction. The user-owned rows — notes,
   bookmarks, highlights, reading state, email-verification tokens,
   password-reset tokens, sessions, and refresh tokens (via their
   session) — are removed by the schema's `ON DELETE CASCADE` rules,
   not by explicit `DELETE`s.
3. The refresh cookie is cleared and the response is
   `{ deleted: true }`. The deleted access token stops working
   immediately because its session row is gone.

A wrong password returns the same `401 INVALID_CREDENTIALS` body as
login and deletes nothing. A database failure rolls the transaction
back and returns the generic `500 INTERNAL_ERROR` body.

### Operator grant (deploy step)

The runtime role deliberately holds no `DELETE` grant on the child
tables. Deletion needs exactly one new grant, applied by the
operator at deploy time on every App database (preview now,
production at the Phase 4 cutover):

```sql
GRANT DELETE ON users TO gnosis_app;
```

Local development gets the same grant from
`backend/scripts/local/prepare.js` (`GRANT DELETE ON users TO
gnosis_reader`). Without the grant, deletion fails closed with a
500 and nothing is removed. There is no migration for grants in
this repo: migrations contain no `GRANT` statements, and the
operator applies runtime grants at deploy time (see
docs/PasswordReset.md).

### Audit logging (pending rebase)

The endpoint currently logs completion through the allowlisted
`logAuthEvent` helper only (route + kind, no user data). Once this
branch rebases onto the audit-logging track
(`security/audit-logging`), emit `account-deletion-requested` (after
the password confirms, before the transaction) and
`account-deletion-completed` (after commit) through its `audit()`
helper, with the user id captured before the user row is deleted.

## Expired-auth purge

`backend/scripts/purge-expired.js` deletes auth rows that are
already dead. Run it as the **owner**, never as the application
role (the runtime role has no `DELETE` grant on these tables):

```sh
DATABASE_URL=<owner connection string> node backend/scripts/purge-expired.js
```

Run it on a regular operator cadence (weekly is enough at current
scale). No cron, hook, or scheduled job is set up by this repo.
Only per-table counts are logged, never user data.

What it deletes:

| Table | Rows deleted |
| --- | --- |
| `email_verification_tokens` | Expired only. Consumed-but-unexpired rows are kept: the verify endpoint answers an already-verified link with success while the row is inside its TTL. |
| `password_reset_tokens` | Expired or consumed (used/superseded). A replayed reset link gets the same generic 400 whether its row exists or not. |
| `auth_refresh_tokens` | Tokens whose session is revoked or expired. Used-but-live tokens are kept: rotation detects a replayed token by finding its `used_at` row and revoking the whole session family. |
| `auth_sessions` | Revoked or expired. |

The script is idempotent and safe to run while the app is live:
every `DELETE` only matches already-dead rows, takes row locks
only, and a re-run finds nothing left to delete.

## Retention

- Sessions live 7 days from creation; refresh tokens are
  single-use and rotate on each refresh.
- Email-verification tokens live 24 hours; password-reset tokens
  live 1 hour. Both are single-use.
- Rate-limit attempt rows are swept by the application itself
  (see docs/RateLimiting.md); licensed-translation cache rows
  expire after 30 days (see docs/LicensedTranslations.md).
- Deleted data may remain in the hosting provider's point-in-time
  backups for a short window (currently up to 6 hours for database
  point-in-time recovery); after that window it is gone. No
  restore of deleted user data is possible after that.
