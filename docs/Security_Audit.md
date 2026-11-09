# Gnosis security audit

**Assessment date:** November 7, 2026, America/Chicago. Public HTTP observations were collected November 8, 2026, approximately 04:37–04:45 UTC (November 7 locally).

**Website:** <https://studygnosis.com>

**Repository:** `yoni871/Gnosis`

**Primary source revision:** `14de721c5708fc6ee52d38ab289945683f712f49` (`main` when the assessment began).

**Production-branch comparison:** `1853b92646aeae189a21acc37d593bdc9d8b1092`.

**Change scope:** assessment only; this report is the only tracked change. No fixes, package upgrades, database operations, deployments, cloud-setting changes, or merges were performed.

## Executive assessment

**Do not approve a new production promotion on the basis of the current security posture.** Address the session-revocation defect, complete the infrastructure verification gates, and review the medium-severity controls below before promotion. This recommendation does not establish that the existing site has been compromised or require an unplanned shutdown.

The application has substantial working safeguards: parameterized queries, user-scoped private-data operations, bcrypt hashing with a byte-length guard, cryptographically random hashed recovery tokens, transactional recovery flows, and, on `main`, short-lived JWTs with revocable rotating refresh sessions. No Critical vulnerability, confirmed SQL injection, executable XSS sink, or cross-user authorization bypass was identified in the reviewed paths. This is a bounded assessment, not proof that no such flaw exists.

The most consequential confirmed defect on `main` is that resetting a password does not revoke existing sessions. The separate `production` branch is older: its login issues seven-day stateless JWTs and its frontend logout only removes local state. The newer session/recovery implementation must not be described as live merely because its tests pass on `main`. Public API-root CORS behavior is consistent with that older branch, but no authenticated production requests or deployment-to-commit attestation were performed.

### Finding counts

These are **13 assessment findings**, including conditional risks and an explicit infrastructure-verification finding. They are not the npm advisory totals, and they are not all remotely exploitable vulnerabilities.

| Severity | Count | IDs |
| --- | ---: | --- |
| Critical | 0 | None identified |
| High | 1 | F01 |
| Medium | 8 | F02–F09 |
| Low | 3 | F10–F12 |
| Informational | 1 | F13 |

### Top five risks

1. **F01 — incomplete session revocation:** a recovered account can retain an attacker's existing session; the production branch still uses long-lived stateless tokens.
2. **F13 — unverified deployment/database boundaries:** production/preview separation, runtime grants, TLS verification, backups, and deployed revision have not been independently attested.
3. **F04 — resource abuse:** ordinary public reads, refresh requests, and saved-data operations lack application-level budgets in several important paths.
4. **F02 — private information in error logs:** some controllers pass raw database errors to the console.
5. **F05 — known dependency and Node.js security debt:** current tooling advisories remain unresolved and CI pins an old Node.js patch. No production exploitability of those tooling advisories was demonstrated.

**Critical vulnerabilities requiring immediate attention:** none identified. **Highest-priority confirmed remediation:** F01, before promoting account-recovery/session code for production use.

## Method, evidence, and limits

### Work performed

- Reviewed all Express route registrations and their controllers/services, authentication/session/recovery flows, frontend private-state and rendering paths, the same-origin auth proxy, three-project pool selection, schemas/migrations, deployment configuration, dependency manifests/lockfiles, and GitHub Actions.
- Ran read-only `npm audit --package-lock-only --ignore-scripts --json` checks for backend, frontend, and offline importer. No install, update, or lockfile modification occurred.
- Ran **232 relevant backend tests: all passed**. The selection covered auth, sessions, recovery, validation, throttling, HTTP dependency security, configuration guards, migration configuration, database-pool routing, reading state, cross-project validation, cache headers, original-language APIs, and licensed-provider behavior. Tests used sanitized environments, mocked pools, and loopback fixtures; no database was contacted.
- Ran **150 distinct relevant frontend tests** across 11 files: auth context/epoch guards, private-state hooks and StudyPage behavior, login/registration, verification/reset/forgot-password, auth services, and the auth proxy. The initial parallel run had 138 passes and 12 five-second timeouts in three files. Those three files were rerun serially with a 20-second CLI timeout; all 26 tests in them passed. No assertions remained failing, and no test configuration or code was changed.
- Added temporary, uncommitted audit harnesses **outside the repository**. They executed the actual Express reset/session paths with an injected in-memory pool, checked seven non-owner resource requests and ownership SQL, checked cookie attributes and private cache headers, captured a synthetic private error marker in the logging sink, and reproduced the licensed-provider budget race. These checks demonstrate code behavior with simulated database results; they are not PostgreSQL or production penetration tests.
- Ran checksum-verified **Gitleaks 8.30.1**, default rules and redaction, across fetched reachable Git history: **zero findings**, 163 commits with patches scanned, approximately 492.27 MB. There were 205 reachable commits including merges at this snapshot. Historical tracked credential-like files found by the filename inventory were the two `.env.example` templates. The public JavaScript bundle also produced zero Gitleaks findings. These scans do not cover deleted/unfetched refs, forks, provider secret stores, every binary/archive payload, or every possible secret format. A negative scan is not a guarantee of absence.
- Checked package lockfile integrity fields; all package entries requiring integrity had them. Verified the vendored `xlsx-0.20.3.tgz` against its lockfile integrity value. Existing workspace lockfiles matched the audited lockfiles before reusing installed test tools.
- Read GitHub effective branch rules/ruleset metadata. Queried settings only; no rule was changed.
- Live checks were limited to a public homepage GET, its referenced JavaScript asset GET, an HTTP redirect HEAD, and a public API-root HEAD at the origin referenced by that bundle. No login, credential guessing, malformed payload testing, private API reads, load generation, or user-data access was performed against the live site.

