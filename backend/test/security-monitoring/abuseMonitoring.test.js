const test = require("node:test");
const assert = require("node:assert/strict");
const {
    THRESHOLDS,
    collectCounters,
    evaluateCounters,
    evaluateNeonUsage,
    statusFor,
    statusToExitCode,
    formatReportText,
} = require("../../scripts/security-monitoring");
const { POLICIES } = require("../../src/utils/rateLimit");

// Fake db: answers canned rows by matching a distinctive substring of
// each query. Records every query so tests can prove the script only
// ever issues SELECTs.
function fakeDb(handlers) {
    const calls = [];
    return {
        calls,
        query: async (sql, params) => {
            calls.push([sql, params]);
            for (const [needle, result] of handlers) {
                if (sql.includes(needle)) return result;
            }
            throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
        },
    };
}

function emptyCounters() {
    return {
        rateLimit: { byPolicy: [], exhausted: [] },
        auditLog: { deployed: true, byKind: [], loginFailuresLastMinute: 0, topLoginFailuresPerUser: [] },
    };
}

const MIB = 1024 * 1024;

test("thresholds hold the documented values", () => {
    assert.ok(Object.isFrozen(THRESHOLDS));
    assert.equal(THRESHOLDS.loginFailurePerMinuteAlert, 10);
    assert.equal(THRESHOLDS.loginFailurePerUser15mAlert, 10);
    assert.equal(THRESHOLDS.refreshTokenReuseAlert, 1);
    assert.equal(THRESHOLDS.exhaustedBucketsWarn, 1);
    assert.equal(THRESHOLDS.exhaustedBucketsAlert, 10);
    assert.equal(THRESHOLDS.rateLimitRowsPerPolicyPerHourWarn, 100);
    assert.equal(THRESHOLDS.rateLimitRowsPerPolicyPerHourAlert, 500);
    assert.equal(THRESHOLDS.storageWarnBytes, 950 * MIB);
    assert.equal(THRESHOLDS.storageAlertBytes, 1024 * MIB);
    assert.equal(THRESHOLDS.cuHoursWarn, 80);
    assert.equal(THRESHOLDS.cuHoursAlert, 100);
});

test("every limiter policy has a positive window and limit", () => {
    for (const [policy, { windowMs, limit }] of Object.entries(POLICIES)) {
        assert.ok(Number.isInteger(windowMs) && windowMs > 0, policy);
        assert.ok(Number.isInteger(limit) && limit > 0, policy);
    }
    // The policies the counters reason about.
    assert.deepEqual(Object.keys(POLICIES).sort(), [
        "forgot_ip", "forgot_ip_email", "login_ip", "login_ip_email",
        "register_ip", "resend_ip", "resend_ip_email", "reset_ip", "verify_ip",
    ]);
});

test("empty counters evaluate to ok with no findings", () => {
    const { status, findings } = evaluateCounters(emptyCounters());
    assert.equal(status, "ok");
    assert.deepEqual(findings, []);
});

test("login-failure burst: 9/min is clear, 10/min alerts", () => {
    const counters = emptyCounters();
    counters.auditLog.loginFailuresLastMinute = 9;
    assert.equal(evaluateCounters(counters).status, "ok");
    counters.auditLog.loginFailuresLastMinute = 10;
    const result = evaluateCounters(counters);
    assert.equal(result.status, "alert");
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, "login-failure-burst");
    assert.equal(result.findings[0].severity, "alert");
    assert.equal(result.findings[0].threshold, 10);
});

test("per-user login failures: 10 in 15 minutes alerts for that user", () => {
    const counters = emptyCounters();
    counters.auditLog.topLoginFailuresPerUser = [
        { user_id: 12, count: 9 },
        { user_id: 13, count: 10 },
    ];
    const result = evaluateCounters(counters);
    assert.equal(result.status, "alert");
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, "login-failure-per-user");
    assert.match(result.findings[0].detail, /User 13 had 10 login failures/);
});

test("any refresh-token reuse alerts", () => {
    const counters = emptyCounters();
    counters.auditLog.byKind = [{ kind: "refresh_token.reused", count: 0 }];
    assert.equal(evaluateCounters(counters).status, "ok");
    counters.auditLog.byKind = [{ kind: "refresh_token.reused", count: 1 }];
    const result = evaluateCounters(counters);
    assert.equal(result.status, "alert");
    assert.equal(result.findings[0].id, "refresh-token-reuse");
});

