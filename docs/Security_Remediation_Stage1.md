# Stage 1 security remediation

Reviewed November 8, 2026 (America/Chicago), against latest fetched `main`
`78e76fa83d3ec557687e753872a928577bf34abb`. Scope: F01, F10 and F11 only.
Branch: `security/stage-1-auth`; its separate pull request targets `main`.
No merge or deployment is authorized by this report. Stage 2 requires review
and explicit approval after this stage.

## Original evidence and current applicability

[Security_Audit.md](Security_Audit.md) preserves the original assessment verbatim
from `origin/audit/security-assessment`; its source revision and historical
observations remain unchanged. The user-provided pasted audit is left untouched.
Latest main still resets passwords without session revocation, issues sessions
from an unlocked password snapshot, reports duplicate emails explicitly, skips
bcrypt for absent login accounts, and persists access JWTs in localStorage.

| Finding | Original severity | Stage 1 status | Implementation / remaining risk |
| --- | --- | --- | --- |
| F01 | High | Fixed in source; local regression checks passed; release pending | Reset changes the password, revokes all account sessions, and consumes/supersedes reset links in one transaction. Login locks the user and rechecks the verified hash before issuance. Already-authorized work can finish. The older production session model needs a separately approved cutover. |
| F10 | Low | Partially remediated; identity policy reviewed | New and duplicate signup return HTTP 200 with only the submitted validated email. Unknown and wrong-password login both perform bcrypt and return the same 401 body. Email-delivery timing and case-sensitive identity remain disclosed below. |
| F11 | Low | Fixed in source; browser integration release checks pending | Access credentials remain in provider memory. Startup discards legacy persistent access tokens and restores using the existing HttpOnly refresh cookie. Active XSS can still act as the user; CSP is Stage 3. |

F02–F09 and F12–F13 retain their original audit status and are not claimed fixed.
This is an interim report, not the final all-findings production sign-off.

## Session concurrency and compatibility

Reset and session issuance lock the same user row. If reset commits first, the
old password hash fails the locked recheck and login issues no session or cookie.
If login commits first, reset revokes that new session too. Refresh serializes
with reset on the session row: a winning refresh still belongs to the revoked
family, and a refresh after revocation fails. All old refresh descendants are
invalidated through family state without deleting replay history.

Invalid, expired, superseded or replayed reset links do not revoke sessions.
Failures roll back password, revocation and link changes together. Revocation
is scoped by user ID, preserving other accounts. A database failure fails closed.

Signing keys, JWT claims, cookie attributes, existing session lifetime, login and
verification gates, reset URLs, and refresh rotation/replay rules are preserved.
No application schema migration or runtime grant change is introduced. The user
row lock uses existing password-column UPDATE privileges required for reset.

Access-token startup now needs a working cookie/proxy and network connection.
A transient startup failure shows the signed-out state; existing authenticated
renewal still preserves drafts on temporary failures. Strict Mode, unmount,
logout and concurrent login guards still reject stale responses. Session cookie
mutations retain existing serialization/Web Locks behavior. Saved-reading-position
navigation reads the current in-memory credential. No frontend redesign is included.
Existing database sessions are not mass-revoked by installing this patch.

Registration deliberately stops returning account IDs/names or `EMAIL_EXISTS`.
The supported frontend only consumes `email` and retains its check-email/resend
flow. Duplicate signup leaves the existing account, password and verification
links untouched and does not send another email. Registration copy no longer
claims that every request sent a link. External clients relying on the former
409 or extra response fields must adapt to this intentional privacy change.

## F10 decisions and residual risks

Email identity remains trimmed, structurally validated and case-sensitive across
signup/login/recovery. No lowercasing, provider-specific dot/plus handling,
case-insensitive fallback, account merging, index change or data rewrite is
introduced. Existing case-distinct accounts remain distinct. Lowercasing without
reviewing collisions could lock users out or associate the wrong identity.
A later identity migration must privately inventory collisions, define local-part
and domain policy, verify ownership and resolve collisions, then change storage,
lookup and uniqueness together with a tested rollback plan. No such inventory
was run against hosted data and no migration is approved here.