### Not verified

There was no authenticated Vercel/Neon control-plane session. Actual environment values/scopes, deployed function bundles/permissions, production database grants, network allowlists, secret rotation history, account access/MFA, runtime Node/PostgreSQL patches, log access/retention, WAF/spend controls, recovery windows, and restore readiness remain unverified. No production or preview database connection was made. Split mode was neither enabled nor tested against hosted databases.

The `production` branch comparison establishes source differences, not the exact revision currently serving every live route. The homepage asset and public API headers are observations of that snapshot only. Preview deployments were not scanned. Detailed temporary logs and scan artifacts are deliberately excluded from Git and from this report.

## Findings

### F01 — Password reset does not invalidate existing sessions; production branch retains stateless sessions

- **Severity / status:** **High — confirmed in source and local synthetic runtime checks**. Production-branch behavior is confirmed in that branch's source; live deployment correspondence is unverified.
- **Affected files/endpoints:** `backend/src/routes/authRoutes.js:694` and `:776` (`POST /api/auth/reset-password`); `backend/src/services/sessionService.js:26`; `backend/src/middleware/authMiddleware.js:44`. At production revision `1853b92`, also `backend/src/routes/authRoutes.js:290`, `backend/src/middleware/authMiddleware.js`, and `frontend/src/context/AuthContext.jsx:127`.
- **Evidence:** reset changes `users.password_hash`, consumes/supersedes reset tokens, and commits without updating `auth_sessions`. The middleware/refresh service authorize sessions using revocation/expiry state, without checking password-change state. A local successful reset was followed by HTTP 200 for the pre-reset access credential and HTTP 200 for refresh of an existing session. Production-branch login uses `expiresIn: "7d"`; its logout has no server revocation call and its backend has no session lookup. `main`'s logout/logout-all endpoints do revoke sessions, but reset does not invoke that protection.
- **Potential impact:** someone who already holds a stolen session can retain access to notes, bookmarks, highlights, and profile information after the owner resets the password. On `main`, refresh can preserve access until the session's original seven-day expiry; on the older production source, a stolen JWT remains valid until expiry. This does not imply a passwordless initial takeover.
- **Recommended fix:** revoke all user sessions atomically with a successful reset; serialize session issuance against password changes or recheck a credential/session version so a concurrent old-password login cannot create a surviving session after revocation. Add recovery notifications and a regression check for both old access and refresh credentials. Promote the newer session model only after this gap and deployment prerequisites are addressed; verify that old stateless tokens fail closed during cutover.
- **Difficulty:** Medium; requires auth concurrency/regression coverage and a reviewed release, not merely a frontend logout change.
- **Production blocker:** **Yes**, for promotion of the current account-recovery/session implementation. The production-branch revocation gap also warrants prompt remediation planning.
- **Reference:** [OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) recommends invalidating existing sessions during recovery.

### F02 — Raw database errors reach server logs outside authentication

- **Severity / status:** **Medium — confirmed logging behavior; real-user leakage not tested**.
- **Affected files/endpoints:** `backend/src/controllers/notesController.js:58`, `:81`, and its other catches; `bookmarksController.js`, `highlightsController.js`, `readingStateController.js:41`; `backend/src/services/highlightsService.js:99`; `backend/src/db/db.js:65`. Applies to private CRUD endpoints and database failures.
- **Evidence:** these paths call `console.error(error)` or log `error.message`, unlike the controlled `logAuthFailure` helper. A synthetic PostgreSQL-style error with a private marker in `detail` reached the console sink during note creation while the HTTP response remained generic. Database diagnostics can include submitted values, failing-row details, or connection metadata. No actual private data or connection information was collected.
- **Potential impact:** private study data or infrastructure details can be copied into Vercel/forwarded logs, extending access and retention beyond the application database. Exploitation depends on the error contents and log access; public HTTP disclosure was not demonstrated.
- **Recommended fix:** use a consistent structured allowlist of route/error category/safe code and a request correlation ID. Exclude full errors, queries/parameters, tokens, provider URLs carrying credentials, and connection details. Review existing log access, retention, and redaction with an authorized operator.
- **Difficulty:** Small–Medium.
- **Production blocker:** **Yes before expanding production private-data use**, unless an independently verified platform redaction control demonstrably removes these fields.

### F03 — Missing browser security headers, including CSP and framing controls

- **Severity / status:** **Medium — confirmed on the sampled public homepage; source-wide policy absence confirmed**.
- **Affected files/endpoints:** `frontend/vercel.json`, `frontend/index.html`, `backend/src/app.js`; public HTML routes including `/`, `/login`, `/register`, and recovery routes.
- **Evidence:** the sampled homepage returned HSTS but no `Content-Security-Policy`, CSP `frame-ancestors`, `X-Frame-Options`, `X-Content-Type-Options`, explicit `Referrer-Policy`, or `Permissions-Policy`. No equivalent CSP meta policy was present. The source Vercel headers configure asset caching, not a site-wide browser policy. The public API root likewise lacked application hardening headers and exposed `X-Powered-By: Express`.
- **Potential impact:** the UI lacks an explicit anti-framing policy and has less defense against script injection and unintended resource connections. Combined with browser-readable access credentials (F11), any future XSS would have greater account impact. This finding is not evidence of an existing XSS exploit. SameSite cookies and browser default referrer handling still provide some protection.
- **Recommended fix:** inventory script/style/connect/frame requirements, introduce a tested CSP in report-only mode, then enforce it with restrictive `frame-ancestors`, `object-src`, and `base-uri`; add `nosniff`, a suitable referrer policy, and a minimal permissions policy. Account for the existing inline preload script and JSON-LD with hashes/nonces or a reviewed alternative; do not resolve violations by broadly allowing unsafe scripts. Retain HTTPS/HSTS.
- **Difficulty:** Medium; CSP needs real reader/recovery/provider-flow verification.
- **Production blocker:** **Yes for production sign-off until framing/script policy is implemented or explicitly risk-accepted**. No current injection was found.

