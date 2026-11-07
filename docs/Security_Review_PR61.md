# PR #61 GitGuardian review

Incident: **39793983**. Reported commit: **1977a5f**. File: `compose.local.yaml`.

## Flagged configuration

```yaml
POSTGRES_PASSWORD: ${MIGRATION_DB_PASSWORD:?Run local:setup}
```

This is Docker Compose interpolation, not a credential. The `:?` operator requires a nonempty environment value and fails if it is absent; `Run local:setup` is an error message, not a fallback password. The same reference remains in the current configuration. No detector suppression or replacement with a hardcoded password is appropriate.

## Credential lifecycle and exposure

`backend/scripts/local/setup.js` uses Node's cryptographic `randomBytes`: 24 bytes (192 bits) independently for each database password, and 32 bytes (256 bits) independently for each signing/rate-limit secret. It exclusively creates `backend/.env.local` with mode `0600` and preserves existing credentials on reruns. The authentication smoke check also generates its password cryptographically and stores it in `.local/verification-account.json`, mode `0600`, inside a `0700` directory. Both paths are Git-ignored. Committed `.env.example` files contain blank secret fields.

Compose obtains the owner password from the private environment file, not from Git. PostgreSQL publishes only `127.0.0.1:55432`; Mailpit publishes only `127.0.0.1:8025`. Mailpit's SMTP port is not published and it has no relay configuration. The local backend binds `127.0.0.1:5000` and Vite binds localhost. Neither the frontend nor Mailpit receives the database credentials. Runtime and migration roles use separate passwords; local database identity and loopback guards remain enforced.

Docker administrators can inspect container environment variables, including the database password. Processes under the same OS account may also read local configuration. This is a local trust boundary, not a public secret store. Do not publish resolved `docker compose config` output, `docker inspect` environment output, `.env.local`, captured verification emails, or `.local` files. Mailpit contains authentication links and is for trusted local use only. Do not add public port bindings, tunnels, or remote Docker contexts.

## GitGuardian disposition

For this interpolation finding, choose **Ignore incident → False positive (not a secret)** (API reason `false_positive`). Do not choose a test-credential or low-risk-secret reason: the flagged string is not a credential at all. **Resolved / Secret revoked** describes a real secret that was remediated and is inappropriate here. Apply the decision to incident 39793983 only; retain scanning for actual credentials.

Reference: [GitGuardian incident statuses](https://docs.gitguardian.com/internal-monitoring/detect/incident-statuses).

The GitGuardian dashboard has not been changed by this review. A workspace member must apply the incident disposition there. No rotation or Git history rewrite is needed for an environment-variable reference.

## Verification

Reviewed on 2026-11-07 at PR head `2282b08`, against `origin/main` at `9caf3ca`. The PR has six branch-only commits, including the original flagged commit and both main merges; review includes intermediate history, not only the final diff.

- Gitleaks **8.30.1**, official release checksum verified, default rules, no custom allowlist or baseline: `gitleaks git --redact --log-opts="--all" --report-format json --report-path <private-report>` exited **0**, with **zero findings**. It processed 147 commits with patches, approximately 491.84 MB, across all fetched reachable refs (189 reachable commits, including merges).
- Historical tracked credential-file check found only `backend/.env.example` and `frontend/.env.example`; no actual environment files or private key files. Current local environment and smoke-account files are ignored and untracked; actual modes verified as `0600` / parent `0700`.
- Exact-value comparison of the four generated local environment secrets and smoke-account password against all reachable Git patch history (including merge-parent patches) found **zero matches**, without emitting the values.
- Resolved Compose and live container bindings were inspected in memory without printing environment values: PostgreSQL and Mailpit publish loopback only; Mailpit SMTP is unpublished. No external credential validation or production database access was performed.
- `npm test --prefix backend`: **221 passed, zero failed**, including configuration, authentication, session, origin, cookie and dependency-security regression tests. An initial sandboxed invocation failed to bind test sockets (`EPERM`); rerunning with local socket access passed.
- `npm run local:check`: all four stored translations (124,377 verses), all 26 commentary collections (323,113 entries), reader APIs, Bible and commentary search, pagination, and Original Language (774 words) passed. Five licensed providers are explicitly unavailable without development credentials.
- `npm run local:test`: real local email verification, login, secure cookie properties, session renewal, origin rejection, logout, and unchanged highlights/bookmarks/notes/reading progress passed.
- Existing GitHub application checks at the reviewed head passed: backend, offline importer, frontend tests/build, PostgreSQL 14 and 18. GitGuardian alone remains failed pending incident disposition. This documentation change does not alter application behavior.
- Fresh `npm audit` reports **four moderate backend advisories** and **four moderate plus four high frontend advisories**. Dependency versions and backend/frontend/importer lockfiles are unchanged from main. These existing dependency issues remain separate work; this review does not certify the entire application free of vulnerabilities or force potentially breaking upgrades.

No genuine committed secret was identified by these checks or the configuration/history review. Synthetic test credentials are fixtures, not live credentials. Secret scanners cannot prove the absence of every possible secret, and this review covers fetched reachable history, not unrelated forks, deleted remote refs or private GitGuardian workspace data.

**Conclusion:** incident 39793983, as reported for the Compose interpolation, is a false positive. No credential rotation, detector suppression, or history rewrite is warranted. PR #61 has no identified credential-exposure blocker; apply the incident-specific false-positive disposition and require normal CI/merge policy before merging. The existing dependency advisories remain disclosed and should be assessed independently.
