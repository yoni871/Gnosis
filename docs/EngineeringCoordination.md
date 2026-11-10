# Engineering Coordination — Gnosis

Source of truth for how the Gnosis team works. Maintained by the Engineering Manager. If this document and a private chat disagree, this document and the GitHub state win — ask the Engineering Manager.

- **Owner:** Engineering Manager (Main Muse)
- **Approved by:** Project Lead (Yonatan), 2026-11-09
- **Last updated:** 2026-11-09 (revision 3 — QA corrections applied; merge authority + QA independence decided)
- **Board:** GitHub Project "Gnosis Delivery" (owner: yoni871)
- **Repository:** github.com/yoni871/Gnosis
- **Basis:** the team reorganization plan (`gnosis-team-reorganization-plan.md`, approved 2026-11-09). Where the EM's earlier proposal differed from the plan, the plan governs; deliberate deviations are recorded in §8.

## 1. Team

| Role | Owns |
| --- | --- |
| **Project Lead** (Yonatan) | Final approval for merges, deploys, credential rotations, live database changes, production promotion. **Only Yonatan merges. No agent merges.** |
| **Engineering Manager** | Board, task breakdown, assignments, merge order, integration review, daily reports. No implementation (except small integration fixes on the integration branch). |
| **Developer 1** | Database / infrastructure — during the current security integration. After it, writers are a pool drawn per task; no permanent lanes. |
| **Developer 2** | Authentication / privacy — during the current security integration. After it, writers are a pool drawn per task; no permanent lanes. |
| **QA** | Independent verification. Review comments only; never writes product code — except that QA may propose a failing test as a patch for the writer. Never merges, never touches a live system. |
| **Muse 4** (temporary) | Debugging only: browser-test fix + #91/#95 transaction conflict. Not a standing role. |
| **Codex** | On-demand reviewer for difficult or high-risk changes only (one-week trial, measured on bugs found vs false positives). No longer a writer. |

## 2. Workflow

Task → Spec → Assignment → Implementation → PR → QA → Integration Review → Project Lead approval → Merge → Preview → Production approval.

Definition of done per stage:

- **Task:** an issue exists with an owner.
- **Spec:** the issue has file scope (may / must-not), frozen contracts, acceptance criteria, dependencies, and a size estimate. **No spec, no writer.**
- **Assignment:** the EM assigns it to exactly one writer. **At most two active development tasks team-wide; no writer holds two tasks; no task has two writers.**
- **Implementation:** own git worktree + own branch (never a shared checkout); own Neon branch for any DB work (never a shared dev database); PR touches only the spec's files; PR ≤400 lines (ideally ≤200); tests for every meaningful change; CI green on the branch; migrations apply cleanly to a fresh Neon branch and are reversible or marked forward-only.
- **PR:** focused, reviewable, linked to its issue, within the size limit, CI green (or the failure explained on the PR).
- **QA:** the Verifier ran the full suite and the seam/integration tests, exercised the smoke path on the Vercel preview, checked the DoD checklist, and reviewed the diff for scope violations and risky files; sign-off recorded on the issue/PR.
- **Integration review:** EM checks conflicts and duplicates against other in-flight PRs.
- **Approval:** Project Lead approves the merge, per PR. Any Codex review on high-risk PRs is addressed or explicitly dismissed by the Project Lead.
- **Merge:** by the Project Lead only. Merges happen **sequentially in dependency order**: merge one, full suite + typecheck green on `main`, then the next. Branch deleted after merge.
- **Preview:** auto-deploy on merge to `main`; preview deploy smoke-tested; soak (if required) completed.
- **Production:** separate `main` → `production` PR plus approval, merged by the Project Lead; production smoke-tested; worktree and Neon branch cleaned up.

**WIP limits:** 2 writers in parallel; at most 3 PRs in review; 1 migration at a time; branches live days, not weeks.

## 3. Task board

GitHub Project "Gnosis Delivery". Columns (per the reorganization plan §8): **Backlog → Specified → In Progress (max 2) → In Review (max 3) → Merged → Deployed.**