### F04 — Incomplete request, query, storage, and collection budgets

- **Severity / status:** **Medium — confirmed code-level control gaps; production exhaustion not attempted**.
- **Affected files/endpoints:** `backend/src/app.js:29`; `backend/src/routes/searchRoutes.js:13`; `backend/src/routes/authRoutes.js:369`; private notes/bookmarks/highlights routes; `backend/src/controllers/notesController.js:16`, `:66`; `backend/src/db/db.js:57`; `frontend/api/auth/[...path].js:86`.
- **Evidence:** public database searches and most saved-data endpoints have no app-level rate limiter. Structurally valid refresh cookies can cause database work without a refresh limiter. Notes/bookmarks/highlights reads return complete user collections without pagination; note content, saved-record counts, and verse-array lengths have no explicit product-level quotas. Note passage validation is largely presence-based rather than complete typed/range validation. Search text and very large page/offset values lack explicit application bounds. Pools bound concurrent connections but do not configure runtime statement/lock/query execution timeouts. The auth proxy buffers the complete inbound body before Express parses it, and the 15-second fetch timeout starts afterward.
- **Existing limits / qualification:** Express's default JSON limit is about 100 KB; search responses have limits, original-language passage/occurrence APIs have explicit caps, auth attempts have limiters, and licensed misses have visitor limits. Vercel documents a [4.5 MB function payload limit](https://vercel.com/docs/functions/limitations). Therefore the proxy is **not literally unbounded in the intended hosting environment**. These limits do not provide per-user storage budgets, global database execution budgets, or assurance about configured WAF/rate controls.
- **Potential impact:** repeated uncached queries, invalid-but-structured refresh requests, and an authenticated user's growing saved-data collection can consume connection time, database storage, response budget, or serverless quota. Invalid note coordinates can also create integrity/error-handling problems. No traffic-volume or maximum-capacity claims are made.
- **Recommended fix:** define endpoint-specific budgets and safe IP/account throttles; paginate private collections; bound search/offset and note/passages/selection sizes; use appropriate statement/lock timeouts; enforce body/content-type/method limits before proxy buffering. Preserve owner checks and existing public-content caching. Verify provider WAF/concurrency/spend settings rather than assuming them.
- **Difficulty:** Medium.
- **Production blocker:** **Yes unless effective equivalent platform/application controls are demonstrated**. No live load test is required to establish these source gaps.

### F05 — Known tooling advisories and outdated CI Node.js patch

- **Severity / status:** **Medium — confirmed affected dependency versions; production exploitability not established**. Upstream advisories include High severity, but application exposure is assessed separately.
- **Affected files/endpoints:** `backend/package.json`, `backend/package-lock.json`, `frontend/package.json`, `frontend/package-lock.json`, `.github/workflows/ci.yml:31` and other Node pins. Primarily development, lint/build, and migration execution; no affected application endpoint was established for these tooling advisories.
- **Evidence:** fresh npm audit reports **4 Moderate backend package records** and **4 High + 4 Moderate frontend package records**. The offline importer reports zero. Details and patched floors are below. The four-backend/eight-frontend totals previously noted in `docs/Security_Review_PR61.md` remain present; they were not assumed fixed. The workflow pins Node **22.14.0**, predating multiple Node security releases. The [October 2026 Node bulletin](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) identifies **22.23.4** as a security release in that line. Actual Vercel runtime patches were not inspected.
- **Potential impact:** adversarial inputs reaching vulnerable development/migration/build tools can cause excessive CPU/memory use; some Vite/launch-editor advisories have command-execution implications under specific editor/OS/dev-server conditions. A static Vercel frontend is not a Vite development server. No Gnosis path passing web-user data to these tooling APIs was found. Build tools and migration tooling can nevertheless run with valuable filesystem or operator privileges.
- **Recommended fix:** prepare scoped, compatibility-tested parent/transitive updates and move CI/developer/runtime Node to a current patched supported release. Keep dev servers loopback-only and never supply production secrets to untrusted PR tools. Do not run blanket force-upgrades or downgrade migration/ESLint majors merely because npm suggests them. Add an advisory-monitoring/triage process.
- **Difficulty:** Small for patch-level updates; Medium for `glob`/`minimatch` parent compatibility and migration-tool changes.
- **Production blocker:** **Conditional**: block if an affected dev server/tooling path or vulnerable runtime is exposed to untrusted input. Otherwise track and promptly remediate tooling debt with documented risk acceptance; npm counts alone do not prove a production RCE.

### F06 — Client-IP trust and distributed account-abuse protections need verification

