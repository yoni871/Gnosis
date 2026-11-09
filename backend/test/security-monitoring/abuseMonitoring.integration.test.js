const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { Pool } = require("pg");
const {
    collectCounters,
    evaluateCounters,
} = require("../../scripts/security-monitoring");

// Integration test for the monitoring counters against a real disposable
// PostgreSQL 18.6 cluster. Run ONLY through
// `npm run test:abuse-monitoring` (backend/scripts/test-abuse-monitoring.js),
// which provisions the cluster, creates the database, and applies the
// real app migrations first — the tables below are created by the
// migrations, never by this file. The database URL must be loopback and
// named gnosis_migration_test_<16 hex>; anything else fails before any
// connection, the same guard the migration tests use.

const url = process.env.GNOSIS_ABUSE_MONITOR_TEST_DATABASE_URL;
if (!url) {
    throw new Error("Use npm run test:abuse-monitoring (it provisions the disposable database).");
}
const parsed = new URL(url);
if (parsed.hostname !== "127.0.0.1" || !/^gnosis_migration_test_[a-f0-9]{16}$/.test(parsed.pathname.slice(1))) {
    throw new Error("Refusing a non-disposable monitoring test database.");
}

let pool;

test.before(async () => {
    pool = new Pool({ connectionString: url, max: 2 });
    pool.on("error", () => {});
    const tables = await pool.query(
        "SELECT count(*)::int AS n FROM information_schema.tables " +
        "WHERE table_schema = 'public' AND table_name IN ('rate_limit_attempts', 'security_events')",
    );
    assert.equal(tables.rows[0].n, 2, "app migrations must have created both monitored tables");
});

test.after(async () => {
    if (pool) await pool.end();
});

async function clean() {
    await pool.query("DELETE FROM rate_limit_attempts");
    await pool.query("DELETE FROM security_events");
}

async function seedRateLimit(policy, keyHex, count, ageMinutes = 1) {
    const key = Buffer.from(keyHex, "hex");
    for (let i = 0; i < count; i++) {
        await pool.query(
            "INSERT INTO rate_limit_attempts(key_hash, policy, attempted_at) VALUES ($1, $2, now() - ($3 * INTERVAL '1 minute'))",
            [key, policy, ageMinutes],
        );
    }
}

async function seedEvent(kind, userId, count, ageMinutes = 1) {
    for (let i = 0; i < count; i++) {
        await pool.query(
            "INSERT INTO security_events(kind, user_id, created_at) VALUES ($1, $2, now() - ($3 * INTERVAL '1 minute'))",
            [kind, userId, ageMinutes],
        );
    }
}

test("counters count seeded rows per policy and kind", async () => {
    await clean();
    const keyA = randomBytes(32).toString("hex");
    const keyB = randomBytes(32).toString("hex");
    await seedRateLimit("login_ip", keyA, 2);
    await seedRateLimit("login_ip", keyB, 1);
    await seedRateLimit("login_ip_email", keyA, 2);
    await seedEvent("login.failure", 7, 2, 0);
    await seedEvent("login.success", 7, 1, 0);
    await seedEvent("refresh_token.reused", 7, 1, 0);

    const counters = await collectCounters(pool);
    assert.equal(counters.auditLog.deployed, true);
    const byPolicy = Object.fromEntries(counters.rateLimit.byPolicy.map((r) => [r.policy, r]));
    assert.equal(byPolicy.login_ip.rows, 3);
    assert.equal(byPolicy.login_ip.keys, 2);
    assert.equal(byPolicy.login_ip_email.rows, 2);
    assert.equal(byPolicy.login_ip_email.keys, 1);
    assert.deepEqual(counters.rateLimit.exhausted, []);
    const byKind = Object.fromEntries(counters.auditLog.byKind.map((r) => [r.kind, r.count]));
    assert.equal(byKind["login.failure"], 2);
    assert.equal(byKind["login.success"], 1);
    assert.equal(byKind["refresh_token.reused"], 1);
    assert.equal(counters.auditLog.loginFailuresLastMinute, 2);
    assert.deepEqual(counters.auditLog.topLoginFailuresPerUser, [{ user_id: 7, count: 2 }]);
    // One replay is an alert.
    assert.equal(evaluateCounters(counters).status, "alert");
});

test("a 12-in-a-minute login-failure burst alerts", async () => {
    await clean();
    await seedEvent("login.failure", null, 12, 0);
    const counters = await collectCounters(pool);
    assert.equal(counters.auditLog.loginFailuresLastMinute, 12);
    const result = evaluateCounters(counters);
    assert.equal(result.status, "alert");
    assert.equal(result.findings[0].id, "login-failure-burst");
});

test("ten failures for one user in 15 minutes alerts for that user", async () => {
    await clean();
    await seedEvent("login.failure", 42, 10, 5);
    await seedEvent("login.failure", 43, 3, 5);
    const counters = await collectCounters(pool);
    assert.deepEqual(counters.auditLog.topLoginFailuresPerUser, [
        { user_id: 42, count: 10 },
        { user_id: 43, count: 3 },
    ]);
    const result = evaluateCounters(counters);
    assert.equal(result.status, "alert");
    assert.equal(result.findings[0].id, "login-failure-per-user");
});

test("a key at its policy limit is an exhausted bucket (warn), below is not", async () => {
    await clean();
    const full = randomBytes(32).toString("hex");
    const partial = randomBytes(32).toString("hex");
    await seedRateLimit("login_ip_email", full, 5, 1); // limit is 5/15 min
    await seedRateLimit("login_ip_email", partial, 4, 1);
    const counters = await collectCounters(pool);
    assert.deepEqual(counters.rateLimit.exhausted, [{ policy: "login_ip_email", exhausted_keys: 1 }]);
    const result = evaluateCounters(counters);
    assert.equal(result.status, "warn");
    assert.equal(result.findings[0].id, "exhausted-buckets");
});

test("rows older than the window do not count", async () => {
    await clean();
    const key = randomBytes(32).toString("hex");
    await seedRateLimit("login_ip", key, 3, 61); // outside the 60-minute window
    await seedEvent("login.failure", 7, 4, 61);
    const counters = await collectCounters(pool);
    assert.deepEqual(counters.rateLimit.byPolicy, []);
    assert.deepEqual(counters.auditLog.byKind, []);
    assert.equal(counters.auditLog.loginFailuresLastMinute, 0);
    assert.equal(evaluateCounters(counters).status, "ok");
});

test("a missing security_events table degrades to a warning, not a crash", async () => {
    await clean();
    await seedRateLimit("login_ip", randomBytes(32).toString("hex"), 1);
    await pool.query("DROP TABLE security_events");
    const counters = await collectCounters(pool);
    assert.equal(counters.auditLog.deployed, false);
    assert.equal(counters.rateLimit.byPolicy[0].rows, 1);
    const result = evaluateCounters(counters);
    assert.equal(result.status, "warn");
    assert.equal(result.findings[0].id, "audit-log-missing");
});