test("other audit kinds are counted but carry no threshold", () => {
    const counters = emptyCounters();
    counters.auditLog.byKind = [
        { kind: "login.success", count: 400 },
        { kind: "logout.all", count: 50 },
        { kind: "password_reset.completed", count: 30 },
    ];
    assert.equal(evaluateCounters(counters).status, "ok");
});

test("exhausted buckets: one warns, ten alert", () => {
    const counters = emptyCounters();
    counters.rateLimit.exhausted = [{ policy: "login_ip_email", exhausted_keys: 1 }];
    const warned = evaluateCounters(counters);
    assert.equal(warned.status, "warn");
    assert.equal(warned.findings[0].severity, "warn");
    counters.rateLimit.exhausted = [{ policy: "login_ip", exhausted_keys: 10 }];
    const alerted = evaluateCounters(counters);
    assert.equal(alerted.status, "alert");
    assert.equal(alerted.findings[0].id, "exhausted-buckets");
});

test("rate-limit rows per policy per hour: 99 clear, 100 warns, 500 alerts", () => {
    const counters = emptyCounters();
    counters.rateLimit.byPolicy = [{ policy: "login_ip", rows: 99, keys: 40 }];
    assert.equal(evaluateCounters(counters).status, "ok");
    counters.rateLimit.byPolicy = [{ policy: "login_ip", rows: 100, keys: 40 }];
    assert.equal(evaluateCounters(counters).status, "warn");
    counters.rateLimit.byPolicy = [{ policy: "login_ip", rows: 500, keys: 200 }];
    const result = evaluateCounters(counters);
    assert.equal(result.status, "alert");
    assert.equal(result.findings[0].id, "rate-limit-rows");
});

test("missing security_events table warns and stays blind, not fatal", () => {
    const counters = emptyCounters();
    counters.auditLog = { deployed: false, byKind: [], loginFailuresLastMinute: 0, topLoginFailuresPerUser: [] };
    const result = evaluateCounters(counters);
    assert.equal(result.status, "warn");
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, "audit-log-missing");
    assert.match(result.findings[0].detail, /not yet deployed/);
});

test("collectCounters issues SELECTs only and never selects a key hash", async () => {
    const db = fakeDb([
        ["COUNT(DISTINCT key_hash)", { rows: [{ policy: "login_ip", rows: 3, keys: 2 }] }],
        ["exhausted_keys", { rows: [] }],
        ["GROUP BY kind", { rows: [{ kind: "login.failure", count: 3 }] }],
        ["GROUP BY user_id", { rows: [] }],
        ["login.failure", { rows: [{ count: 1 }] }],
    ]);
    const counters = await collectCounters(db);
    assert.equal(counters.rateLimit.byPolicy[0].policy, "login_ip");
    assert.equal(counters.auditLog.deployed, true);
    assert.equal(counters.auditLog.loginFailuresLastMinute, 1);
    assert.equal(db.calls.length, 5);
    for (const [sql] of db.calls) {
        assert.match(sql.trimStart(), /^SELECT/i, "every monitoring query is a SELECT");
        assert.ok(!/INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|GRANT|REVOKE/i.test(sql), "no write statement");
        // Only COUNTs of key hashes leave the database; the hash values
        // themselves are never selected.
        assert.ok(!/SELECT[^;]*key_hash[^;]*FROM/i.test(sql.replace(/COUNT\(DISTINCT key_hash\)/g, "")));
    }
});

test("collectCounters tolerates a missing security_events table", async () => {
    const missing = Object.assign(new Error("relation \"security_events\" does not exist"), { code: "42P01" });
    const db = fakeDb([
        ["COUNT(DISTINCT key_hash)", { rows: [] }],
        ["exhausted_keys", { rows: [] }],
    ]);
    const original = db.query;
    db.query = async (sql, params) => {
        if (sql.includes("security_events")) throw missing;
        return original(sql, params);
    };
    const counters = await collectCounters(db);
    assert.equal(counters.auditLog.deployed, false);
    assert.deepEqual(counters.rateLimit.byPolicy, []);
    assert.equal(evaluateCounters(counters).status, "warn");
});

test("collectCounters propagates a non-missing-table database error", async () => {
    const db = fakeDb([]);
    db.query = async () => { throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }); };
    await assert.rejects(collectCounters(db), /connection refused/);
});

