// API abuse + database-usage monitoring (roadmap T2.6 follow-up).
//
// Read-only operator script. It queries two tables and nothing else:
//   - rate_limit_attempts: counts per policy over recent windows. Rows
//     hold HMAC key hashes, never raw IPs or emails, and this script
//     never selects a key_hash value — only COUNTs leave the database.
//   - security_events: counts by kind (PR #78 audit log) over recent
//     windows, plus per-user login-failure bursts.
//
// It never writes: the pool is opened with
// default_transaction_read_only=on, every statement is a SELECT, and
// the script takes no action beyond printing a report and exiting
// non-zero when a threshold is breached (0 = clear, 1 = warning,
// 2 = alert or error).
//
// Neon usage is NOT fetched by this script: the Neon API key must only
// ever travel through the connector helper, never through a repo
// script's environment. The operator produces usage JSON with
// `neon.py usage <project_id>` (one file per project) and passes it
// with --usage-file; without it the Neon section reports "not checked".
// See docs/SecurityMonitoring.md.
//
// Usage:
//   GNOSIS_MONITOR_DATABASE_URL=postgresql://... \
//     node scripts/security-monitoring.js [--usage-file usage.json ...] [--json]
//
// GNOSIS_MONITOR_DATABASE_URL is required and has no default: the
// script must never guess which database to read, and must never fall
// back to the application's pool configuration.

const { Pool } = require("pg");
const fs = require("node:fs");
// dotenv 17 logs an "injected env" banner to stdout on every config()
// call unless silenced. This script's stdout is a report (or JSON with
// --json), so silence that banner before anything loads dotenv through
// the rateLimit -> db.js chain below. Only set when the operator has
// not chosen a value themselves.
if (process.env.DOTENV_CONFIG_QUIET === undefined) {
    process.env.DOTENV_CONFIG_QUIET = "1";
}
const { POLICIES } = require("../src/utils/rateLimit");

// Requiring rateLimit.js also loads src/db/db.js, which creates the
// application's (idle, never-connected) pools as a side effect. This
// script never queries through them: all reads go through its own
// read-only pool built from GNOSIS_MONITOR_DATABASE_URL below. The
// import exists only so the policy windows/limits below stay a single
// source of truth with the limiter itself.

const MIB = 1024 * 1024;

// Thresholds. Each rationale is documented in docs/SecurityMonitoring.md;
// the values here are the enforcement, the doc is the explanation.
const THRESHOLDS = Object.freeze({
    // Roadmap §9 incident-response trigger: "≥ 10 failed logins/min".
    loginFailurePerMinuteAlert: 10,
    // Same trigger, per account (a stuffing run aimed at one user).
    loginFailurePerUser15mAlert: 10,
    // Any replay of a consumed refresh token means a stolen token exists.
    refreshTokenReuseAlert: 1,
    // One exhausted bucket can be a legitimate user; ten distinct keys
    // at their limits in one window is a distributed burst.
    exhaustedBucketsWarn: 1,
    exhaustedBucketsAlert: 10,
    // Counted failures per policy per hour. Normal preview traffic is a
    // handful per hour; these are an initial baseline to tune once the
    // soak has produced real traffic.
    rateLimitRowsPerPolicyPerHourWarn: 100,
    rateLimitRowsPerPolicyPerHourAlert: 500,
    // Soak stop condition: any project's storage crossing 950 MB.
    storageWarnBytes: 950 * MIB,
    // Neon Free branch limit (branch_logical_size_limit_bytes = 1 GiB).
    storageAlertBytes: 1024 * MIB,
    // Neon Free: 100 CU-hours/project/month.
    cuHoursWarn: 80,
    cuHoursAlert: 100,
});

// Windows the counters are evaluated over. Fixed by design: the
// thresholds above are defined against these windows.
const WINDOWS = Object.freeze({
    rateLimitRowsMinutes: 60,
    auditKindMinutes: 60,
    loginFailureMinute: 1,
    loginFailurePerUserMinutes: 15,
});

