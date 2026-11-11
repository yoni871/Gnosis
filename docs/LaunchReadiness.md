# Gnosis launch readiness — go/no-go checklist

Source: roadmap §8 (`GnosisEnterpriseSecurityRoadmap.md`, held outside
this repo) and the 2026-11-09 user security audit (main `40eb9a9`).

## The rule

**Every box must be checked, or explicitly risk-accepted in writing by
Yonatan (owner, date, expiry, compensating control), before public
registration opens.** "Invited/known users only" is the safe interim
state. If any box fails, the launch does not proceed. A failed launch
gate is not a failure of the project — it is the gate working.

Status as of 2026-11-10 (main `bc7b8cf`). Evidence links point at in-repo docs where
they exist; the audit and roadmap are held outside this repo and are
cited by path. Refreshed from the 2026-11-09 snapshot: the merged
security sequence (#79, #77, #80, #81, #85, #114, #117, #119) closes
T1.1, T1.2, T1.4, T1.5, T1.6, T1.7, and T1.13; the 24h soak PASSED.

## Checklist

| Item | Status | Owner | Evidence / notes |
|---|---|---|---|
| T1.1 TRUST_PROXY attestation (live attestation complete and on file, especially the client-IP chain) | DONE (Preview) | Muse 1 (DB infra track) | PR #117 merged 2026-11-10 (`3daff0f`): `resolveTrustProxy` rejects `"true"`, requires a hop count or CIDRs. `TRUST_PROXY=1` set in Vercel Preview and verified live 2026-11-10 — Preview boots, a spoofed `X-Forwarded-For` is ignored (5 spoofed failures, 6th login 429). Production: `TRUST_PROXY` still absent — set `"1"` at promotion (Phase 5 item). See [RateLimiting](RateLimiting.md). |
| T1.2 Headers + CSP enforced (report-only period completed with zero legitimate violations); `X-Powered-By` disabled | DONE | Muse 3 (PR1) | PR #79 merged 2026-11-10 (`ca53b1e`): helmet + CSP + `frame-ancestors` + `nosniff` + `Referrer-Policy`; `X-Powered-By` disabled. Verified by the #92 browser-policy suite (PR open, prepared). |
| T1.3 `no-store` on all private responses | OPEN | Muse 3 (PR1) | Audit F12: profile, notes, bookmarks, highlights, and reading-state responses carry no `no-store` directive. |
| T1.4 Log hygiene (no raw DB errors outside auth paths; log access and retention reviewed with an authorised operator) | DONE | Muse 3 (PR2) | PR #80 merged 2026-11-10 (`60fb3db`): 34 call sites converted to the allowlisted `logControllerError`/`logPoolError` (route + kind + code only); no `X-Request-ID`. |
| T1.5 Secret strength enforced at boot; any weak secret rotated (with session revocation) | DONE | Muse 3 (PR3) | PR #81 merged 2026-11-10 (`a8914c0`): boot check enforces 32+ random bytes for `JWT_SECRET` and `RATE_LIMIT_KEY_SECRET` (fail-closed). Preview secrets rotated to 32-byte random values (#98, resolved 2026-11-10); Production secrets confirmed strong by Yonatan 2026-11-10 15:11 CST. Note: rotating `JWT_SECRET` alone does not revoke sessions — pair it with a revocation step (see [IncidentResponse](IncidentResponse.md)). |
| T1.6 bcrypt cost 12 for new hashes | DONE | Muse 3 (PR3) | PR #81 merged 2026-11-10 (`a8914c0`): new hashes use bcrypt cost 12. |
| T1.7 Breached-password screening live at registration and reset | DONE | Muse 3 (PR3) | PR #81 merged 2026-11-10 (`a8914c0`): HIBP k-anonymity screening at registration and reset (2 s timeout, fail-open on provider failure, rejection counts against the rate limit). |
| T1.8 Password minimum raised (≥ 12 now; ≥ 15 target documented) | DONE (decided) | Yonatan | Superseded by Yonatan's decision 2026-11-10: the password floor stays **8, not 12**. PR #81 merged with floor 8 (`a8914c0`). The ≥ 12/≥ 15 target in the roadmap is not adopted. |
| T1.9 Dependencies patched; Node pin at a current patched release | OPEN | Unassigned — needs an owner | Audit F05: 13 distinct advisories across 6 packages (dev/build/migration tooling); CI pins Node 22.14.0, below the October 2026 bulletin fix level 22.23.4. |
| T1.10 CI security scanning live (npm audit gate, gitleaks, CodeQL, Dependabot) and green | OPEN | Unassigned — needs an owner | No CodeQL/Dependabot/npm-audit gate exists today. |
| T1.11 Branch protection verified live on `main` and `production` (approving review + named checks, including promotion PRs) | OPEN | Yonatan / operator (dashboard setting) | Audit F07: rulesets require a PR, but required approving reviews = 0 and required status checks are empty; CI does not cover promotion PRs. |
| T1.12 Privacy policy published; account deletion works end-to-end on a synthetic account; retention purge scheduled | IN PROGRESS | Muse 3 (PR5) | PR #89 (https://github.com/yoni871/Gnosis/pull/89) — open, prepared 2026-11-10: rebased onto main `bc7b8cf` (head `2ddbd55`), CI 6/6 green, MERGEABLE CLEAN. Adds `DELETE /api/auth/account` (password-confirmed, one transaction), `purge-expired.js`, `/privacy` + `/settings` pages, `docs/AccountDeletion.md`. Operator grant needed at deploy: `GRANT DELETE ON users TO gnosis_app` (and preview role) — the PR adds it only to the test harness; without it the endpoint fails closed (500). Awaiting merge. |
| T1.13 Request/collection budgets in place | DONE | Muse 3 (PR4) | PR #85 merged 2026-11-10 (`40cf353`): 400/413 handling, 100 KiB body limit, pagination caps, pool timeouts (10 s/5 s), `refresh_ip` rate limit. Remaining budget work is post-launch hardening, not this gate: PR #90 (refresh-token budgets, blocked on authorship confirmation), PR #91 (cursor pagination + atomic quotas), PR #87 (query budgets + TLS). Audit F09 (non-atomic licensed budget) is addressed by PR #91, post-launch. |
| T1.15 Encrypted off-site backups of all three projects exist and a restore drill has passed | OPEN | Muse 1 (DB infra track) | Audit §6: backup/restore never tested. Neon Free gives a 6-hour point-in-time recovery window per project as a platform property — not a verified recovery. Status 2026-11-09 ~13:46 CST: Muse 1 has written a backup/restore plan (Neon PITR 6h as the restore path); no encrypted off-site backup or restore drill exists yet. Staged, awaiting Yonatan's approval post-soak. |
| T1.16 Audit logging live with an alert rule on reuse detection | IN PROGRESS | This track (branch `security/audit-logging`) | PR #78 (https://github.com/yoni871/Gnosis/pull/78) — open, prepared 2026-11-10: rebased onto main `bc7b8cf` (head `ad41232`), CI 6/6 green, MERGEABLE CLEAN. The alert rule is PR #82 (https://github.com/yoni871/Gnosis/pull/82) — open, prepared 2026-11-10: rebased onto #78 (head `aec2040`), CI 6/6 green, MERGEABLE CLEAN. Both await merge (order: #78 then #82). |
| T1.19 `SECURITY.md` published with a private reporting channel | IN PROGRESS | This track (branch `security/security-md`) | PR #73 (https://github.com/yoni871/Gnosis/pull/73) — open, unmerged; reporting contact still a placeholder pending Yonatan's confirmation. |
| Audit reconciled + PASS verdict | OPEN | — | Audit verdict is **still FAIL as of 2026-11-10** (main `bc7b8cf`): the merged sequence (#79/#80/#81/#85/#114/#117/#119) closed the headers, log-hygiene, secret-strength, bcrypt, HIBP, and budget Mediums, but two FAIL drivers remain — privacy/deletion (PR #89, prepared but unmerged) and the live High N01 (preview role). A re-audit is needed after #89 merges and the §13 role swap lands. Audit report: `~/workspace/gnosis-security-audit/GnosisUserSecurityAudit.md` (held outside the repo). Prior in-repo audit: [Security_Audit.md](Security_Audit.md) (2026-11-07/08, main `14de721`). |
| Preview 24h soak passed + production promotion | DONE (soak) / OPEN (promotion) | Muse 2 (soak) / Yonatan (promotion approval) | **Soak PASSED** T+24h 2026-11-10 ~11:14 AM CST (22 passed / 0 failed / 9 skipped; zero 5xx). Production promotion (main → production PR) needs separate approval; production is still at `1853b92` (pre-#39/#70 session model — the reset-revocation fix is not live there). Phase 4 production migration target: tonight Nov 10 for Steps 21–22 (prep approval only — execution needs the §6.1 rehearsal + Gate 0 re-verification + Yonatan's date/window approval). Promotion PR (`bc7b8cf` → production) is a Phase 4 blocker (B4). See [Deployments](Deployments.md) and [Sessions](Sessions.md). |
| No Critical/High open | OPEN | Muse 1 (N01) | N01 live High: preview role `gnosis_preview_app` still holds `neon_superuser` membership + `CREATEROLE`/`CREATEDB`/`REPLICATION` and can `UPDATE` `password_reset_tokens.token_hash` and `users.email`, serving live preview traffic. Clean replacement `gnosis_preview_app_next` exists and is verified, but the swap needs Yonatan's approval and has not happened. Production role `gnosis_app` is clean. Status 2026-11-10: STAGED, not executed — the replacement role is created and grant-verified; the soak gate has cleared (soak passed ~11:14 AM Nov 10), so the swap now needs only Yonatan's approval. Swap-blocking sequence gap — `licensed_chapter_cache.id` is SERIAL and the app INSERTs without an id, but no preview role holds USAGE on `licensed_chapter_cache_id_seq` (owner only); it works today only via the superuser backdoor, and the first cache miss after the swap would fail 42501. Fix: `GRANT USAGE ON SEQUENCE licensed_chapter_cache_id_seq TO gnosis_app` on preview before the swap (same statement needed in Phase 4 plan §6.2 for production). |

## Muse 1 (DB infrastructure track) — status as found

Checked chat `d058ee09` on 2026-11-09 ~13:40 CST, updated ~13:46 CST
when Muse 1 replied: **no conflict with this track.** Muse 1 was
assigned the DB infrastructure track at ~13:29 CST (fix the
over-privileged preview role, least-privilege audit across all three
Neon projects, preview/production credential separation,
credential-rotation planning, encrypted backups + restore verification,
TLS, cross-database integrity), with instructions not to modify live
databases, rotate credentials, deploy, or merge without Yonatan's
explicit approval. Its branch is `security/db-hardening` (commit
`783f639`, unpushed); it touches `backend/src/db/db.js` (verified TLS
on remote pools), `backend/scripts/local/prepare.js` (PR #29 grants),
`backend/test/db/pools.test.js`, plus two new scripts
(`least-privilege-audit.sql`, `verify-restore.js`). It has not touched
rate limiting, session, or token code and will not — this track's
emission points (`sessionService`, verification/password-reset utils)
are unaffected. Its restore-verification script reads `pgmigrations_*`
histories generically, so this track's new migration row will simply
appear on both sides of any comparison — no action needed.
**Results landed 2026-11-09 ~13:41–13:53 CST:** the six-branch
least-privilege audit is COMPLETE (48 SELECTs, zero failures) —
least privilege holds everywhere except N01; PUBLIC has zero grants
on all six branches; production Bible/Commentary roles are NOLOGIN
with no grants. Live cross-database integrity counts are COMPLETE
(read-only): App preview has 0 of the 11 dropped tables (§6 drops
complete); Bible/Commentary preview counts verified; production
baseline re-confirmed. **PR #77 opened ~13:56 CST** for
`security/db-hardening` (commit `783f639`, pushed, do-not-merge note
until the soak ends + Yonatan's approval). One new swap-blocking
finding: the `licensed_chapter_cache_id_seq` USAGE gap (see the N01
row above). All hardening work is complete on Muse 1's side;
remaining items are Yonatan's approvals.

## Uncertain items

- **T1.15 and the N01 High** depend on Muse 1 / Dev 1. T1.1 is DONE
  (PR #117 merged; `TRUST_PROXY=1` verified live on Preview).
  N01 is STAGED (swap needs only Yonatan's approval now — the soak
  gate cleared) with one swap-blocking finding (the
  `licensed_chapter_cache_id_seq` USAGE gap); T1.15 has a plan
  written but no backup or drill yet, and the §6.1 rehearsal is the
  gating item for tonight's Phase 4 target. Both stay OPEN until
  those approvals land.
- **RLS (Muse 3 PR9, PR #95) and the Phase 4 production copy.** PR9 puts FORCE RLS on user tables (notes, bookmarks, highlights, user_reading_state, users) but NOT on `security_events` — the audit logger fires for unauthenticated events (failed logins, token replays) with no user_id, so RLS there would break it; no action needed on the audit-logging side. If RLS lands on preview user tables before Phase 4, the production copy procedure must handle it: with FORCE RLS, a pg_dump/pg_restore copy run as owner fails (pg_dump exits 1, "query would be affected by row-level security policy") and a COPY-style extract silently yields zero rows — `SET row_security=off` does NOT help under FORCE (it is settable by any role, but FORCE still applies). The verified remedy is `ALTER TABLE <table> NO FORCE ROW LEVEL SECURITY` on the four FORCE RLS tables around the copy/dump, then re-enable afterwards. See PR #95 `docs/RowLevelSecurity.md`. (Flagged 2026-11-09 via Muse 3 from Muse 1's RLS coordination; remedy corrected 2026-11-09 ~16:29 CST after PR9's empirical verification — the earlier `row_security=off` remedy in this entry was wrong.)
- **T1.9 and T1.10 have no owner.** They stay OPEN until someone owns
  them.
- **T1.16 and T1.19** are IN PROGRESS on this track's branches; T1.19
  is PR #73 (open, blocked on the reporting-contact decision) and
  T1.16 is PR #78 (open, prepared 2026-11-10); the reuse-detection
  alert rule is PR #82 (open, prepared 2026-11-10). PR #84
  (notifications) and PR #89 (privacy/deletion) are also prepared.
- **The soak PASSED** T+24h 2026-11-10 ~11:14 AM CST (22/0/9, zero
  5xx). Production promotion and the Phase 4 migration are separate
  approvals; the migration target is tonight Nov 10 for Steps 21–22
  (prep approval only).