- **Severity / status:** **Medium — conditional configuration/design risk; no live rate-limit bypass attempted or confirmed**.
- **Affected files/endpoints:** `frontend/api/auth/[...path].js:92`, `backend/src/app.js:27`, `backend/src/utils/rateLimit.js:43` and `resolveTrustProxy`; login, registration, recovery, verification, licensed translation misses.
- **Evidence:** the proxy forwards incoming forwarding headers. Backend `req.ip` depends on the deployment's `TRUST_PROXY` value and actual proxy chain. The validator accepts broad `true` and numeric-hop configurations as well as CIDR allowlists, but cannot prove they match the host topology. Actual deployment header sanitization/trust values were unavailable. Auth policies cap IP and IP+email combinations, not cross-IP attempts or delivery to a single account. No compromised-password screening, MFA, or distributed-risk challenge was found.
- **Potential impact:** a wrong trust policy can let clients vary their apparent address or merge all clients into one bucket. Even correctly enforced IP limits do not alone stop a distributed credential-stuffing or reset-email flood. The design intentionally avoids account-only hard lockouts to prevent attacker-induced account denial; that is a valid concern, not a reason to remove existing limits.
- **Recommended fix:** verify the full Vercel frontend-to-backend header chain using a controlled local/authorized preview fixture; reject untrusted forwarding inputs and configure only known proxy paths. Add non-locking account delivery cooldowns and risk-based challenges/monitoring for cross-IP abuse; consider breached-password screening and stronger optional authentication.
- **Difficulty:** Medium.
- **Production blocker:** **Yes until the deployed client-IP boundary is attested**; distributed-abuse enhancements can follow a documented risk decision.

### F07 — Release rules require a PR but no approving review or successful CI contexts

- **Severity / status:** **Medium — confirmed GitHub settings and workflow gap**.
- **Affected configuration:** effective rules for `main` and `production`; `.github/workflows/ci.yml:3`; branch-triggered deployment settings in `frontend/vercel.json`, `backend/vercel.json`, and `docs/Deployments.md`.
- **Evidence:** the active repository ruleset applies to the default branch and `production`, has no bypass actors, prohibits deletion/non-fast-forward pushes, and requires a PR. However, `required_approving_review_count` is **0**, `required_status_checks` is **empty**, and last-push approval/review-thread resolution are not required. Classic branch-protection endpoints returned 404, but effective rulesets **are present**; describing both branches as unprotected would be incorrect. CI's pull-request/push filters target `main`, not promotion PRs targeting `production`. Configuration enables branch-triggered deployments for main/production but not feature branches.
- **Potential impact:** a PR can be merged without an independent approval or named passing checks, including a production promotion. Tests may run but are not enforced as a merge gate by the observed rules. This is a governance/control gap, not anonymous repository write access.
- **Recommended fix:** require appropriate approvals and current successful check contexts for both integration and promotion, explicitly cover production-targeted PRs, and define a reviewed emergency process without broadly exempting routine changes. Keep the existing no-force-push/no-deletion protections and read-only workflow token permissions.
- **Difficulty:** Small–Medium; branch settings and promotion workflow changes require separate approval.
- **Production blocker:** **Yes for a controlled production-release process**.

### F08 — Privacy, deletion, and retention behavior is not defined for saved study data

- **Severity / status:** **Medium — confirmed source/documentation gap; operational handling unverified**.
- **Affected files/endpoints:** `frontend/src/App.jsx`, public footer components, `backend/src/routes/authRoutes.js`, private CRUD routes, `database/migrations/app/20261106210000_add-sessions.sql`, recovery-token migrations.
- **Evidence:** no privacy-policy route/document, published account-deletion process, or self-service account-deletion endpoint/UI was found in the reviewed source. Individual saved items can be deleted, and user foreign keys cascade if an operator deletes a user, but that is not a documented user-facing process. Expired/used session, refresh, and recovery rows have no demonstrated scheduled retention purge; auth rate-limit rows and licensed caches do have cleanup mechanisms. Production log/backup/email-provider retention settings were unavailable.
- **Potential impact:** users cannot understand who processes their email/study activity, how long private records persist, or how to request deletion. Saved study content can reveal sensitive personal interests. Indefinite expired-auth metadata also increases storage and incident scope. This report does not make a legal compliance determination.
- **Recommended fix:** document actual data collection, purposes, providers, retention, deletion/contact process, and backup-retention exceptions; implement a verified deletion workflow with session revocation and cascades. Introduce bounded retention for expired auth artifacts and review log/provider retention. Disclose necessary email delivery and publisher usage reporting. Test deletion in disposable fixtures before any operator action.
- **Difficulty:** Medium; product policy decisions and careful lifecycle implementation are required.
- **Production blocker:** **Yes for public production sign-off on account/private-data collection until a real policy and deletion process are established**. A manual verified process can precede a self-service UI.

### F09 — Licensed-provider budget check is not an atomic reservation

- **Severity / status:** **Medium — confirmed source and deterministic local-stub reproduction**.
- **Affected files/endpoints:** `backend/src/services/licensed/licensedTranslations.js:181`, `:203`, `:233`; `backend/src/services/licensed/licensedCache.js:83`, `:95`; licensed requests through `GET /api/bible/:book/:chapter/:translation`.
- **Evidence:** the orchestrator reads the provider call count, checks it, fetches a chapter, then increments usage afterward. The in-flight map only coalesces the same chapter within one process. Two different local concurrent chapter misses starting at a simulated 4,499/4,500 count both passed the check and recorded 4,501 calls. No provider or database was contacted. Per-IP counters are atomically incremented, but that does not make the provider-wide budget atomic across requests/instances.
- **Potential impact:** concurrent requests can overspend the configured publisher budget, exhaust licensed content availability, or defeat the intended safety margin. Actual billing/licence consequences depend on the provider contract and external limits. Provider failures after a call but before accounting may also be undercounted.
- **Recommended fix:** reserve provider budget atomically in the shared store before the network call, with a documented accounting policy for failed/ambiguous calls and bounded cleanup. If strict global request coalescing is needed, use a shared claim rather than relying solely on a process-local map.
- **Difficulty:** Medium.
- **Production blocker:** **Yes before relying on configured licensed-provider budgets as hard limits**; conditional on these providers being enabled.

