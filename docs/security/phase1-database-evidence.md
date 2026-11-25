# Phase 1 controls #7–#9: database evidence and operator actions

Prepared 2026-11-25 from repository source and historical audit records. **No Neon or Vercel connection was made. No credential value, connection string, user row, grant, role, or hosted setting was read or changed.** The historical six-branch audit in `docs/LaunchReadiness.md` was performed 2026-11-09 and cannot attest current state. Muse owns the N01 Preview App role cutover; this package does not execute or revise that plan. Phase 1 remains **FAIL**.

## 7. Credential inventory and retirement

| Consumer | Config names and source | Expected credential scope / action |
|---|---|---|
| Backend runtime pools | `GNOSIS_APP_DATABASE_URL`, `GNOSIS_BIBLE_DATABASE_URL`, `GNOSIS_COMMENTARY_DATABASE_URL`; legacy `DATABASE_URL`; local `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` in `backend/src/db/db.js` | Inventory each Vercel Preview/Production scope. `GNOSIS_SPLIT_REQUIRED=1` makes missing split URLs fatal; otherwise Bible/Commentary can fall back to App/`DATABASE_URL`. Determine current mode before retiring any value. |
| Migration runner | `MIGRATION_APP_DATABASE_URL`, `MIGRATION_BIBLE_DATABASE_URL`, `MIGRATION_COMMENTARY_DATABASE_URL`; local `MIGRATION_DB_*`; disposable `MIGRATION_TEST_DATABASE_URL` in `backend/scripts/migrations/config.js` | Direct owner/migration endpoints, `sslmode=verify-full` for remote. Confirm runners and secret-store consumers before rotation. `MIGRATION_CONFIRM_PRODUCTION` is a write gate, not a credential. |
| Bible importer | `GNOSIS_BIBLE_IMPORT_DATABASE_URL` in `tools/bible-import/src/cli.js` | Separate Bible write identity; inventory any scheduled/manual operator runner. |
| App maintenance | `GNOSIS_APP_DATABASE_URL` in `backend/scripts/security-alerts.js`; `DATABASE_URL`/App URL in `backend/scripts/purge-expired.js`; `ROTATE_MFA_DATABASE_URL` in `backend/scripts/db/rotate-mfa-key.js` | Inventory operator jobs and owner privileges. Do not conflate with the runtime role. |
| Backup and restore | Proposed `GNOSIS_BACKUP_{APP,BIBLE,COMMENTARY}_URL`, `GNOSIS_RESTORE_{APP,BIBLE,COMMENTARY}_URL`, and `GNOSIS_BACKUP_KEY_HEX` in `backend/scripts/db/encrypted-backup.js`; `RESTORE_SOURCE_DATABASE_URL`/`RESTORE_TARGET_DATABASE_URL` in `verify-restore.js` | PR #343 supplies tooling and isolated rehearsal; `docs/EncryptedBackupsAndRecovery.md` says live scheduling, restricted backup identity, off-platform storage and key custody still need approval. Check for actual consumers before rotation. |
| Catalog/test tooling | `MIGRATION_TEST_DATABASE_URL` in test and catalog scripts | Disposable loopback only; do not mistake synthetic values for hosted credentials. |

Filename-only workspace inventory found `backend/.env` and `backend/.env.local` at the shared repository root. Both are untracked/ignored; their contents were **not opened**. `backend/.env.example` and `frontend/.env.example` are tracked templates. No additional workspace credential file was found by filename pattern; this does not cover user-home files, shell history, Vercel stores, Neon console exports, CI secrets or deleted files. The operator must inventory those privately, including any `.pgpass`/service file, password-manager item and scheduled-runner secret, by location and consumer only.

### Separate approval action 7A — migration-era credential rotation and file retirement

**Owner approval required:** Yonatan must approve a named role-by-role list, Neon project/branch/environment scope, Vercel/runner secret entries, operator, change window and rollback owner. Production credentials require explicit Production-specific approval; approval for the Preview N01 role swap is not approval for this action. No rotation or file deletion is authorized by this document.

**Before:** operator records non-secret role names, role purpose, consumers, secret-store entry names, last-use evidence, and local file *paths*; maps any fallback from `DATABASE_URL` and checks `GNOSIS_SPLIT_REQUIRED`. Confirm a current recoverable point and successful isolated restore for each affected database, with key custody and recovery owner. PR #343's synthetic rehearsal is insufficient evidence that hosted backups are running. Stage a new restricted credential in the correct scope; prove connectivity in a disposable/Preview context before cutover. Avoid placing values in shell arguments, logs, tickets or PRs.

