# Security monitoring: API abuse + database usage

Read-only monitoring for the Gnosis App database plus Neon project
usage. It answers two questions on a schedule: is anyone abusing the
auth endpoints right now, and are we close to a Neon Free cap?

- Counters: `backend/scripts/security-monitoring.js`
- Tests: `backend/test/security-monitoring/abuseMonitoring.test.js`
  (unit) and `abuseMonitoring.integration.test.js` (disposable PG 18.6,
  run via `npm run test:abuse-monitoring`)
- Neon usage input: `neon.py usage <project_id>` (connector helper,
  read-only; see below)

## Running it

```sh
# Database counters (read-only; requires the URL, no default).
GNOSIS_MONITOR_DATABASE_URL=postgresql://<read-only-role>@<host>/<db> \
  node backend/scripts/security-monitoring.js \
  --usage-file /tmp/neon-usage-app.json \
  --usage-file /tmp/neon-usage-bible.json \
  --usage-file /tmp/neon-usage-commentary.json
```

Exit code: **0** clear, **1** warning breached, **2** alert breached
(or a run error). `--json` prints the full result object instead of
the text report, for cron or log ingestion.

The script opens its pool with `default_transaction_read_only=on`
and issues only `SELECT` statements. It never writes to the database,
never deploys anything, and never takes any action beyond printing
the report — an alert is a signal for the operator, not an automatic
block. It takes no credentials on the command line: the database URL
comes from `GNOSIS_MONITOR_DATABASE_URL` only.

Neon usage is fetched separately, because the Neon API key must only
ever travel through the connector helper, never through a repo
script's environment:

```sh
python3 ~/workspace/custom-connectors/custom.neon/bin/neon.py usage <project_id>
```

One file per project (`morning-pine-54759875` Gnosis,
`late-cloud-03160138` gnosis-bible, `hidden-mud-12990395`
gnosis-commentary), passed with `--usage-file`. Without any
`--usage-file` the Neon section reports "not checked" and the
database counters still run. The helper's `usage` command is two
read-only GETs (`/projects/{id}` and `/projects/{id}/branches`);
CU-hours are `compute_time_seconds / 3600` for the current
consumption period, and storage is the sum of the branches' logical
sizes.

### Database privileges needed

`SELECT` on `rate_limit_attempts` and `security_events` only. The
runtime app role already holds that `SELECT`, but prefer a dedicated
read-only role for monitoring so a monitoring credential can never
write:

```sql
GRANT SELECT ON rate_limit_attempts, security_events TO gnosis_monitor_ro;
```

## Counters

| Counter | Window | Source |
| --- | --- | --- |
| Counted failures per rate-limit policy, with distinct key count | 60 min | `rate_limit_attempts` |
| Exhausted buckets: distinct keys at their policy limit | each policy's own window | `rate_limit_attempts` |
| `security_events` counts by kind | 60 min | `security_events` |
| `login.failure` in the last minute | 1 min | `security_events` |
| `login.failure` per user (top 5) | 15 min | `security_events` |
| Neon branch storage, project total storage, CU-hours this period | current period | Neon API (`neon.py usage`) |

