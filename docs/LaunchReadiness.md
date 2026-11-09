# Gnosis launch readiness — go/no-go checklist

Source: roadmap §8 (`GnosisEnterpriseSecurityRoadmap.md`, held outside
this repo) and the 2026-11-09 user security audit (main `40eb9a9`).

## The rule

**Every box must be checked, or explicitly risk-accepted in writing by
Yonatan (owner, date, expiry, compensating control), before public
registration opens.** "Invited/known users only" is the safe interim
state. If any box fails, the launch does not proceed. A failed launch
gate is not a failure of the project — it is the gate working.

Status as of 2026-11-09. Evidence links point at in-repo docs where
they exist; the audit and roadmap are held outside this repo and are
cited by path.

## Checklist

| Item | Status | Owner | Evidence / notes |
|---|---|---|---|
| T1.1 TRUST_PROXY attestation (live attestation complete and on file, especially the client-IP chain) | OPEN | Muse 1 (DB infra track) | Audit §3.2/§6: `TRUST_PROXY` is `"true"` on Preview (verified 2026-11-09 13:11 CST — Express trusts all proxy hops, so a preview client can spoof `X-Forwarded-For` and defeat both login rate-limit buckets) and absent from Production (trust proxy disabled there, so per-IP buckets do not work as designed). Correct value (hop count or Vercel edge CIDRs — never `true`) still to be set on both scopes and verified live. See [RateLimiting](RateLimiting.md). Status 2026-11-09 ~13:46 CST: NOT implemented — a Vercel config change, not code; Muse 1 owns scheduling it, and it needs Yonatan's approval plus a redeploy and a live check that a spoofed header is ignored. |
| T1.2 Headers + CSP enforced (report-only period completed with zero legitimate violations); `X-Powered-By` disabled | OPEN | Muse 3 (PR1) | Audit F03: no helmet, no CSP, no `frame-ancestors`, no `nosniff`, no `Referrer-Policy`; `X-Powered-By: Express` still sent (confirmed live). |
| T1.3 `no-store` on all private responses | OPEN | Muse 3 (PR1) | Audit F12: profile, notes, bookmarks, highlights, and reading-state responses carry no `no-store` directive. |
| T1.4 Log hygiene (no raw DB errors outside auth paths; log access and retention reviewed with an authorised operator) | OPEN | Muse 3 (PR2) | Audit F02: `console.error(error)` persists in notes, bookmarks, highlights, reading-state, and bible controllers. |
| T1.5 Secret strength enforced at boot; any weak secret rotated (with session revocation) | OPEN | Muse 3 (PR3) | Audit N06: `JWT_SECRET` and `RATE_LIMIT_KEY_SECRET` are checked for presence only at boot; nothing proves the deployed secrets are 32+ random bytes. Note: rotating `JWT_SECRET` alone does not revoke sessions — pair it with a revocation step (see [IncidentResponse](IncidentResponse.md)). |
| T1.6 bcrypt cost 12 for new hashes | OPEN | Muse 3 (PR3) | Audit N07: cost is 10 today (the OWASP minimum). |
| T1.7 Breached-password screening live at registration and reset | OPEN | Muse 3 (PR3) | No screening exists today. |
| T1.8 Password minimum raised (≥ 12 now; ≥ 15 target documented) | OPEN | Muse 3 (PR3) | Current minimum is below 12. |
| T1.9 Dependencies patched; Node pin at a current patched release | OPEN | Unassigned — needs an owner | Audit F05: 13 distinct advisories across 6 packages (dev/build/migration tooling); CI pins Node 22.14.0, below the October 2026 bulletin fix level 22.23.4. |
| T1.10 CI security scanning live (npm audit gate, gitleaks, CodeQL, Dependabot) and green | OPEN | Unassigned — needs an owner | No CodeQL/Dependabot/npm-audit gate exists today. |
| T1.11 Branch protection verified live on `main` and `production` (approving review + named checks, including promotion PRs) | OPEN | Yonatan / operator (dashboard setting) | Audit F07: rulesets require a PR, but required approving reviews = 0 and required status checks are empty; CI does not cover promotion PRs. |
| T1.12 Privacy policy published; account deletion works end-to-end on a synthetic account; retention purge scheduled | OPEN | Muse 3 (PR5) | Audit F08: no privacy policy or terms, no user-facing deletion path, no scheduled purge of expired session/token rows. |
| T1.13 Request/collection budgets in place | OPEN | Muse 3 (PR4) | Audit F04: private list endpoints return full collections with no LIMIT/pagination; no rate limit on `POST /api/auth/refresh`; no statement/lock timeouts on either pool. Audit F09: licensed-provider budget check is check-then-act, not atomic. |
| T1.15 Encrypted off-site backups of all three projects exist and a restore drill has passed | OPEN | Muse 1 (DB infra track) | Audit §6: backup/restore never tested. Neon Free gives a 6-hour point-in-time recovery window per project as a platform property — not a verified recovery. Status 2026-11-09 ~13:46 CST: Muse 1 has written a backup/restore plan (Neon PITR 6h as the restore path); no encrypted off-site backup or restore drill exists yet. Staged, awaiting Yonatan's approval post-soak. |
| T1.16 Audit logging live with an alert rule on reuse detection | IN PROGRESS | This track (branch `security/audit-logging`) | PR #78 (https://github.com/yoni871/Gnosis/pull/78) — open, unmerged; table + helper + wiring landed. The alert rule is PR #82 (https://github.com/yoni871/Gnosis/pull/82) — open, unmerged, stacked on PR #78. |
| T1.19 `SECURITY.md` published with a private reporting channel | IN PROGRESS | This track (branch `security/security-md`) | PR #73 (https://github.com/yoni871/Gnosis/pull/73) — open, unmerged; reporting contact still a placeholder pending Yonatan's confirmation. |
| Audit reconciled + PASS verdict | OPEN | — | Audit verdict is **FAIL as of 2026-11-09** (main `40eb9a9`): one live High (N01, preview role) and eight open Mediums. Audit report: `~/workspace/gnosis-security-audit/GnosisUserSecurityAudit.md` (held outside the repo). Prior in-repo audit: [Security_Audit.md](Security_Audit.md) (2026-11-07/08, main `14de721`). |
| Preview 24h soak passed + production promotion | OPEN | Muse 2 (soak) / Yonatan (promotion approval) | Soak restarted T+0 11:01:41 AM CST Nov 9 after the PR #71 login fix; ends ~11:01 AM CST Nov 10. Production promotion (main → production PR) needs separate approval. Production is still at `1853b92` (pre-#39/#70 session model — the reset-revocation fix is not live there). See [Deployments](Deployments.md) and [Sessions](Sessions.md). |
| No Critical/High open | OPEN | Muse 1 (N01) | N01 live High: preview role `gnosis_preview_app` still holds `neon_superuser` membership + `CREATEROLE`/`CREATEDB`/`REPLICATION` and can `UPDATE` `password_reset_tokens.token_hash` and `users.email`, serving live preview traffic. Clean replacement `gnosis_preview_app_next` exists and is verified, but the swap needs Yonatan's approval and has not happened. Production role `gnosis_app` is clean. Status 2026-11-09 ~13:46 CST: STAGED, not executed — the replacement role is created and grant-verified; the §13 swap needs Yonatan's approval AND the soak to have ended (~11:01 AM Nov 10). Nothing moves before then. NEW (Muse 1, 2026-11-09): swap-blocking sequence gap — `licensed_chapter_cache.id` is SERIAL and the app INSERTs without an id, but no preview role holds USAGE on `licensed_chapter_cache_id_seq` (owner only); it works today only via the superuser backdoor, and the first cache miss after the swap would fail 42501. Fix: `GRANT USAGE ON SEQUENCE licensed_chapter_cache_id_seq TO gnosis_app` on preview before the swap (same statement needed in Phase 4 plan §6.2 for production). |

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