// Audit kinds this script alerts on. Other kinds are counted and
// reported but carry no threshold yet (their owner PRs have not wired
// them; see docs/SecurityEvents.md).
const ALERT_KINDS = Object.freeze({
    "login.failure": "loginFailure",
    "refresh_token.reused": "refreshTokenReuse",
});

function isMissingTable(error) {
    return error && error.code === "42P01";
}

// --- Collection (read-only SQL) -------------------------------------------

// Per-policy counts over the last hour, plus per-policy exhausted
// buckets: distinct keys whose counted attempts inside their own policy
// window reached the policy limit. The exhausted-bucket subquery counts
// keys only; no key_hash value is ever selected or returned.
async function collectRateLimitCounts(db) {
    const byPolicy = await db.query(
        `SELECT policy, COUNT(*)::int AS rows, COUNT(DISTINCT key_hash)::int AS keys
         FROM rate_limit_attempts
         WHERE attempted_at > now() - ($1 * INTERVAL '1 minute')
         GROUP BY policy ORDER BY policy`,
        [WINDOWS.rateLimitRowsMinutes],
    );
    const policyValues = Object.entries(POLICIES).map(
        ([policy, { windowMs, limit }]) => `('${policy}', ${windowMs}, ${limit})`,
    );
    // Policy names, windows, and limits come from POLICIES (code), never
    // from user input, so interpolating them into the VALUES list is
    // safe; the time bound stays a parameter.
    const exhausted = await db.query(
        `SELECT policy, COUNT(*)::int AS exhausted_keys FROM (
             SELECT r.policy
             FROM rate_limit_attempts r
             JOIN (VALUES ${policyValues.join(", ")}) AS p(policy, window_ms, lim)
               ON r.policy = p.policy
             WHERE r.attempted_at > now() - (p.window_ms * INTERVAL '1 millisecond')
             GROUP BY r.policy, r.key_hash, p.lim
             HAVING COUNT(*) >= p.lim
         ) exhausted GROUP BY policy ORDER BY policy`,
    );
    return {
        byPolicy: byPolicy.rows,
        exhausted: exhausted.rows,
    };
}

// Audit-log counts. A missing security_events table means the audit
// log has not been deployed yet (PR #78 not live); that is reported,
// not fatal — the rate-limit counters still run.
async function collectAuditCounts(db) {
    try {
        const byKind = await db.query(
            `SELECT kind, COUNT(*)::int AS count
             FROM security_events
             WHERE created_at > now() - ($1 * INTERVAL '1 minute')
             GROUP BY kind ORDER BY kind`,
            [WINDOWS.auditKindMinutes],
        );
        const lastMinute = await db.query(
            `SELECT COUNT(*)::int AS count FROM security_events
             WHERE kind = 'login.failure'
               AND created_at > now() - ($1 * INTERVAL '1 minute')`,
            [WINDOWS.loginFailureMinute],
        );
        const perUser = await db.query(
            `SELECT user_id, COUNT(*)::int AS count FROM security_events
             WHERE kind = 'login.failure' AND user_id IS NOT NULL
               AND created_at > now() - ($1 * INTERVAL '1 minute')
             GROUP BY user_id ORDER BY count DESC LIMIT 5`,
            [WINDOWS.loginFailurePerUserMinutes],
        );
        return {
            deployed: true,
            byKind: byKind.rows,
            loginFailuresLastMinute: lastMinute.rows[0].count,
            topLoginFailuresPerUser: perUser.rows,
        };
    } catch (error) {
        if (isMissingTable(error)) {
            return { deployed: false, byKind: [], loginFailuresLastMinute: 0, topLoginFailuresPerUser: [] };
        }
        throw error;
    }
}

async function collectCounters(db) {
    const rateLimit = await collectRateLimitCounts(db);
    const auditLog = await collectAuditCounts(db);
    return { rateLimit, auditLog };
}

// --- Evaluation (pure: counts in, findings out) ---------------------------