What the counters **cannot** see, by construction: `rate_limit_attempts`
holds only counted failures that passed the limiter — successes release
their reservation rows and blocked (429) attempts roll theirs back —
so the script sees failure volume, not total request volume or 429
counts. `security_events` holds kinds, user ids, and timestamps only
(PR #78): no IPs, emails, or request data, so a burst can be
attributed to a user id but never to an address from these tables.
Rows hold HMAC key hashes, never raw IPs or emails, and the script
never selects a hash value — only `COUNT`s leave the database.

## Thresholds

| Threshold | Severity | Rationale |
| --- | --- | --- |
| `login.failure` ≥ 10 in 1 minute | alert | Roadmap §9 incident-response trigger, verbatim: "≥ 10 failed logins/min". |
| `login.failure` ≥ 10 for one user in 15 minutes | alert | Same trigger, per account: a stuffing run aimed at one user. |
| `refresh_token.reused` ≥ 1 in 60 minutes | alert | Any replay of a consumed refresh token means a stolen token exists. The replay already revoked its session family; the alert is about the theft, not the session. |
| Exhausted buckets ≥ 1 for a policy | warn | Someone is being throttled. One key can be a legitimate user fat-fingering a password, so this warns rather than alerting. |
| Exhausted buckets ≥ 10 distinct keys for a policy | alert | Ten distinct keys at their limits in one window is a distributed burst, not one user. |
| Counted failures ≥ 100 per policy per hour | warn | Initial baseline: normal preview traffic is a handful of counted failures per hour. Tune after the soak produces real traffic. |
| Counted failures ≥ 500 per policy per hour | alert | Same baseline, one order of magnitude up. |
| Neon branch or project storage ≥ 950 MiB | warn | Soak stop condition: any project's storage crossing 950 MB. |
| Neon branch or project storage ≥ 1 GiB | alert | Neon Free branch limit (`branch_logical_size_limit_bytes` = 1 GiB) and the Free project cap. |
| Neon CU-hours ≥ 80 in the period | warn | 80% of the 100 CU-hours/project/month Free cap. |
| Neon CU-hours ≥ 100 in the period | alert | The Free cap itself. |

The exhausted-bucket check uses each policy's own window and limit
from `backend/src/utils/rateLimit.js` (`POLICIES`), the same values
the limiter enforces — a policy change moves the monitoring
threshold with it. The per-policy hourly counts use a fixed 60-minute
window regardless of policy.

## Where alerts surface

Today, only two places:

1. **This script's output** (text report or `--json`), when the
   operator runs it.
2. **Direct audit-log queries** against `security_events` (for
   example, the counts in the table above) during incident review.

**There is no email, pager, or chat alert yet — that is an open gap,
stated plainly.** Until an alerting channel exists, the script only
helps if someone runs it on the cadence below. Roadmap T2.6's
suspicious-login emails (new-device login, password/MFA change) are a
separate, not-yet-built notification step; this PR deliberately does
not invent a notification address or service.

## Cadence (roadmap §9)

- **Weekly:** run the script (database counters + all three
  `neon.py usage` files) and review the findings; this is the
  roadmap's weekly "review audit-log alerts" slot.
- **Monthly:** review Neon/Vercel usage against the caps — the
  monthly "Neon/Vercel usage vs caps" slot. Keep the monthly usage
  numbers (storage per branch, CU-hours per project) next to the
  thresholds above so a trend is visible before a cap is hit.
- **On demand:** run it during any incident (§9 runbook step 1,
  "Detect") and after any suspected abuse report.

## Retention

- `rate_limit_attempts` rows live at most 60 minutes: the limiter's
  own sweep deletes rows older than the longest policy window.
- `security_events` rows are kept 12 months (see
  `docs/SecurityEvents.md`); purge is an operator step, never done
  by this script or the application.

## Limitations and risks

- **Preview IP attribution is unreliable until the TRUST_PROXY fix
  lands.** `TRUST_PROXY` is `"true"` on Preview, so a client can
  spoof `X-Forwarded-For` and defeat the per-IP rate-limit buckets;
  the per-IP counters still count, but a burst spread across spoofed
  addresses looks like many distinct keys. The fix (explicit hop
  count / edge CIDRs, never `"true"`) is owned by the DB-hardening
  track and is staged, awaiting approval.
- **Thresholds for failure volume are an initial baseline**, not
  measured from production traffic — there is no production traffic
  yet. Expect to tune the 100/500 per-policy hourly lines after the
  soak, and to add per-policy lines (for example, a resend/verify
  spike) once real usage exists.
- **No request-volume baseline.** A slow, low-rate stuffing run that
  stays under every policy limit is invisible to these counters;
  that is the known gap commercial bot detection (roadmap T2.8) is
  meant to close if abuse is observed.
- **Neon usage is point-in-time.** `logical_size` and the period's
  CU-hours are read when the operator runs `neon.py usage`; nothing
  polls Neon continuously, and the script cannot see Vercel usage at
  all (that is the monthly manual check).