### F10 — Account enumeration and inconsistent email identity normalization

- **Severity / status:** **Low — enumeration confirmed in source; email-canonicalization risk is design-dependent**.
- **Affected files/endpoints:** `backend/src/routes/authRoutes.js:231` (`POST /api/auth/register`), login unknown-user path, forgot/resend flows; `backend/src/utils/authValidation.js:12`; unique email column in `database/schema.app.sql`.
- **Evidence:** duplicate registration returns explicit HTTP 409 / `EMAIL_EXISTS`, while a new address follows a different successful path. Unknown login skips bcrypt comparison, while existing-user login performs it. Generic forgot/resend bodies are good, but known eligible accounts await provider delivery and unknown/ineligible accounts do not, creating a possible timing distinction. Emails are trimmed but deliberately not lowercased; lookup and uniqueness are case-sensitive.
- **Potential impact:** a determined caller can discover some account existence despite request throttling. Case variants may create confusing duplicate identities for mailboxes whose provider treats those variants identically. No cross-account takeover from case variants was established, and local-part normalization requires a deliberate product policy.
- **Recommended fix:** use non-enumerating registration responses where practical, equalize relevant work/timing or queue delivery, and define an email identity policy with a reviewed collision/migration plan. Preserve generic reset/verification responses and avoid hard account lockouts.
- **Difficulty:** Small for response/timing work; Medium for canonicalization and existing-account collisions.
- **Production blocker:** No by itself; prioritize after session recovery and deployment gates.

### F11 — Persistent browser-readable access tokens increase future XSS impact

- **Severity / status:** **Low — confirmed storage choice; no executable XSS found**.
- **Affected files/endpoints:** `frontend/src/context/AuthContext.jsx:22`, `:97`, `:147`, `:174`; `frontend/src/pages/LoginPage.jsx:42`. Production-branch auth also uses localStorage.
- **Evidence:** access JWTs are read/written under the browser's persistent auth storage. Refresh credentials on `main` are HttpOnly, but access credentials are readable by same-origin scripts. Notes and commentary are rendered as React text; the scan found no `dangerouslySetInnerHTML`, direct HTML assignment, `eval`, or external script injection in application rendering paths. API.Bible HTML is converted to text server-side rather than injected into the browser.
- **Potential impact:** a future same-origin XSS or compromised allowed script could read access tokens and make authenticated requests. The 15-minute access TTL and server session checks on `main` reduce exposure but do not prevent active script abuse. Production's older seven-day JWT increases persistence risk.
- **Recommended fix:** evaluate memory-only access tokens plus the existing HttpOnly refresh flow, alongside CSP and an explicit startup/session-restoration design. Treat this as defense in depth; moving storage alone does not stop an XSS from acting as the current user.
- **Difficulty:** Medium.
- **Production blocker:** No standalone blocker absent XSS; informs F01/F03 remediation priority.

### F12 — Private responses lack an explicit no-store policy

- **Severity / status:** **Low — confirmed local headers/source; actual private caching leakage not demonstrated**.
- **Affected files/endpoints:** `GET /api/auth/profile`, notes/bookmarks/highlights/reading-state routes; `backend/src/app.js`; `frontend/api/auth/[...path].js` forwards upstream policy.
- **Evidence:** `main` sets `Cache-Control: no-store` on login, refresh, logout, and logout-all. Private profile and saved-data reads do not consistently set it; the local profile check returned no Cache-Control header. Public content uses separate cache middleware correctly. No authenticated production request was made, and no evidence shows a CDN served one user's response to another.
- **Potential impact:** browser/intermediary persistence is less predictable, especially on shared devices or if deployment cache behavior changes. Authorization headers and platform defaults already constrain shared caching, so absence of no-store is not proof of an IDOR/cache leak.
- **Recommended fix:** centrally apply `Cache-Control: private, no-store` to authentication/private endpoints, including relevant errors, while retaining intentional public-content caching. Review service-worker/browser caches if added later.
- **Difficulty:** Small.
- **Production blocker:** No by itself; complete before broad use of sensitive private study data where practical.

### F13 — Hosted infrastructure, least privilege, and recovery readiness remain unattested