function evaluateCounters(counters) {
    const findings = [];
    const { rateLimit, auditLog } = counters;

    for (const row of rateLimit.byPolicy) {
        if (row.rows >= THRESHOLDS.rateLimitRowsPerPolicyPerHourAlert) {
            findings.push({ id: "rate-limit-rows", severity: "alert", counter: `rate_limit_attempts:${row.policy}/hour`,
                value: row.rows, threshold: THRESHOLDS.rateLimitRowsPerPolicyPerHourAlert,
                detail: `${row.rows} counted failures for policy ${row.policy} in the last hour across ${row.keys} distinct keys.` });
        } else if (row.rows >= THRESHOLDS.rateLimitRowsPerPolicyPerHourWarn) {
            findings.push({ id: "rate-limit-rows", severity: "warn", counter: `rate_limit_attempts:${row.policy}/hour`,
                value: row.rows, threshold: THRESHOLDS.rateLimitRowsPerPolicyPerHourWarn,
                detail: `${row.rows} counted failures for policy ${row.policy} in the last hour across ${row.keys} distinct keys.` });
        }
    }
    for (const row of rateLimit.exhausted) {
        if (row.exhausted_keys >= THRESHOLDS.exhaustedBucketsAlert) {
            findings.push({ id: "exhausted-buckets", severity: "alert", counter: `exhausted-buckets:${row.policy}`,
                value: row.exhausted_keys, threshold: THRESHOLDS.exhaustedBucketsAlert,
                detail: `${row.exhausted_keys} distinct keys at the ${row.policy} limit inside its window.` });
        } else if (row.exhausted_keys >= THRESHOLDS.exhaustedBucketsWarn) {
            findings.push({ id: "exhausted-buckets", severity: "warn", counter: `exhausted-buckets:${row.policy}`,
                value: row.exhausted_keys, threshold: THRESHOLDS.exhaustedBucketsWarn,
                detail: `${row.exhausted_keys} distinct key(s) at the ${row.policy} limit inside its window.` });
        }
    }

    if (!auditLog.deployed) {
        findings.push({ id: "audit-log-missing", severity: "warn", counter: "security_events",
            value: 0, threshold: 0,
            detail: "Audit log not yet deployed: security_events table is missing, so login-failure and token-reuse alerts are blind." });
        return { status: findings.some((f) => f.severity === "alert") ? "alert" : "warn", findings };
    }
    if (auditLog.loginFailuresLastMinute >= THRESHOLDS.loginFailurePerMinuteAlert) {
        findings.push({ id: "login-failure-burst", severity: "alert", counter: "login.failure/minute",
            value: auditLog.loginFailuresLastMinute, threshold: THRESHOLDS.loginFailurePerMinuteAlert,
            detail: `${auditLog.loginFailuresLastMinute} login failures in the last minute (roadmap §9 IR trigger: ≥ 10/min).` });
    }
    for (const row of auditLog.topLoginFailuresPerUser) {
        if (row.count >= THRESHOLDS.loginFailurePerUser15mAlert) {
            findings.push({ id: "login-failure-per-user", severity: "alert", counter: "login.failure/user/15m",
                value: row.count, threshold: THRESHOLDS.loginFailurePerUser15mAlert,
                detail: `User ${row.user_id} had ${row.count} login failures in the last 15 minutes.` });
        }
    }
    for (const row of auditLog.byKind) {
        if (row.kind === "refresh_token.reused" && row.count >= THRESHOLDS.refreshTokenReuseAlert) {
            findings.push({ id: "refresh-token-reuse", severity: "alert", counter: "refresh_token.reused/hour",
                value: row.count, threshold: THRESHOLDS.refreshTokenReuseAlert,
                detail: `${row.count} refresh-token replay(s) in the last hour; each one already revoked its session family, but a stolen token exists.` });
        }
    }
    const status = findings.some((f) => f.severity === "alert")
        ? "alert" : findings.some((f) => f.severity === "warn") ? "warn" : "ok";
    return { status, findings };
}