- **Backlog:** issues/PRs not yet specified.
- **Specified:** spec complete (file scope, frozen contracts, acceptance criteria, dependencies, size estimate).
- **In Progress:** at most 2 cards (development tasks).
- **In Review:** at most 3 cards (QA + integration review + Project Lead approval).
- **Merged:** merged to `main`.
- **Deployed:** verified on the preview deployment (and, for production work, on production).
- **Lanes:** Security merge train | Launch gates | Product.
- **Blocked** is a flag on the card (not a column): a blocked card stays in its stage with the blocker named. Cards carry Owner and Lane fields.

Note: the EM's earlier proposal used different column names (Ready, Blocked, Approved — awaiting Yonatan, Done). The plan's columns govern; the mapping is Ready = Specified, In Review (QA) + Approved = In Review (QA sign-off is a card field), Done = Merged → Deployed. See §8.

## 4. File ownership (current security integration)

- **Developer 1 (DB/infrastructure):** `backend/src/db/*` (pool config is `backend/src/db/db.js`), `backend/scripts/migrations/`, `backend/scripts/local/prepare.js`, `docs/Deployments.md`, Neon/Vercel operator steps, the Phase 4 migration plan.
- **Developer 2 (auth/privacy):** auth routes/services/middleware, `backend/src/app.js` (headers, boot checks), frontend auth pages, the RLS migration + `docs/RowLevelSecurity.md`, TOTP and passkeys. `logControllerError` lives in `backend/src/utils/authErrors.js`.
- **Landing with Phase 4 (not on `main` yet):** `backend/scripts/security-monitoring.js` and `backend/scripts/security-alerts.js` (exist only on the #83 branch).
- **Coordinate via the EM (shared files):** `backend/src/db/db.js` (pool config — both lanes touch it), `frontend/vercel.json`, `backend/vercel.json`, migration files belonging to another open PR, `docs/LaunchReadiness.md`.
- **Never:** edit another developer's open branch, touch a live database, rotate a secret, or deploy — without the Project Lead's explicit approval for that exact action.

## 5. Merge order — security PRs

Working sequence. Each merge needs passing tests and the Project Lead's individual approval. Merges are sequential: one merge, full suite + typecheck green on `main`, then the next.

- **Phase 0 — gates:** soak end (~11:01 AM CST Nov 10); secret strength (#98); SECURITY.md contact (#99); #97 GitGuardian triage (#103); confirm CI ran on #82/#83/#84 heads (#107); land the licensed-cache sequence grant before the preview-role swap (#102).
- **Phase 1 — docs + independent infra:** #69 → #73 → #74 → #76 → #88 → #86.
- **Phase 2 — auth core:** #79 → #77 → #80 → #81 → #85 → #87. #79 goes first: it fixes the stale frontend test and restores CI signal. #77 before #80: they share `db.js` + `pools.test.js`.
- **Phase 3 — Codex stack, rebased, duplicates dropped** (dispositions proven on integration branch `security/hardening-integration` at `c0a5d91`): #72 (proxy/body only) → #90 → #92 (blocked on #100 — PR #109 open, targets the integration branch, needs the Project Lead's approval to merge) → #75 (minus logging, minus searchBudget) → #91.
- **Phase 4 — audit logging:** #78 → #82/#83 → #84. Operator grants land with #78; CI re-run per #107.
- **Phase 5 — remaining auth:** #95 → #93 → #94 → #89 → #96 → #97. #95's rebase must carry PR #109's composed `withUser`/`withUserBudget` form (issue #101 resolved by #109).

The integration branch `security/hardening-integration` is a **verification artifact, not a single PR**. The snapshot branch `security/hardening-integration-check` must stay untouched.

## 6. Safety rules

- No merges, deploys, credential rotations, or live database changes without the Project Lead's explicit approval for that exact action. Only the Project Lead merges.
- No merges to `main` while the preview soak runs.
- **Secrets:** never paste credentials, keys, tokens, or reset links into chat; never read, copy, or log a secret value. Vercel Secret-type variables are write-only and cannot be inspected.
- **Tests:** disposable PostgreSQL clusters go in `/var/tmp/pgtest` (not `/tmp`); Node 22.14.0 is pinned by CI (system Node 24 breaks the `test-database.js` intentional-failure assertion — always run DB checks under Node 22); warm a Neon endpoint with a no-timeout probe immediately before the migration runner (its 10s timeout cannot survive a 10–60s Free-tier cold start).
- **Outbound:** no email is sent on the Project Lead's behalf without showing the exact text and getting approval.
- **Authorship:** all agents push as `yoni871`; use branch names and PR bodies to distinguish work.
- **Branch protection (pending — needs the Project Lead's go-ahead to apply):** required checks including typecheck, up-to-date branches, dismiss stale approvals, production restricted to the Project Lead. Merge-queue availability on this plan is unconfirmed — check Settings → Branches before enabling it.

## 7. Daily report (EM)

1. Completed
2. In progress
3. Blocked
4. Awaiting approval
5. Decisions needed from you
6. Next priorities

## 8. Decision log

**Decided 2026-11-09:** team structure and lanes; max two active development tasks; five-phase merge order; integration branch as verification artifact, not a PR; QA separate and independent; the debugging agent owns the browser-test fix and the #91/#95 conflict.

**Decided 2026-11-09 (revision 3, QA corrections):**
- Board columns follow the reorganization plan §8 (Backlog → Specified → In Progress → In Review → Merged → Deployed), not the EM's earlier proposal; the mapping is recorded in §3.
- This document replaces a repo `AGENTS.md`: the agent workspace already has an `AGENTS.md` operating manual, and a second one in the repo would collide; the coordination rules live here instead. The PR template and CODEOWNERS ship in this PR as the plan requires.
- Only the Project Lead merges (the EM-merge exception is removed).
- Writer lanes are time-boxed to the current security integration for both developers; after it, writers are a pool.

**Decided 2026-11-09 (~18:58 CST, Project Lead ruling):** only the Project Lead authorizes and performs merges. The Engineering Manager has no independent merge authority. QA verification stays independent: the ten auth PRs previously authored by the QA agent's chat go to Codex (or another independent reviewer) for verification.

**Open:** secret strength (#98); SECURITY.md contact (#99); #97 GitGuardian triage (#103); QA independence question (section 9); stale-branch deletion list (issue #105 — 20 branches verified, `prototype/gnosis-laptop-scroll` held for the Project Lead's decision); branch protection settings (section 6).

## 9. QA independence — decided by the Project Lead

The QA agent's chat previously authored the auth/privacy PRs (#79–#81, #85, #89, #93–#97) in its former role. Decided by the Project Lead 2026-11-09: QA verification stays independent — QA verifies all other PRs directly; those ten PRs go to Codex (or another independent reviewer) for verification in addition to QA's checklist.

## 10. Current state (2026-11-09 evening)

- 27 open security PRs (#69, #72–#97); 9 open issues (#98–#102, #105–#107, #110); plus PR #108 (this coordination doc) and PR #109 (Muse 4's browser-fix + #91/#95 composition, targeting the integration branch) — 29 open PRs total. Issues #10, #103, #104 closed 2026-11-09.
- Issue #110 (538-second password-reset response vs 15-second frontend timeout) assigned to Developer 2; investigation only, no code changes, no Production probing without approval.
- Muse 4's debugging is complete: PR #109 open (commits 1705c16 + dbd0e49), root cause bisected (CSP `connect-src` blocked the mocked `api.example.invalid` origin; fix moves the synthetic origin to `api.example.vercel.app`), browser 5/5, #91/#95 composed. Awaiting QA verification (issues #100, #101) and the Project Lead's approval to merge into the integration branch.
- Developer 1's stale-branch review is complete (issue #105): 20 branches verified safe to delete, listed for the Project Lead's approval; `prototype/gnosis-laptop-scroll` held.
- QA reviewed this document (10 corrections, applied in revision 2).
- Audit verdict: **FAIL — do not open Gnosis to public registration yet.** One live High (N01, preview role over-privilege) plus open Mediums. Tracking issues #98–#102, #105–#110.
- Preview soak ends ~11:01 AM CST Nov 10. Production remains at `1853b92`; `main` at `40eb9a9`.
- Resuming: read this document, the board, the open issues/PRs, and `docs/LaunchReadiness.md`. Never rely on private chat history.