- **Severity / status:** **Informational — explicit verification gap, not a confirmed cloud misconfiguration**.
- **Affected configuration:** Vercel production/preview environment scopes and runtime/function configuration; Neon projects/branches/roles; `backend/src/db/db.js:28`, migration configuration/runner, `docs/Database_Migrations.md:255`, and `docs/Sessions.md:125`.
- **Evidence:** repository code/documents describe the desired controls but do not prove live role grants, distinct environment databases/secrets, TLS verification, backup windows, or tested recovery. `GNOSIS_SPLIT_REQUIRED=1` checks that three URL variables exist; it does not validate distinct database identities/roles. Until that flag is enabled, fallback to the App connection is explicitly supported. The audit did not read secret values or connect to hosted databases. The public site cannot establish cloud-account permissions or backup readiness.
- **Potential impact if controls are wrong:** preview code could read/write production data; a runtime role could perform schema/administrative changes; an incomplete split could silently use the wrong store; a compromised backend could access all three runtime-readable pools; a recovery window might not cover an incident. None of these outcomes was asserted as observed.
- **Recommended verification before promotion:** obtain sanitized operator attestations for every row in the infrastructure matrix below, mapped to exact frontend/backend deployment revisions. Do not publish credentials, run hosted migrations, enable split mode, or change cloud settings as part of this assessment.
- **Difficulty:** Medium operational review; findings may require separate remediation approval.
- **Production blocker:** **Yes as an assurance gate until verified**, despite Informational severity: absence of evidence is not evidence that the configuration is unsafe or safe.

## Database and hosted-infrastructure matrix

| Area | Evidence from source | What an authorized operator must verify |
| --- | --- | --- |
| App database | Default pool owns users/auth/saved data, rate limits, licensed cache/usage. Private queries bind the verified user ID. User-related foreign keys cascade. | Dedicated restricted login, exact table/sequence grants, no superuser/owner/DDL/COPY-to-program privileges, restricted schema creation and safe search path; any RLS policy expectations. |
| Bible database | Bible services and original-language reads use `biblePool`. Cross-project saved data retains integer references validated against this pool. | Runtime read-only access to canonical reference data, separate importer/migration identity, stable book/translation IDs, correct destination after split. |
| Commentary database | Commentary catalog/entry/search queries use `commentaryPool`; the reference book mapping is copied into that project. | Runtime read-only grants, restricted operator/import roles, mapping parity and restore consistency with Bible/App data. |
| Split configuration | Pool reuse prevents multiplying connections for identical URLs; all three URLs required only when the guard flag is set. Explicit single-database fallback is intentional before cutover. | Correct database identities/roles, distinct credentials where intended, guarded cutover/rollback plan; no stale fallback accepted after mandatory split. No split was enabled here. |
| Cross-database boundary | No cross-project SQL foreign key/transaction is possible. Application validates referenced books, translations, and commentators. | Immutable reference-ID/import policy and an orphan/reconciliation strategy. One backend has all runtime pool credentials, so splitting projects does not create three independent application trust boundaries. |
| TLS and credentials | Runtime `pg` consumes server-side connection configuration. Production migration configuration requires direct `sslmode=verify-full` and separate migration variables. Committed templates hold no active credentials. | Runtime TLS certificate/hostname verification and pooling endpoint choices; independent random JWT/rate-limit/database/provider secrets; environment scopes, rotation and access logs. Neon requires TLS, but client policy still needs checking. |
| Migration safety | Explicit project/target, safe local/test identity guards, advisory lock, schema/history checks, transaction/rollback, an irreversible baseline, and production write-confirmation gate. | Actual histories/grants/schema drift, compatible expand/contract promotion, direct operator connectivity and snapshot/recovery point. No `check` or migration command was run against hosted databases. |
| Preview isolation | Documentation explicitly requires a separate preview database, runtime/migration identities, signing/rate-limit secrets and email settings. | Production/preview secrets and DB identities actually differ; previews do not clone real private data unnecessarily; preview/API deployment access is appropriately protected. |
| Vercel functions/proxy | Fixed configured auth upstream; redirects disabled; request/response hop-by-hop header filtering; 15-second upstream timeout. No user-selected destination. | Upstream origin is the intended HTTPS API for the same environment, forwarding-header sanitization, serverless filesystem/env scope, runtime Node patches, body/concurrency/WAF budgets, log access/retention. |
| Backups/recovery | Documentation requires a usable backup/recovery point and an off-production restore test; no operational success record was available. | Neon restore window and retention, RPO/RTO, who can restore, encrypted export policy if needed, a tested isolated restore, and coordinated recovery of IDs/references across all three projects. |
| Cloud accounts | No dashboard settings changed or authenticated cloud session used. | Owner/admin MFA, least-privilege team/API tokens, deployment protection, alert destinations and spend/concurrency policies. |

