# Gnosis incident-response runbook

One page. Read it before you need it. Source: roadmap §9
(`GnosisEnterpriseSecurityRoadmap.md`, held outside this repo) and the
2026-11-09 user security audit (verdict FAIL — do not open public
registration yet; see [LaunchReadiness](LaunchReadiness.md)).

**Scope:** user accounts and user data on Gnosis (preview and production).
**Who responds:** the operator (Yonatan) plus whoever owns the affected
area. No live database change, credential rotation, deploy, or merge
happens without Yonatan's explicit approval — except the containment
steps in §2, which are the reason this runbook exists. If a containment
step needs a redeploy, say so first: a preview redeploy restarts any
running 24-hour soak from zero (see [Deployments](Deployments.md)).

**First principles**

- Do not guess. Use the logs: the `security_events` audit log
  (audit-logging track, T1.16 — not yet live; until it lands, Vercel
  function logs plus Neon logs) and the Neon database logs.
- Never claim more than the logs prove — to users or to each other.
- Preserve evidence before you fix anything: copy the relevant log lines
  and note exact times (America/Chicago).

## 1. Detect

An incident starts when any of these fires, or when a report arrives
through the private reporting channel in `SECURITY.md` (in progress —
see T1.19 in [LaunchReadiness](LaunchReadiness.md)):

- Refresh-token reuse detection (a rotated refresh token presented again —
  the session service revokes the whole session on replay).
- ≥ 10 failed logins per minute (login rate-limit buckets tripping
  repeatedly; see [RateLimiting](RateLimiting.md)).
- New-device login on an account that did not expect one.
- Account deletion (self-serve or operator) outside a known request.
- Usage spike: Neon/Vercel usage far above the app's normal level, or
  licensed-translation quota burning faster than the budget allows.

Record immediately: the time, the signal, and what is known so far.
Open an incident note (a dated file under `docs/`, or a private issue)
and keep the timeline in it from this point on.

## 2. Contain (first hour)

Do these in order; stop the bleeding before diagnosing the cause.

1. **Revoke the affected sessions.** Use logout-all for the affected
   user (`POST /api/auth/logout-all`; see [Sessions](Sessions.md)).
   Logout-all revokes every refresh session for that user; the access
   token then dies at its 15-minute expiry at the latest.
2. **Rotating `JWT_SECRET` alone does not revoke sessions.** Sessions
   live in the database, not in the token. If you rotate the secret,
   pair it with a session-revocation step (logout-all for the affected
   users, or all users if the scope is unclear) — otherwise old
   sessions keep working.
3. **Disable the affected account** if takeover is suspected. There is
   no self-serve disable yet: do it by operator action on the database
   (approved step), and record exactly what was changed.
4. **Leaked secret → revoke it and rotate it.** Revoke first where the
   provider allows it (e.g. Resend key), then rotate the Vercel
   environment variable and redeploy.
5. **Leaked database credential → rotate that project's role password,
   re-point the Vercel env vars, redeploy.** Preview and production are
   separate projects with separate credentials — rotate only the
   affected project's role, and never reuse a password across projects.

## 3. Assess

Answer from the logs, not from intuition:

- What data was accessed? Check the `security_events` audit log and the
  Neon logs for the affected users and time window.
- Which users are affected? List them by user id — never by guessing
  from a pattern.
- Is the cause code, configuration, or credentials? A code bug is fixed
  by a PR; a wrong `TRUST_PROXY` or env var is a dashboard fix; a
  leaked credential is a rotation. If the logs do not settle it, say so
  and keep the incident open — do not pick a cause to close the ticket.

## 4. Eradicate and recover

- Fix the cause: code fix via PR (reviewed, CI green), config fix via
  the dashboard, credential rotation as in §2.
- Verify with the backend test suite (`npm test` in `backend/`) and,
  for auth/session changes, the live preview checks before any
  production promotion.
- Restore from the encrypted backup **only if data was corrupted or
  lost**. Neon Free gives a 6-hour point-in-time recovery window per
  project — after that, the data is gone, which is why the off-site
  backup routine (T1.15) exists. After any restore, verify row counts
  and hashes against the pre-incident state before serving traffic.

## 5. Notify

Tell affected users what happened, what data was involved, and what
they should do (change password, review sessions). Be specific and
honest: name the data the logs show was accessed, and say plainly what
is still unknown. Never claim more than the logs prove, and never say
"no data was accessed" unless the logs establish it.

## 6. Learn

Write the incident note within a week: timeline, root cause, what
detected it, what failed, and action items with owners. Then update
this runbook, the roadmap, and the test suite so the same failure is
caught next time. If the incident exposed a launch-gate item, update
[LaunchReadiness](LaunchReadiness.md) too — a failed gate is the gate
working, not a failure of the project.

## 7. Exercise

Run this runbook as a tabletop exercise twice a year. The first
exercise happens within a month of public launch. Each exercise ends
with a short note: what was practised, what was slow or unclear, and
what changed as a result.