- **T1.1, T1.15, and the N01 High** depend on Muse 1, which has now
  replied (~13:46 CST) and completed its audit + integrity counts
  (~13:41–13:53 CST; PR #77 open): N01 is STAGED (swap needs Yonatan's
  approval plus the soak to have ended) with one new swap-blocking
  finding (the `licensed_chapter_cache_id_seq` USAGE gap);
  TRUST_PROXY is NOT implemented (Vercel config change, needs approval
  + redeploy + live spoof check); T1.15 has a plan written but no
  backup or drill yet. All three stay OPEN until those approvals land.
- **RLS (Muse 3 PR9) and the Phase 4 production copy.** PR9 puts FORCE RLS on user tables (notes, bookmarks, highlights, user_reading_state, users) but NOT on `security_events` — the audit logger fires for unauthenticated events (failed logins, token replays) with no user_id, so RLS there would break it; no action needed on the audit-logging side. If RLS lands on preview user tables before Phase 4, the production copy procedure must handle it: a pg_dump/pg_restore copy run as owner reads 0 rows unless the copy session sets `SET row_security=off`, or it silently copies nothing. PR9 docs will flag it; the Phase 4 plan must account for it. (Flagged 2026-11-09 via Muse 3 from Muse 1's RLS coordination.)
- **T1.9 and T1.10 have no owner.** They stay OPEN until someone owns
  them.
- **T1.16 and T1.19** are IN PROGRESS on this track's branches; T1.19
  is PR #73 (open) and T1.16 is PR #78 (open); the reuse-detection
  alert rule is PR #82 (open).
- **The soak** (Muse 2) ends ~11:01 AM CST Nov 10; this file records
  the schedule, not the outcome.