**Sequence:** rotate one approved role/environment at a time. Update every mapped consumer, restart or drain its connections, verify `current_user`, project/branch identity and expected function using synthetic or metadata-only checks, then revoke the old credential and verify old authentication fails. Only after consumers are stable, securely remove approved local connection files and confirm no process still loads them. Record redacted timestamps and outcomes.

**Impact/rollback:** stale pools, migration/import/maintenance/backup jobs may fail until refreshed. If a new credential fails, issue another restricted credential and restore the mapped service configuration from the protected operator record; never re-enable a suspected exposed password. Recheck backup jobs and cross-project integrity. Abort if a consumer cannot be identified or recovery is unproven.

## 8. Least privilege across three Neon projects

The repository already contains `backend/scripts/db/least-privilege-audit.sql`. It covers role attributes, memberships, table and column grants, usage grants, PUBLIC grants, default ACLs and App RLS flags. Run it **read-only** on each authorized branch. `backend/scripts/db/phase1-catalog-supplement.sql` adds database/schema/sequence ACLs, object ownership and role-setting *names* that the earlier script did not enumerate. The supplement never selects password hashes, connection strings, table rows or role-setting values. Run as an authorized metadata-reading operator; verify its output is stored in an access-controlled evidence location. Do not run any statement from a grant/remediation plan during the audit.

Validation: the supplement completed with `ON_ERROR_STOP=1` inside its `READ ONLY` transaction on a newly initialized, disposable local PostgreSQL cluster (36 output lines; cluster removed afterward). This validates syntax and read-only execution, not Neon grants or branch state. Docker was unavailable locally; no hosted fallback was attempted.

Historical expected runtime identities from the existing audit are App `gnosis_app` (Production), `gnosis_preview_app` (currently overprivileged Preview) and staged `gnosis_preview_app_next`; Bible `gnosis_bible_app`/`gnosis_bible_preview_app`; Commentary `gnosis_commentary_app`/`gnosis_commentary_preview_app`. **Reconfirm names and actual enabled roles in Neon.** Runtime roles must lack SUPERUSER, CREATEROLE, CREATEDB, REPLICATION, BYPASSRLS, broad ownership, unexpected membership, schema CREATE and unrelated database grants. Bible/Commentary runtime roles are expected to be read-only; App writes must match the reviewed feature grant list, with sensitive UPDATE rights column-scoped. Backup identity has a distinct reviewed exception for App FORCE RLS; it must not become the runtime identity. Compare sequence USAGE to INSERT paths, especially the historical `licensed_chapter_cache_id_seq` gap. `PUBLIC` grants and future default ACLs need explicit review.

### Separate approval action 8A — privilege remediation outside Muse's N01 cutover

**Owner approval required:** for every *newly confirmed* grant or administrative finding, Yonatan approves the exact branch, object, role, proposed SQL statements, expected application impact, maintenance window and rollback SQL. Muse must sign off on overlap with the N01 sequence grant/role cutover; this package does not duplicate that change.

**Before:** capture the current ACL and dependency graph, current recoverable snapshot, isolated restore result, and synthetic privilege tests with the proposed restricted role. **Apply:** one approved change set per project/branch. **Validate:** repeat both read-only audits, role identity checks, expected app/import/backup functions and denial of unauthorized privileges. **Rollback:** restore the previous minimum grant set from a protected reviewed record; do not restore broad administrative membership merely to make a failing application work. If data integrity is affected, use the approved recovery plan.

## 9. Preview/Production isolation matrix

Fill the project ID, branch ID, database name, endpoint fingerprint and deployment SHA from the operator consoles in a private evidence record. Do not paste connection URLs, passwords, tokens, user data or full hostnames into PR comments. `current_database()` and `current_user` are supporting facts; neither proves the Neon project/branch alone.