test("status mapping: ok 0, warn 1, alert 2", () => {
    assert.equal(statusFor([]), "ok");
    assert.equal(statusFor([{ severity: "warn" }]), "warn");
    assert.equal(statusFor([{ severity: "warn" }, { severity: "alert" }]), "alert");
    assert.equal(statusToExitCode("ok"), 0);
    assert.equal(statusToExitCode("warn"), 1);
    assert.equal(statusToExitCode("alert"), 2);
});

// --- Neon usage evaluation (fixtures; no live Neon in unit tests) --------

function usageFixture(overrides = {}) {
    return {
        project_id: "hidden-mud-12990395",
        project_name: "gnosis-commentary",
        period_start: "2026-11-01T00:00:00Z",
        period_end: "2026-12-01T00:00:00Z",
        compute_cu_hours: 1.27,
        storage_total_bytes: 935575552,
        branches: [
            { id: "br-frosty-boat-bbf3re5m", name: "preview", logical_size_bytes: 903856128 },
            { id: "br-dry-wildflower-bbyvolbd", name: "production", logical_size_bytes: 31719424 },
        ],
        ...overrides,
    };
}

test("Neon usage: the recorded Commentary numbers breach no threshold", () => {
    // Recorded 2026-11-09 via `neon.py usage`: preview 903,856,128 B
    // (862.0 MiB), project total 935,575,552 B (892.2 MiB), 1.27 CU-hours.
    assert.deepEqual(evaluateNeonUsage(usageFixture()), []);
});

test("Neon usage: a branch at 960 MiB warns, at 1 GiB alerts", () => {
    const warned = evaluateNeonUsage(usageFixture({
        storage_total_bytes: 960 * MIB,
        branches: [{ name: "preview", logical_size_bytes: 960 * MIB }],
    }));
    assert.equal(warned.length, 2); // branch warn + project-total warn
    assert.ok(warned.every((f) => f.severity === "warn"));
    const alerted = evaluateNeonUsage(usageFixture({
        storage_total_bytes: 1024 * MIB,
        branches: [{ name: "preview", logical_size_bytes: 1024 * MIB }],
    }));
    assert.ok(alerted.some((f) => f.severity === "alert" && f.id === "neon-storage"));
    assert.ok(alerted.some((f) => f.severity === "alert" && f.id === "neon-storage-total"));
});

test("Neon usage: CU-hours warn at 80, alert at 100", () => {
    assert.equal(evaluateNeonUsage(usageFixture({ compute_cu_hours: 79.9 })).length, 0);
    const warned = evaluateNeonUsage(usageFixture({ compute_cu_hours: 80 }));
    assert.equal(warned.length, 1);
    assert.equal(warned[0].severity, "warn");
    const alerted = evaluateNeonUsage(usageFixture({ compute_cu_hours: 100 }));
    assert.equal(alerted.length, 1);
    assert.equal(alerted[0].severity, "alert");
    assert.equal(alerted[0].id, "neon-cu-hours");
});

test("Neon usage tolerates a missing compute figure", () => {
    const usage = usageFixture();
    delete usage.compute_cu_hours;
    assert.deepEqual(evaluateNeonUsage(usage), []);
});

// --- Report formatting -----------------------------------------------------

test("text report names the audit gap and the unchecked Neon section", () => {
    const counters = emptyCounters();
    counters.auditLog = { deployed: false, byKind: [], loginFailuresLastMinute: 0, topLoginFailuresPerUser: [] };
    const report = formatReportText({
        counters,
        usages: [],
        findings: evaluateCounters(counters).findings,
    });
    assert.match(report, /audit log not yet deployed/);
    assert.match(report, /not checked/);
    assert.match(report, /neon\.py usage/);
    assert.match(report, /\[WARN\]/);
});

test("text report lists counters, usage, and alert findings", () => {
    const counters = emptyCounters();
    counters.rateLimit.byPolicy = [{ policy: "login_ip", rows: 3, keys: 2 }];
    counters.auditLog.byKind = [{ kind: "refresh_token.reused", count: 1 }];
    counters.auditLog.loginFailuresLastMinute = 0;
    const result = evaluateCounters(counters);
    const report = formatReportText({
        counters,
        usages: [usageFixture()],
        findings: result.findings,
    });
    assert.match(report, /login_ip: 3 counted failures, 2 distinct keys/);
    assert.match(report, /refresh_token\.reused: 1/);
    assert.match(report, /gnosis-commentary: 892\.2 MiB total storage, 1\.27 CU-hours/);
    assert.match(report, /\[ALERT\] refresh_token\.reused\/hour/);
});
