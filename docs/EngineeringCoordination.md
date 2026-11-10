# Engineering Coordination — Gnosis

Source of truth for how the Gnosis team works. Maintained by the Engineering Manager. If this document and a private chat disagree, this document and the GitHub state win — ask the Engineering Manager.

- **Owner:** Engineering Manager (Main Muse)
- **Approved by:** Project Lead (Yonatan), 2026-11-09
- **Last updated:** 2026-11-09 (plan v1)
- **Board:** GitHub Project "Gnosis Delivery" (owner: yoni871)
- **Repository:** github.com/yoni871/Gnosis

## 1. Team

| Role | Owns |
| --- | --- |
| **Project Lead** (Yonatan) | Final approval for merges, deploys, credential rotations, live database changes, production promotion. |
| **Engineering Manager** | Board, task breakdown, assignments, merge order, integration review, daily reports. No implementation. |
| **Developer 1** | Database / infrastructure. |
| **Developer 2** | Authentication / privacy (during the current security integration). |
| **QA** | Independent verification. Read-only; never writes code. |
| **Muse 4** (temporary) | Debugging only: browser-test fix + #91/#95 transaction conflict. Not a standing role. |
| **Codex** | On-demand reviewer for difficult or high-risk changes only. No longer a writer. |

## 2. Workflow

Task → Assignment → Implementation → PR → QA → Integration Review → Project Lead approval → Merge → Preview → Production approval.

Definition of done per stage:

- **Task:** an issue with an owner, acceptance criteria, dependencies, and file scope.
- **Assignment:** the EM assigns it to exactly one developer. **At most two active development tasks team-wide.**
- **Implementation:** own branch/worktree, tests for every meaningful change, suites green locally.
- **PR:** focused, reviewable, linked to its issue, CI green (or the failure explained on the PR).
- **QA:** independent verification against the acceptance criteria plus a suite re-run; sign-off recorded on the issue/PR.
- **Integration review:** EM checks conflicts and duplicates against other in-flight PRs.
- **Approval:** Project Lead approves the merge, per PR.
- **Merge:** by the Project Lead (or by the EM only on explicit instruction for that PR).
- **Preview:** auto-deploy on merge to `main`; verify on the preview deployment.
- **Production:** separate `main` → `production` PR plus approval.

## 3. Task board

GitHub Project "Gnosis Delivery".

- **Columns:** Backlog | Ready | In Progress | In Review (QA) | Blocked | Approved — awaiting Yonatan | Done.
- **Lanes:** Security merge train | Launch gates | Product.
- **Rules:** one card per PR/issue; status moves only by the role that owns that stage; at most two cards in In Progress (development tasks); gate cards stay in Blocked until their decision lands; a card reaches "Approved — awaiting Yonatan" only after QA sign-off.

## 4. File ownership (current security integration)

- **Developer 1 (DB/infrastructure):** `backend/src/db/*`, `backend/scripts/db/*`, `backend/scripts/local/prepare.js`, operator scripts (`backend/scripts/security-monitoring.js`, `backend/scripts/security-alerts.js`), `docs/Deployments.md`, Neon/Vercel operator steps, the Phase 4 migration plan.
- **Developer 2 (auth/privacy):** auth routes/services/middleware, `backend/src/app.js` (headers, boot checks), frontend auth pages, the RLS migration + `docs/RowLevelSecurity.md`, TOTP and passkeys, `backend/src/utils/logControllerError*`.
- **Coordinate via the EM (shared files):** `backend/src/db.js` (pool config — both lanes touch it), `frontend/vercel.json`, `backend/vercel.json`, migration files belonging to another open PR, `docs/LaunchReadiness.md`.
- **Never:** edit another developer's open branch, touch a live database, rotate a secret, or deploy — without the Project Lead's explicit approval for that exact action.

## 5. Merge order — security PRs

Working sequence. Each merge needs passing tests and the Project Lead's individual approval.

- **Phase 0 — gates:** soak end (~11:01 AM CST Nov 10), secret strength (#98), SECURITY.md contact (#99), #97 GitGuardian triage (#103).
- **Phase 1 — docs + independent infra:** #69 → #73 → #74 → #76 → #88 → #86.
- **Phase 2 — auth core:** #79 → #77 → #80 → #81 → #85 → #87. #79 goes first: it fixes the stale frontend test and restores CI signal. #77 before #80: they share `db.js` + `pools.test.js`.
- **Phase 3 — Codex stack, rebased, duplicates dropped** (dispositions proven on integration branch `security/hardening-integration` at `c0a5d91`): #72 (proxy/body only) → #90 → #92 (blocked on #100) → #75 (minus logging, minus searchBudget) → #91.
- **Phase 4 — audit logging:** #78 → #82/#83 → #84. Operator grants land with #78; CI re-run per #107.
- **Phase 5 — remaining auth:** #95 → #93 → #94 → #89 → #96 → #97. Settle the #91/#95 transaction ordering (issue #101) at #95's merge.

The integration branch `security/hardening-integration` is a **verification artifact, not a single PR**. The snapshot branch `security/hardening-integration-check` must stay untouched.

## 6. Safety rules

- No merges, deploys, credential rotations, or live database changes without the Project Lead's explicit approval for that exact action.
- No merges to `main` while the preview soak runs.
- **Secrets:** never paste credentials, keys, tokens, or reset links into chat; never read, copy, or log a secret value. Vercel Secret-type variables are write-only and cannot be inspected.
- **Tests:** disposable PostgreSQL clusters go in `/var/tmp/pgtest` (not `/tmp`); Node 22.14.0 is pinned by CI; warm a Neon endpoint with a no-timeout probe immediately before the migration runner (its 10s timeout cannot survive a 10–60s Free-tier cold start).
- **Outbound:** no email is sent on the Project Lead's behalf without showing the exact text and getting approval.
- **Authorship:** all agents push as `yoni871`; use branch names and PR bodies to distinguish work.

## 7. Daily report (EM)

Completed / In progress / Blocked / Awaiting approval / Next priorities.

## 8. Decision log

**Decided 2026-11-09:** team structure and lanes; max two active development tasks; five-phase merge order; integration branch as verification artifact, not a PR; QA separate and independent; the debugging agent owns the browser-test fix and the #91/#95 conflict.

**Open:** secret strength (#98); SECURITY.md contact (#99); #97 GitGuardian triage (#103); QA independence question (section 9); stale-branch deletion list (issue #105).

## 9. QA independence — open question for the Project Lead

The QA agent's chat previously authored the auth/privacy PRs (#79–#81, #85, #89, #93–#97) in its former role. Until the Project Lead rules otherwise, QA verifies all other PRs directly; those ten PRs go to Codex (independent reviewer) for verification in addition to QA's checklist. Flagged by the EM, 2026-11-09.

## 10. Current state (2026-11-09 evening)

- 29 open security PRs (#69, #72–#97); all other issues closed except stale #10 (verification in issue #104).
- Audit verdict: **FAIL — do not open Gnosis to public registration yet.** One live High (N01, preview role over-privilege) plus open Mediums. Tracking issues #98–#107.
- Preview soak ends ~11:01 AM CST Nov 10. Production remains at `1853b92`; `main` at `40eb9a9`.
- Resuming: read this document, the board, the open issues/PRs, and `docs/LaunchReadiness.md`. Never rely on private chat history.