| Service/environment | Expected project/branch identity | Expected variables and runtime identity | Evidence still required |
|---|---|---|---|
| App Preview | App project, Preview branch; exact IDs **operator to attest** | Preview-scoped `GNOSIS_APP_DATABASE_URL` or documented transitional `DATABASE_URL`; staged restricted role after Muse cutover | Vercel variable scope/name and Neon endpoint-to-branch mapping; metadata-only connected role; no Production endpoint. |
| Bible Preview | Bible project, Preview branch; IDs **operator to attest** | Preview-scoped `GNOSIS_BIBLE_DATABASE_URL`; `gnosis_bible_preview_app` if enabled | Same plus SELECT-only grants. |
| Commentary Preview | Commentary project, Preview branch; IDs **operator to attest** | Preview-scoped `GNOSIS_COMMENTARY_DATABASE_URL`; `gnosis_commentary_preview_app` if enabled | Same plus SELECT-only grants. |
| App Production | App project, Production branch; IDs **operator to attest** | Production-scoped App URL and `gnosis_app` | Confirm no Preview credential or endpoint; no Production connection from this audit package. |
| Bible Production | Bible project, Production branch; IDs **operator to attest** | Production-scoped Bible URL and `gnosis_bible_app` if enabled | Confirm split state and read-only runtime role. |
| Commentary Production | Commentary project, Production branch; IDs **operator to attest** | Production-scoped Commentary URL and `gnosis_commentary_app` if enabled | Confirm split state and read-only runtime role. |

Operator verification is **read-only**: (1) inspect Vercel variable *names and environment scopes* and map each secret reference to a Neon project/branch endpoint in the protected console; (2) compare the six expected identities to the live deployment SHA and `GNOSIS_SPLIT_REQUIRED` mode; (3) run only the catalog queries on the authorized branch and record `current_user`/`current_database`; (4) independently confirm Preview's secret references do not resolve to any Production endpoint or owner credential. No private-table query, cross-environment write or credential-disclosure probe is needed.

### Separate approval action 9A — environment-scope correction, only if a mismatch is confirmed

**Owner approval required:** Yonatan approves each exact Vercel project, environment, variable *name*, target Neon project/branch, operator, window and rollback owner. A Preview correction cannot authorize Production changes or the N01 cutover.

**Before:** prove the correct branch has a recoverable point and isolate the intended endpoint in a protected record; test the replacement reference without exposing its URL. **Apply:** update only the approved environment scope and restart that deployment. **Validate:** connected role/database metadata, project/branch mapping, no Production endpoint in Preview, and synthetic smoke. **Rollback:** restore the protected previous scope only if it was safe; otherwise deploy a newly issued restricted Preview credential to the intended branch. Contain Preview if an actual Production crossover is discovered.

## Evidence status and priority

1. **High, historical N01:** Preview App role's elevated membership/attributes were recorded in `docs/LaunchReadiness.md`. Muse is preparing the owner-approved cutover. Fresh catalog evidence is needed after it; do not count preparation as remediation.
2. **Unverified #9:** three-project Preview/Production variable-to-branch mapping and current split mode require Vercel and Neon operator access. Any confirmed crossover is a High/Critical incident candidate requiring immediate containment under the incident runbook.
3. **Unverified #7:** migration-era credential retirement and local-file removal have no current completion evidence. Prioritize owner/runtime credentials with broad rights after mapping consumers and recovery.
4. **Unverified #8:** the 2026-11-09 six-branch audit recorded zero failures except N01, but is stale. Repeat catalog evidence across all six branches and review grants added since then.

Muse should reconcile this report with the Phase 1 checklist and N01 cutover plan. No hosted control is marked PASS from repository evidence alone.

### Operator evidence still required

- **Neon operator:** six project/branch identifiers; current role attributes and memberships; table, column, schema, sequence, database and default ACL outputs; App FORCE RLS flags and ownership; current backup/snapshot IDs and an isolated restore result; old-credential rejection after any approved rotation. Share metadata and redacted verdicts only.
- **Vercel operator:** active deployment SHA for each environment; variable *names and scopes* for the three runtime URLs, legacy `DATABASE_URL` and `GNOSIS_SPLIT_REQUIRED`; protected mapping of each referenced endpoint to its Neon project/branch; confirmation that no Preview secret reference resolves to Production. Never export values into the evidence report.
- **Credential/file owners:** role-by-role consumer list for migrations, imports, maintenance, backup and runtime jobs; local connection-file paths and secure-removal status; private confirmation that no consumer still uses retired credentials.
- **Muse:** N01 cutover outcome and fresh exact-branch role attestation, plus independent reconciliation of any overlap. The approval for actions 7A, 8A and 9A remains separate from Muse's cutover approval.