// `usage` is one parsed `neon.py usage <project_id>` document: per-branch
// logical sizes plus the project's compute usage for the current
// consumption period. See docs/SecurityMonitoring.md.
function evaluateNeonUsage(usage) {
    const findings = [];
    const project = usage.project_name || usage.project_id || "unknown project";
    for (const branch of usage.branches || []) {
        const size = branch.logical_size_bytes;
        if (size >= THRESHOLDS.storageAlertBytes) {
            findings.push({ id: "neon-storage", severity: "alert", counter: `neon-storage:${project}/${branch.name}`,
                value: size, threshold: THRESHOLDS.storageAlertBytes,
                detail: `Branch ${branch.name} is at ${(size / MIB).toFixed(1)} MiB, at or over the 1 GiB Neon Free branch limit.` });
        } else if (size >= THRESHOLDS.storageWarnBytes) {
            findings.push({ id: "neon-storage", severity: "warn", counter: `neon-storage:${project}/${branch.name}`,
                value: size, threshold: THRESHOLDS.storageWarnBytes,
                detail: `Branch ${branch.name} is at ${(size / MIB).toFixed(1)} MiB, over the 950 MiB soak stop condition.` });
        }
    }
    const total = usage.storage_total_bytes;
    if (typeof total === "number") {
        if (total >= THRESHOLDS.storageAlertBytes) {
            findings.push({ id: "neon-storage-total", severity: "alert", counter: `neon-storage-total:${project}`,
                value: total, threshold: THRESHOLDS.storageAlertBytes,
                detail: `Project total storage is ${(total / MIB).toFixed(1)} MiB, at or over the 1 GiB Free cap.` });
        } else if (total >= THRESHOLDS.storageWarnBytes) {
            findings.push({ id: "neon-storage-total", severity: "warn", counter: `neon-storage-total:${project}`,
                value: total, threshold: THRESHOLDS.storageWarnBytes,
                detail: `Project total storage is ${(total / MIB).toFixed(1)} MiB, over the 950 MiB soak stop condition.` });
        }
    }
    const cuHours = usage.compute_cu_hours;
    if (typeof cuHours === "number") {
        if (cuHours >= THRESHOLDS.cuHoursAlert) {
            findings.push({ id: "neon-cu-hours", severity: "alert", counter: `neon-cu-hours:${project}`,
                value: cuHours, threshold: THRESHOLDS.cuHoursAlert,
                detail: `Project used ${cuHours.toFixed(2)} CU-hours this period, at or over the 100 CU-hours/month Free cap.` });
        } else if (cuHours >= THRESHOLDS.cuHoursWarn) {
            findings.push({ id: "neon-cu-hours", severity: "warn", counter: `neon-cu-hours:${project}`,
                value: cuHours, threshold: THRESHOLDS.cuHoursWarn,
                detail: `Project used ${cuHours.toFixed(2)} CU-hours this period, over the 80 CU-hour warning line.` });
        }
    }
    return findings;
}

function statusFor(findings) {
    if (findings.some((f) => f.severity === "alert")) return "alert";
    if (findings.some((f) => f.severity === "warn")) return "warn";
    return "ok";
}

function statusToExitCode(status) {
    return status === "alert" ? 2 : status === "warn" ? 1 : 0;
}

// --- Reporting --------------------------------------------------------------