Reference: [Neon security overview](https://neon.com/docs/security/security-overview) describes TLS and verification support; it is not evidence that this project's particular settings were inspected.

## Dependency findings and update plan

The package counts below include npm's propagated parent records, not just independent CVEs. Backend has **two distinct advisory URLs** represented by four vulnerable package records. Frontend has **12 distinct advisory URLs** represented by eight package records. Do not add these counts to the 13 assessment findings or interpret every record as an exposed production endpoint.

| Scope / locked version | Evidence / advisory | Recommended update floor or action | Exposure and compatibility notes |
| --- | --- | --- | --- |
| Frontend `vite` **8.2.2** | Six current Vite/launch-editor advisories, including [Windows existence-check bypass](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [editor command flags](https://github.com/advisories/GHSA-r825-w8mm-5pxw), and [filesystem boundary issue](https://github.com/advisories/GHSA-rq7h-c2jc-7f22). | **8.2.4 or a later compatible patched release**; re-audit the candidate. | Dev-server/editor/filesystem paths; some issues are Windows-specific. The intended deployed static frontend does not run these paths. Dev-tunnel/remote dev-server exposure requires review. |
| Frontend `brace-expansion` **5.0.9** | [Recursive parsing DoS](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [comma-part recursion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), [quadratic parsing](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr). | **5.0.12+** for all three listed advisories. | Lint/glob dependency path. No route accepting arbitrary glob patterns found. |
| Frontend `source-map-js` **1.2.1** | [Indexed source-map offset DoS](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). | **1.2.2+**. | PostCSS/Tailwind/CSS tooling parents; no public source-map parsing endpoint found. |
| Frontend `zod` **4.5.4** | [Oversized validation collection memory exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). | **4.6.6+**. | Resolved through `eslint-plugin-react-hooks`; no production user-schema parsing path found. |
| Backend `glob` **11.1.0** | [Cancellation fails to stop filesystem traversal](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4). | **14.0.2+**, via a compatible migration-tool update or reviewed override. | `node-pg-migrate` **8.0.4** is the parent. It is declared in production dependencies but used for migration tooling, not imported by the request app. A major transitive jump requires migration regression checks. |
| Backend/frontend `minimatch` **10.2.6** | [Pattern amplification DoS](https://github.com/advisories/GHSA-g3hv-75wg-m249). | **11.0.1+**, with parent compatibility review. | Backend `glob`/`nodemon` and frontend ESLint/config-array paths. No arbitrary user glob input in the application identified. |
| Propagated package records | Backend `node-pg-migrate` **8.0.4**, `nodemon` **3.1.14**; frontend `eslint` **10.9.1**, `@eslint/js` **10.0.1**, `@eslint/config-array` **0.23.5**. | Repair their dependency chains; do not blindly accept suggested downgrade/major changes. | npm's suggested fixes include `node-pg-migrate` 7.6.1 and ESLint 9.39.5, which are not automatically appropriate for this codebase. |
| CI Node **22.14.0** | Predates later Node security releases; [October 21, 2026 bulletin](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) ships **22.23.4**. | A **current patched supported Node 22 release**, at least the bulletin's fix level; verify the actual Vercel runtime separately. | Individual Node CVE reachability varies. No Node exploit was executed; CI's old pin is confirmed, cloud runtime version is not. |

**Previously addressed or clean in this snapshot:** Express **5.2.1** resolves `body-parser` **2.4.0**, `qs` **6.17.1**, and `proxy-addr` **2.0.8**. Existing HTTP security regression tests passed and the fresh registry audit did not flag these dependencies. bcrypt **6.0.0**, jsonwebtoken **9.0.3**, pg **8.23.0**, React/React DOM **19.2.8**, and React Router DOM **7.18.3** were not identified by this scan as advisory-affected. That is a scan result, not a permanent security guarantee.

The offline importer uses a lockfile-integrity-verified vendored SheetJS **0.20.3** and pg **8.23.0**; its audit returned zero advisories. This avoids assuming the old npm-hosted SheetJS release is in use. A malicious workbook remains an untrusted local operator input; there is no public file-upload endpoint in the reviewed application. No unnecessary package was conclusively identified without a separate dependency/bundle-usage audit. Consider separating operator-only migration tooling from the runtime artifact when implementing the update plan.

## Controls implemented correctly and coverage conclusions

| Area | Assessment |
| --- | --- |
| Identity and ownership | All mounted private routes use authentication middleware. Profile and reading state derive identity from JWT claims. Notes/bookmarks object queries include record ID **and** user ID; list queries are user-scoped. Highlight get/delete/passage mutations are user-scoped. Writes derive user ID from the verified principal, not a supplied body field. Static review plus seven synthetic non-owner requests found no IDOR; real hosted data was never queried. |
| SQL injection | Application values use PostgreSQL placeholders, including search. The original-language query interpolates only one of two fixed SQL fragments; the actual Strong's/lemma value remains bound. No user-controlled SQL identifier/template path was identified in request handlers. Administrative importer/migration code has separate trust requirements and was not exposed through an HTTP upload/command endpoint. |
| Password storage | bcrypt cost 10; registration/reset minimum eight Unicode characters with a 72 UTF-8-byte maximum to prevent bcrypt truncation. Passwords are not trimmed; login accepts existing shorter passwords intentionally. This is a baseline, not breached-password screening or MFA (F06). |
| Recovery and verification | Random 32-byte link tokens; only hashes stored; one-hour reset/24-hour verification expiry; format validation before expensive work; token reuse/supersession checks and deterministic row locking; no automatic login on reset/registration. Reset/verification tokens arrive in a URL fragment and are removed from the displayed URL into component memory. Provider sending occurs outside database locks with a timeout. Session revocation remains F01. |
| Main session model | Fifteen-minute HS256 access JWTs with explicit algorithm, issuer, audience, claim-type checks, and database-backed session expiry/revocation. Random refresh credentials are hashed, rotated transactionally, and reuse revokes the session family. Refresh expiry is absolute, not extended indefinitely. Logout and logout-all exist server-side on `main`; their frontend helpers preserve local invalidation even on failures. Production source has not yet adopted this model. |
| Cookies and CSRF | Under synthetic production settings, refresh cookies had HttpOnly, Secure, SameSite=Strict, and the restricted auth path. Cookie-based refresh/logout require a custom header and reject mismatched browser Origins. Logout-all uses bearer authentication. JSON private APIs use bearer credentials rather than ambient cookies. `NODE_ENV`, actual cookie behavior, and browser/backend origin configuration still require hosted attestation. |
| CORS | `main` pins a configured frontend origin with credentials. The sampled deployed API root returns wildcard ACAO, matching the older production source, and did not advertise credentialed CORS. Wildcard access to a public health response is not itself an authentication bypass; current-main configuration cannot be assumed deployed. |
| XSS and frontend data | Notes and commentary are rendered as React text, not injected HTML. User name/feedback/search display paths reviewed do not use raw HTML sinks. URL query values select bounded resource state/reader locations, not arbitrary redirects or script destinations. No executable XSS was demonstrated; CSP/storage defense gaps are F03/F11. |
| Async/private state | Epoch/session guards invalidate late auth responses; private drafts, notes, highlights, bookmarks, and reading-state responses are guarded/reset across user changes. Relevant tests passed after resolving scheduling timeouts. |
| SSRF and proxy | Auth upstream is server-configured, not request-selected; traversal/redirect tests pass. Email production delivery uses its fixed provider, and licensed providers have fixed base URLs plus mapped book identifiers. No arbitrary-URL fetch endpoint or SSRF path was found. Cloud upstream configuration still needs review. |
| File uploads | No public file-upload route, multipart handler, or application path executing uploaded files was identified. Offline workbook/content imports are operator tools, not browser upload APIs. |
| Error responses | Auth and top-level errors are generic JSON and auth logs use controlled metadata; malformed JSON is handled without a public stack trace. Non-auth raw logging is F02; body-size/type failures are not consistently given purpose-specific client status codes and should be addressed with F04. |
| Rate limits | Shared PostgreSQL-backed auth counters, keyed by HMAC rather than raw emails/IPs, with transactional reservations, Retry-After, bounded cleanup, and fail-closed storage failures. Licensed per-IP counters are shared and atomically incremented. F06 concerns the deployment identity boundary and distributed abuse; F09 concerns the separate provider-wide budget. |
| Outbound services and privacy | No added client analytics or externally loaded executable script was found in reviewed source. Fonts are self-hosted. Resend necessarily receives recipient email and recovery/verification links; publisher APIs receive requested passages and API.Bible FUMS receives its usage token plus generated process/session identifiers. The implementation does not explicitly forward the reader's email or raw IP in that FUMS request, but provider/linkage/retention policies were not independently audited. Publish the actual processing policy (F08). |
| Supply chain | Lockfiles contain integrity values; vendored workbook parser integrity verified. Official checkout/setup-node actions are pinned to full commit SHAs, workflow permissions are `contents: read`, and checkout disables persisted credentials. No `pull_request_target` execution or deployment job was found in the reviewed workflow. Required merge gates and tooling updates remain F05/F07. |
| Local/production separation in tooling | Local setup uses generated credentials, ignored private files, loopback bindings and identity guards. Test launchers sanitize database/environment defaults; test pools reject hosted/unsafe identities. These are code safeguards, not proof of production/preview isolation. |

## Public observations and production correspondence

| Observation | Result | Interpretation |
| --- | --- | --- |
| HTTP homepage HEAD | 308 redirect to HTTPS | HTTPS enforcement observed for the sampled hostname. |
| HTTPS homepage GET | 200; HSTS `max-age=63072000`; Vercel-served static HTML | Transport hardening observed; missing browser policies listed in F03. |
| Public API-root HEAD | 200 JSON; HSTS with includeSubDomains/preload; wildcard ACAO; Express header | No user data was requested. Header behavior resembles the production-branch CORS setup, not current `main`'s exact-origin setup. |
| Public JavaScript asset | Downloaded the asset referenced by the homepage; secret scan returned zero findings | Does not prove all deployments/assets are secret-free or identify a complete deployed commit. API-origin strings are public configuration, not secrets. |
| GitHub branch rules | Active PR/no-deletion/no-force-push rules, no bypass actors; zero required approvals and empty required checks | Existing protections should be retained; F07 addresses missing review/CI enforcement, not absence of all protection. |
| Main vs production source | Production branch is an ancestor and lacks main's new session service, reset flow, reading-state/split work and deployment configuration changes | Production must be assessed/promoted separately. No claim that passing main tests certifies live runtime behavior. |

## Recommended remediation order

1. **Contain and correct session recovery/revocation (F01).** Design/test reset-to-session invalidation and concurrent login handling; establish how existing production tokens will be retired. Do not change production data or signing keys without a separately approved cutover plan.
2. **Complete operator evidence and release gates (F13, F06, F07).** Attest deployment revisions, preview/production separation, least privilege, trusted client IP, strict runtime TLS, patched runtime, backups/restore, and enforce actual review/check contexts. Keep split mode unchanged until its own approved migration/cutover review.
3. **Reduce private-data exposure (F02, F03, F08, F12).** Redact logs, establish privacy/deletion/retention processes, set private no-store headers, and deploy a tested browser/header policy through an approved release.
4. **Bound abuse and licensed-resource use (F04, F09).** Add endpoint/storage/query budgets, safe proxy intake limits, and atomic provider reservations. Use local/disposable fixtures; do not load-test the live site.
5. **Apply scoped dependency/runtime updates (F05), then identity/storage hardening (F10, F11).** Patch the dependency chains and CI Node version with relevant tests; plan email identity normalization and any access-token storage change deliberately. Tooling updates can proceed in parallel with higher-priority remediation once approved.

### Production decision

**Not approved for production promotion yet.** There is one confirmed High finding, several Medium control gaps, and material infrastructure items that could not be verified. No Critical issue or evidence of compromise was found within this scope. Closure requires reviewed fixes or explicit risk decisions for the identified controls, plus sanitized evidence for the deployment/database/recovery gates—not broader access to real user data during testing.

**Stop point:** this assessment is complete. Implementation, package upgrades, cloud/database changes, deployments, merges, and split-mode enablement require a separate approval. None has been performed by this audit.
