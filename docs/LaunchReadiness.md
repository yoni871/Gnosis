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
| T1.1 TRUST_PROXY attestation (live attestation complete and on file, especially the client-IP chain) | OPEN | Muse 1 (DB infra track) | Audit §3.2/§6: `TRUST_PROXY` is `"true"` on Preview (verified 2026-11-09 13:11 CST — Express trusts all proxy hops, so a preview client can spoof `X-Forwarded-For` and defeat both login rate-limit buckets) and absent from Production (trust proxy disabled there, so per-IP buckets do not work as designed). Correct value (hop count or Vercel edge CIDRs — never `true`) still to be set on both scopes and verified live. See [RateLimiting](RateLimiting.md). Muse 1 status not yet confirmed (see below). |
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
| T1.15 Encrypted off-site backups of all three projects exist and a restore drill has passed | OPEN | Muse 1 (DB infra track) | Audit §6: backup/restore never tested. Neon Free gives a 6-hour point-in-time recovery window per project as a platform property — not a verified recovery. Muse 1 status not yet confirmed (see below). |
| T1.16 Audit logging live with an alert rule on reuse detection | IN PROGRESS | This track (branch `security/audit-logging`) | PR link TBD — fill in when created. |
| T1.19 `SECURITY.md` published with a private reporting channel | IN PROGRESS | This track (branch `security/security-md`) | PR link TBD — fill in when created. No `SECURITY.md` exists in the repo yet. |
| Audit reconciled + PASS verdict | OPEN | — | Audit verdict is **FAIL as of 2026-11-09** (main `40eb9a9`): one live High (N01, preview role) and eight open Mediums. Audit report: `~/workspace/gnosis-security-audit/GnosisUserSecurityAudit.md` (held outside the repo). Prior in-repo audit: [Security_Audit.md](Security_Audit.md) (2026-11-07/08, main `14de721`). |
| Preview 24h soak passed + production promotion | OPEN | Muse 2 (soak) / Yonatan (promotion approval) | Soak restarted T+0 11:01:41 AM CST Nov 9 after the PR #71 login fix; ends ~11:01 AM CST Nov 10. Production promotion (main → production PR) needs separate approval. Production is still at `1853b92` (pre-#39/#70 session model — the reset-revocation fix is not live there). See [Deployments](Deployments.md) and [Sessions](Sessions.md). |
| No Critical/High open | OPEN | Muse 1 (N01) | N01 live High: preview role `gnosis_preview_app` still holds `neon_superuser` membership + `CREATEROLE`/`CREATEDB`/`REPLICATION` and can `UPDATE` `password_reset_tokens.token_hash` and `users.email`, serving live preview traffic. Clean replacement `gnosis_preview_app_next` exists and is verified, but the swap needs Yonatan's approval and has not happened. Production role `gnosis_app` is clean. Muse 1 status not yet confirmed (see below). |

## Muse 1 (DB infrastructure track) — status as found

Checked chat `d058ee09` on 2026-11-09 ~13:40 CST. Muse 1 was assigned
the DB infrastructure track at ~13:29 CST (fix the over-privileged
preview role, least-privilege audit across all three Neon projects,
preview/production credential separation, credential-rotation planning,
encrypted backups + restore verification, TLS, cross-database
integrity), with instructions not to modify live databases, rotate
credentials, deploy, or merge without Yonatan's explicit approval.
**Muse 1 had not replied to that assignment at the time of this check,
so the status of N01, TRUST_PROXY, and T1.15 is not yet confirmed.**
Its items above are marked OPEN with owner Muse 1; do not treat them
as in progress until Muse 1 reports back.

## Uncertain items

- **T1.1, T1.15, and the N01 High** depend on Muse 1, which had not
  reported back when this checklist was written. Their true status may
  be further along than OPEN — but nothing in this file claims so.
- **T1.9 and T1.10 have no owner.** They stay OPEN until someone owns
  them.
- **T1.16 and T1.19** are IN PROGRESS on this track's branches; the PR
  links are TBD until those PRs are created.
- **The soak** (Muse 2) ends ~11:01 AM CST Nov 10; this file records
  the schedule, not the outcome.