Eligible signup/recovery/resend requests still await email delivery. Generic
responses and login bcrypt equalization remove direct response disclosures and
the trivial absent-user hash shortcut; they do not guarantee constant timing.
Provider delays, database state and older bcrypt costs can remain distinguishable.
Durable queued delivery needs its own reviewed reliability/retention design;
fire-and-forget serverless email and arbitrary sleeps are not safe substitutes.
Existing throttles remain, and correct-password unverified-login feedback is
preserved. F10 is therefore not represented as fully closed or risk-accepted.

## Verification

- 136 backend authentication tests passed, including generic signup/login,
  validation, rate limits, reset rollback, cookie/CSRF controls, legacy JWT
  rejection, session issuance and replay handling. Fixtures use mocked pools
  and loopback mail delivery; no real email is sent.
- 30 PostgreSQL 14 authentication integration tests passed in a fresh local
  Docker fixture with a generated restricted runtime role. Covered full
  verification/recovery/session flows; reset rejection of every old access and
  refresh credential; other-account isolation; both deterministic login/reset
  lock orderings; and concurrent refresh/reset. Disposable database, role and
  container cleanup completed. No preview or production database was contacted.
- 120 focused frontend tests passed across 14 files covering auth, private-state,
  reader ownership, proxy and navigation. The isolated production build passed.
- Changed-file ESLint review found four pre-existing errors (effect state update,
  two unused catch variables, and a test render side effect). No new lint errors
  are introduced; the new hook dependencies are explicit. Lint is not a current
  CI job. These existing issues are disclosed rather than broadly refactored.
- Review of the change set includes secret/file inventory and whitespace checks.
  No credentials or private connection strings are added. A full dependency
  advisory refresh and history-wide secret scan belong to Stage 5, not this
  interim verification. Existing dependency findings remain open.
- Normal repository CI runs on the Stage 1 PR. Its result must be reviewed before
  merging. No CI configuration or GitHub protection settings are changed here.

## Release prerequisites and rollback

Do not deploy or merge automatically. Verify the exact reviewed commit in an
isolated HTTPS preview only after separate deployment approval, including cookie
restoration after reload, multiple tabs, login/signup/resend/verification, reset,
old-token rejection and renewal. Vercel branch deployment gates are unchanged;
the feature branch is disabled by the committed deployment configuration.
No Vercel/Neon setting, key, connection, permission or split-mode change is made.

The existing production branch predates the main-branch session model. This PR
neither changes production keys nor approves invalidating production users.
Before eventual promotion, separately approve the session-schema/grant rollout,
production token retirement/user notice, deployment correspondence and backup/
rollback readiness described in Sessions.md and the original audit. Reverting
to stateless authentication can reaccept old credentials and must not be an
unreviewed rollback strategy. Overall production readiness remains **not signed
off** while the original blockers and infrastructure assurance gates remain.

## Separate migration workstream: read-only documentation check

Per the user's clarification, preview database separation remains paused.
Reviewed Database_Migrations.md, Schema_Snapshot_Review.md and
Auxiliary_Schema_Reconciliation.md without accessing connection values or databases.

- Found project-specific direct migration variable names, `sslmode=verify-full`
  requirements, schema/adoption checks, an operator sequence, runtime cutover
  guidance and rollback/recovery requirements.
- Found references to private schema-only snapshots and auxiliary backup tables.
  Those references are not evidence of a verified restorable backup.
- Did not locate the referenced separation plan sections §13 and §16.6–16.7,
  a preview project/branch/database/role identity attestation, approved private
  connection-reference locations, a verified backup/recovery point, or a
  successful isolated restore/rollback verification record in the reviewed docs.
- Missing records remain missing; no approval or verification is inferred.
  No migration preparation/execution, role deletion, credential rotation,
  hosted connection, data copy, grant change, split-mode activation or Vercel
  change is part of this security PR.