function formatReportText({ counters, usages, findings }) {
    const lines = ["Gnosis security monitoring report", "================================="];
    lines.push("");
    lines.push("Rate limiting (last 60 minutes):");
    if (counters.rateLimit.byPolicy.length === 0) {
        lines.push("  no counted attempts");
    }
    for (const row of counters.rateLimit.byPolicy) {
        lines.push(`  ${row.policy}: ${row.rows} counted failures, ${row.keys} distinct keys`);
    }
    if (counters.rateLimit.exhausted.length === 0) {
        lines.push("  no buckets at their limit");
    }
    for (const row of counters.rateLimit.exhausted) {
        lines.push(`  ${row.policy}: ${row.exhausted_keys} key(s) at the limit`);
    }
    lines.push("");
    lines.push("Audit log (last 60 minutes):");
    if (!counters.auditLog.deployed) {
        lines.push("  audit log not yet deployed (security_events table is missing)");
    } else {
        if (counters.auditLog.byKind.length === 0) lines.push("  no events");
        for (const row of counters.auditLog.byKind) {
            lines.push(`  ${row.kind}: ${row.count}`);
        }
        lines.push(`  login.failure in the last minute: ${counters.auditLog.loginFailuresLastMinute}`);
        for (const row of counters.auditLog.topLoginFailuresPerUser) {
            lines.push(`  user ${row.user_id}: ${row.count} login failures in the last 15 minutes`);
        }
    }
    lines.push("");
    lines.push("Neon usage:");
    if (usages.length === 0) {
        lines.push("  not checked — run `neon.py usage <project_id>` per project and pass --usage-file");
    }
    for (const usage of usages) {
        const name = usage.project_name || usage.project_id || "unknown project";
        const storage = typeof usage.storage_total_bytes === "number"
            ? `${(usage.storage_total_bytes / MIB).toFixed(1)} MiB` : "?";
        lines.push(`  ${name}: ${storage} total storage, ` +
            `${typeof usage.compute_cu_hours === "number" ? usage.compute_cu_hours.toFixed(2) : "?"} CU-hours this period ` +
            `(${usage.period_start || "?"} to ${usage.period_end || "?"})`);
        for (const branch of usage.branches || []) {
            const branchSize = typeof branch.logical_size_bytes === "number"
                ? `${(branch.logical_size_bytes / MIB).toFixed(1)} MiB` : "?";
            lines.push(`    ${branch.name}: ${branchSize}`);
        }
    }
    lines.push("");
    lines.push(`Findings (${findings.length}):`);
    if (findings.length === 0) lines.push("  none — all counters within thresholds");
    for (const finding of findings) {
        lines.push(`  [${finding.severity.toUpperCase()}] ${finding.counter}: ${finding.detail}`);
    }
    return lines.join("\n") + "\n";
}

// --- CLI --------------------------------------------------------------------

function parseArgs(argv) {
    const usageFiles = [];
    let json = false;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--usage-file") {
            const file = argv[i + 1];
            if (!file || file.startsWith("--")) throw new Error("--usage-file requires a path.");
            usageFiles.push(file);
            i++;
        } else if (argv[i] === "--json") {
            json = true;
        } else {
            throw new Error(`Unknown argument: ${argv[i]}`);
        }
    }
    return { usageFiles, json };
}

async function main(argv, env) {
    const { usageFiles, json } = parseArgs(argv);
    const databaseUrl = env.GNOSIS_MONITOR_DATABASE_URL;
    if (!databaseUrl) {
        throw new Error("GNOSIS_MONITOR_DATABASE_URL is required (no default; the script never guesses a database).");
    }
    const usages = usageFiles.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
    // Read-only by construction: every statement is a SELECT, and the
    // session is additionally forced read-only server-side.
    const pool = new Pool({
        connectionString: databaseUrl,
        max: 2,
        connectionTimeoutMillis: 10000,
        statement_timeout: 30000,
        options: "-c default_transaction_read_only=on",
    });
    try {
        const counters = await collectCounters(pool);
        const counterResult = evaluateCounters(counters);
        const neonFindings = usages.flatMap((usage) => evaluateNeonUsage(usage));
        const findings = [...counterResult.findings, ...neonFindings];
        const status = statusFor(findings);
        const result = { status, counters, usages, findings };
        if (json) {
            process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        } else {
            process.stdout.write(formatReportText(result));
            process.stdout.write(`Status: ${status.toUpperCase()}\n`);
        }
        return statusToExitCode(status);
    } finally {
        await pool.end().catch(() => {});
        // The rateLimit.js import created the application's idle pools;
        // end them so the process exits deterministically.
        try {
            const appPool = require("../src/db/db");
            await appPool.end().catch(() => {});
        } catch {
            // The application pool was never needed; ignore teardown errors.
        }
    }
}

if (require.main === module) {
    main(process.argv.slice(2), process.env).then(
        (code) => { process.exitCode = code; },
        (error) => {
            console.error(`security-monitoring: ${error.message}`);
            process.exitCode = 2;
        },
    );
}

module.exports = {
    THRESHOLDS,
    WINDOWS,
    ALERT_KINDS,
    collectCounters,
    collectRateLimitCounts,
    collectAuditCounts,
    evaluateCounters,
    evaluateNeonUsage,
    statusFor,
    statusToExitCode,
    formatReportText,
};
