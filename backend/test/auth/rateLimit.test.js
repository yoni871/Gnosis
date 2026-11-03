const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = "test-secret";
process.env.RATE_LIMIT_KEY_SECRET = "test-rate-limit-secret";

const pool = require("../../src/db/db");
const {
    POLICIES,
    RATE_LIMITED_BODY,
    computeKeyHash,
    attemptReservation,
    releaseReservations,
    maybeCleanup,
    createRateLimitMiddleware,
    resolveTrustProxy,
} = require("../../src/utils/rateLimit");

const SECRET = "test-rate-limit-secret";

test.after(async () => {
    await pool.end();
});

// ---------------------------------------------------------------------------
// Fake PostgreSQL client: answers limiter SQL in memory and logs every
// query, so reservation, counting, and sweep logic can be proven without
// a database. `counts` maps a policy name to its counted rows; `oldest`
// is the oldest counted attempt for retry-after math.
// ---------------------------------------------------------------------------

class FakeClient {
    constructor(options = {}) {
        this.options = options;
        this.queries = [];
        this.released = 0;
        this.inserted = [];
    }

    async query(sql, params = []) {
        this.queries.push({ sql, params });
        const failOn = this.options.failOn;
        if (failOn && sql.includes(failOn)) {
            throw new Error("Synthetic query failure");
        }
        if (sql.includes("pg_advisory_xact_lock")) {
            return { rows: [{ pg_advisory_xact_lock: true }] };
        }
        if (sql.includes("pg_try_advisory_xact_lock")) {
            return { rows: [{ locked: this.options.tryLock !== false }] };
        }
        if (sql.includes("INSERT INTO rate_limit_attempts")) {
            const id = `res-${this.inserted.length + 1}`;
            this.inserted.push({ id, keyHash: params[0], policy: params[1] });
            return { rows: [{ id }] };
        }
        if (sql.includes("DELETE FROM rate_limit_attempts")) {
            return { rows: [], rowCount: this.options.deleted ?? 0 };
        }
        if (sql.includes("FROM rate_limit_attempts")) {
            const policy = params[1];
            const entry = (this.options.counts || {})[policy] || { count: 0, oldest: null };
            return { rows: [{ count: entry.count, oldest: entry.oldest }] };
        }
        if (sql.includes("FROM rate_limit_sweep_state")) {
            if (this.options.noSweepState) {
                return { rows: [] };
            }
            return { rows: [{ last_swept_at: this.options.sweepState ?? new Date(0) }] };
        }
        return { rows: [] };
    }

    release() {
        this.released += 1;
    }
}

function keyFor(policy, fields, secret = SECRET) {
    return computeKeyHash(policy, fields, secret);
}

function fakeResponse() {
    const res = {
        statusCode: null,
        headers: {},
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
    return res;
}

// ---------------------------------------------------------------------------
// Keying
// ---------------------------------------------------------------------------

test("key hashes are deterministic HMACs, never raw values or plain hashes", () => {
    const hash = keyFor("login_ip_email", ["203.0.113.9", "user@example.com"]);
    assert.equal(hash.length, 32);
    assert.deepEqual(hash, keyFor("login_ip_email", ["203.0.113.9", "user@example.com"]));
    assert.ok(!hash.toString("hex").includes("203.0.113.9"));
    assert.ok(!hash.toString("hex").includes("user@example.com"));
    const plain = crypto.createHash("sha256").update("login_ip_email203.0.113.9user@example.com").digest();
    assert.notDeepEqual(hash, plain, "a plain hash would be dictionary reversible");
});

test("key hashes separate policies, fields, and field splits", () => {
    const base = keyFor("login_ip_email", ["203.0.113.9", "user@example.com"]);
    assert.notDeepEqual(base, keyFor("login_ip", ["203.0.113.9", "user@example.com"]));
    assert.notDeepEqual(base, keyFor("login_ip_email", ["203.0.113.10", "user@example.com"]));
    assert.notDeepEqual(base, keyFor("login_ip_email", ["203.0.113.9", "other@example.com"]));
    assert.notDeepEqual(base, keyFor("login_ip_email", ["203.0.113.9"]));
    // Length-prefixing, not delimiter joins: ("ab", "c") and ("a", "bc")
    // must never collide.
    assert.notDeepEqual(
        keyFor("login_ip_email", ["ab", "c"]),
        keyFor("login_ip_email", ["a", "bc"]),
    );
    assert.notDeepEqual(base, keyFor("login_ip_email", ["203.0.113.9", "user@example.com"], "other-secret"));
});

test("key hashing rejects non-string fields instead of silently coercing", () => {
    assert.throws(() => keyFor("login_ip_email", ["203.0.113.9", 42]), /must be strings/);
    assert.throws(() => keyFor("login_ip_email", "not-an-array"), /must be strings/);
});

// ---------------------------------------------------------------------------
// Trust proxy setting
// ---------------------------------------------------------------------------

test("trust proxy parsing accepts the documented values only", () => {
    assert.equal(resolveTrustProxy(undefined), false);
    assert.equal(resolveTrustProxy(""), false);
    assert.equal(resolveTrustProxy("0"), false);
    assert.equal(resolveTrustProxy("false"), false);
    assert.equal(resolveTrustProxy("true"), true);
    assert.equal(resolveTrustProxy("1"), 1);
    assert.equal(resolveTrustProxy("3"), 3);
    assert.equal(resolveTrustProxy("loopback"), "loopback");
    assert.deepEqual(resolveTrustProxy("loopback, 10.0.0.0/8"), ["loopback", "10.0.0.0/8"]);
    assert.equal(resolveTrustProxy("203.0.113.1"), "203.0.113.1");
    assert.equal(resolveTrustProxy("2001:db8::/32"), "2001:db8::/32");
});

test("trust proxy parsing rejects values that could silently spoof clients", () => {
    for (const bad of ["-1", "yes", "not-a-proxy-value", "999.999.999.999",
        "10.0.0.0/33", "2001:db8::/129", "loopback,", ",,", "1.2.3"]) {
        assert.throws(() => resolveTrustProxy(bad), /Invalid trust proxy/, bad);
    }
});

// ---------------------------------------------------------------------------
// Cleanup (run first: these tests drive the module throttle with injected
// future timestamps, and later tests rely on cleanup being throttled off).
// ---------------------------------------------------------------------------

test("cleanup sweeps only expired rows in one bounded batch", async () => {
    const client = new FakeClient({ deleted: 7 });
    const fakePool = { connect: async () => client, query: async () => ({ rows: [] }) };
    const now = 5_000_000_000_000;
    const result = await maybeCleanup(fakePool, { now });
    assert.equal(result.swept, 7);
    const del = client.queries.find((query) => query.sql.includes("DELETE FROM rate_limit_attempts"));
    assert.ok(del, "a sweep must delete");
    assert.equal(del.params[1], 1000, "the batch is bounded");
    assert.ok(Math.abs(del.params[0].getTime() - (now - 60 * 60 * 1000)) < 1000,
        "the cutoff is the longest window, 60 minutes");
    const update = client.queries.find((query) => query.sql.includes("UPDATE rate_limit_sweep_state"));
    assert.ok(update, "a sweep advances the shared state row");
    assert.equal(client.released, 1);
});

test("cleanup throttles per instance within the interval", async () => {
    const client = new FakeClient();
    const fakePool = { connect: async () => client, query: async () => ({ rows: [] }) };
    const now = 5_000_000_100_000;
    const first = await maybeCleanup(fakePool, { now });
    assert.equal(first.swept, 0);
    const queriesAfterFirst = client.queries.length;
    const second = await maybeCleanup(fakePool, { now: now + 30_000 });
    assert.deepEqual(second, { skipped: "throttle" });
    assert.equal(client.queries.length, queriesAfterFirst, "a throttled sweep issues no queries");
    const third = await maybeCleanup(fakePool, { now: now + 61_000 });
    assert.equal(third.swept, 0, "the next interval sweeps again");
});

test("cleanup skips when another instance holds the sweep lock", async () => {
    const client = new FakeClient({ tryLock: false });
    const fakePool = { connect: async () => client, query: async () => ({ rows: [] }) };
    const result = await maybeCleanup(fakePool, { now: 5_000_000_300_000 });
    assert.deepEqual(result, { skipped: "lock" });
    assert.ok(!client.queries.some((query) => query.sql.includes("DELETE FROM")),
        "a losing instance deletes nothing");
});

test("cleanup skips when the shared interval has not elapsed", async () => {
    const client = new FakeClient({ sweepState: new Date(5_000_000_400_000 - 10_000) });
    const fakePool = { connect: async () => client, query: async () => ({ rows: [] }) };
    const result = await maybeCleanup(fakePool, { now: 5_000_000_400_000 });
    assert.deepEqual(result, { skipped: "interval" });
});

test("cleanup skips when the sweep-state row is missing", async () => {
    const client = new FakeClient({ noSweepState: true });
    const fakePool = { connect: async () => client, query: async () => ({ rows: [] }) };
    const result = await maybeCleanup(fakePool, { now: 5_000_000_500_000 });
    assert.deepEqual(result, { skipped: "no-state" });
});

test("cleanup failure is isolated: it never throws and never poisons counters", async () => {
    const sweepClient = new FakeClient({ failOn: "DELETE FROM rate_limit_attempts" });
    const fakePool = {
        connect: async () => sweepClient,
        query: async () => ({ rows: [] }),
    };
    const result = await maybeCleanup(fakePool, { now: 5_000_000_600_000 });
    assert.deepEqual(result, { skipped: "error" });
    const counterClient = new FakeClient();
    const outcome = await attemptReservation(
        { connect: async () => counterClient, query: async () => ({ rows: [] }) },
        "login_ip_email",
        keyFor("login_ip_email", ["203.0.113.9", "user@example.com"]),
    );
    assert.equal(outcome.allowed, true, "counters still work after a sweep failure");
});

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

test("reservation commits in order: lock, insert, count, commit", async () => {
    const client = new FakeClient();
    const fakePool = { connect: async () => client, query: async () => ({ rows: [] }) };
    const outcome = await attemptReservation(fakePool, "login_ip_email",
        keyFor("login_ip_email", ["203.0.113.9", "user@example.com"]));
    assert.equal(outcome.allowed, true);
    assert.equal(outcome.reservation.id, "res-1");
    const statements = client.queries.map((query) => query.sql);
    assert.deepEqual(statements, [
        "BEGIN",
        "SELECT pg_advisory_xact_lock($1, $2)",
        "INSERT INTO rate_limit_attempts(key_hash, policy) VALUES ($1, $2) RETURNING id",
        `SELECT COUNT(*)::int AS count, MIN(attempted_at) AS oldest
                 FROM rate_limit_attempts
                 WHERE key_hash = $1 AND policy = $2
                   AND attempted_at > now() - ($3 * INTERVAL '1 millisecond')`,
        "COMMIT",
    ]);
    assert.equal(client.released, 1);
});

test("reservation over the limit rolls back and reports retry-after", async () => {
    const oldest = new Date(Date.now() - 14 * 60 * 1000);
    const client = new FakeClient({
        counts: { login_ip_email: { count: 6, oldest } },
    });
    const fakePool = { connect: async () => client, query: async () => ({ rows: [] }) };
    const outcome = await attemptReservation(fakePool, "login_ip_email",
        keyFor("login_ip_email", ["203.0.113.9", "user@example.com"]));
    assert.equal(outcome.allowed, false);
    assert.ok(outcome.retryAfter >= 59 && outcome.retryAfter <= 60,
        `retry-after must be ~60s, got ${outcome.retryAfter}`);
    assert.ok(client.queries.some((query) => query.sql === "ROLLBACK"));
    assert.ok(!client.queries.some((query) => query.sql === "COMMIT"));
});

test("reservation store failure rolls back, releases, and propagates", async () => {
    const client = new FakeClient({ failOn: "INSERT INTO rate_limit_attempts" });
    const fakePool = { connect: async () => client, query: async () => ({ rows: [] }) };
    await assert.rejects(
        attemptReservation(fakePool, "login_ip_email",
            keyFor("login_ip_email", ["203.0.113.9", "user@example.com"])),
        /Synthetic query failure/,
    );
    assert.ok(client.queries.some((query) => query.sql === "ROLLBACK"));
    assert.equal(client.released, 1);
});

test("release deletes each reservation and swallows delete failures", async () => {
    const deleted = [];
    const fakePool = {
        query: async (sql, params) => {
            deleted.push(params[0]);
            return { rows: [] };
        },
    };
    await releaseReservations(fakePool, [{ id: "a" }, { id: "b" }]);
    assert.deepEqual(deleted, ["a", "b"]);
    const failingPool = { query: async () => { throw new Error("gone"); } };
    await releaseReservations(failingPool, [{ id: "a" }]);
});

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

function mockPoolForMiddleware(client) {
    const poolQueries = [];
    const connectMock = test.mock.method(pool, "connect", async () => client);
    const queryMock = test.mock.method(pool, "query", async (sql, params) => {
        poolQueries.push({ sql, params });
        return { rows: [] };
    });
    return {
        poolQueries,
        restore() {
            connectMock.mock.restore();
            queryMock.mock.restore();
        },
    };
}

test("middleware fails closed on a missing secret and on a missing address", async () => {
    const saved = process.env.RATE_LIMIT_KEY_SECRET;
    delete process.env.RATE_LIMIT_KEY_SECRET;
    try {
        const middleware = createRateLimitMiddleware(
            [{ policy: "login_ip_email", fields: (req, ip) => [ip, req.validated.email] }], "login");
        const res = fakeResponse();
        await middleware({ ip: "203.0.113.9", validated: { email: "a@example.com" } }, res, () => {
            throw new Error("must not proceed without a secret");
        });
        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: "Something went wrong.", code: "INTERNAL_ERROR" });
    } finally {
        process.env.RATE_LIMIT_KEY_SECRET = saved;
    }

    const client = new FakeClient();
    const { restore } = mockPoolForMiddleware(client);
    try {
        const middleware = createRateLimitMiddleware(
            [{ policy: "login_ip_email", fields: (req, ip) => [ip, req.validated.email] }], "login");
        const res = fakeResponse();
        await middleware({ validated: { email: "a@example.com" } }, res, () => {
            throw new Error("must not proceed without an address");
        });
        assert.equal(res.statusCode, 500);
    } finally {
        restore();
    }
});

test("middleware fails closed with the endpoint's generic 500 on store failure", async () => {
    const connectMock = test.mock.method(pool, "connect", async () => {
        throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
    });
    try {
        const login = createRateLimitMiddleware(
            [{ policy: "login_ip_email", fields: (req, ip) => [ip, req.validated.email] }], "login");
        const loginRes = fakeResponse();
        await login({ ip: "203.0.113.9", validated: { email: "a@example.com" } }, loginRes, () => {
            throw new Error("must not proceed when the store is down");
        });
        assert.equal(loginRes.statusCode, 500);
        assert.deepEqual(loginRes.body, { error: "Something went wrong.", code: "INTERNAL_ERROR" });

        const register = createRateLimitMiddleware(
            [{ policy: "register_ip", fields: (req, ip) => [ip] }], "register");
        const registerRes = fakeResponse();
        await register({ ip: "203.0.113.9" }, registerRes, () => {
            throw new Error("must not proceed when the store is down");
        });
        assert.equal(registerRes.statusCode, 500);
        assert.deepEqual(registerRes.body, { error: "Can not create an account.", code: "INTERNAL_ERROR" });
    } finally {
        connectMock.mock.restore();
    }
});

test("middleware blocks with a generic 429 and releases earlier reservations", async () => {
    const client = new FakeClient({
        counts: {
            login_ip_email: { count: 0, oldest: null },
            login_ip: { count: 31, oldest: new Date(Date.now() - 60_000) },
        },
    });
    const { poolQueries, restore } = mockPoolForMiddleware(client);
    try {
        const middleware = createRateLimitMiddleware([
            { policy: "login_ip_email", fields: (req, ip) => [ip, req.validated.email] },
            { policy: "login_ip", fields: (req, ip) => [ip] },
        ], "login");
        const res = fakeResponse();
        let proceeded = false;
        await middleware({ ip: "203.0.113.9", validated: { email: "a@example.com" } }, res, () => {
            proceeded = true;
        });
        assert.equal(proceeded, false);
        assert.equal(res.statusCode, 429);
        assert.deepEqual(res.body, RATE_LIMITED_BODY);
        assert.ok(!JSON.stringify(res.body).includes("login_ip"), "the body names no policy");
        const retryAfter = Number(res.headers["Retry-After"]);
        assert.ok(Number.isInteger(retryAfter) && retryAfter >= 839 && retryAfter <= 840);
        const deletes = poolQueries.filter((query) => query.sql.includes("DELETE FROM rate_limit_attempts"));
        assert.equal(deletes.length, 1, "the earlier reservation is released, not kept");
        assert.equal(deletes[0].params[0], "res-1");
    } finally {
        restore();
    }
});

test("middleware returns the longest wait when both login policies block, consuming neither quota", async () => {
    const now = Date.now();
    const client = new FakeClient({
        counts: {
            // Post-insert counts: both over their limits, with different
            // oldest attempts, so the two policies imply different waits.
            login_ip_email: { count: 6, oldest: new Date(now - 14 * 60 * 1000) },
            login_ip: { count: 31, oldest: new Date(now - 5 * 60 * 1000) },
        },
    });
    const { poolQueries, restore } = mockPoolForMiddleware(client);
    try {
        const middleware = createRateLimitMiddleware([
            { policy: "login_ip_email", fields: (req, ip) => [ip, req.validated.email] },
            { policy: "login_ip", fields: (req, ip) => [ip] },
        ], "login");
        const res = fakeResponse();
        let proceeded = false;
        await middleware({ ip: "203.0.113.9", validated: { email: "a@example.com" } }, res, () => {
            proceeded = true;
        });
        assert.equal(proceeded, false);
        assert.equal(res.statusCode, 429);
        assert.deepEqual(res.body, RATE_LIMITED_BODY);
        // The email policy implies ~60s, the IP policy ~600s: the header
        // must be the longest wait, not the first policy's.
        const retryAfter = Number(res.headers["Retry-After"]);
        assert.ok(Number.isInteger(retryAfter) && retryAfter >= 599 && retryAfter <= 600);
        // Neither quota is consumed or extended: both inserts rolled back,
        // neither committed, and no release DELETE ran for either.
        const statements = client.queries.map((query) => query.sql);
        assert.equal(statements.filter((sql) => sql === "COMMIT").length, 0);
        assert.equal(statements.filter((sql) => sql === "ROLLBACK").length, 2);
        assert.equal(client.inserted.length, 2);
        const deletes = poolQueries.filter((query) => query.sql.includes("DELETE FROM rate_limit_attempts"));
        assert.equal(deletes.length, 0);
    } finally {
        restore();
    }
});

test("middleware allows, attaches finalize, and finalize is idempotent", async () => {
    const client = new FakeClient();
    const { poolQueries, restore } = mockPoolForMiddleware(client);
    try {
        const middleware = createRateLimitMiddleware([
            { policy: "login_ip_email", fields: (req, ip) => [ip, req.validated.email] },
        ], "login");
        const req = { ip: "203.0.113.9", validated: { email: "a@example.com" } };
        const res = fakeResponse();
        let proceeded = false;
        await middleware(req, res, () => { proceeded = true; });
        assert.equal(proceeded, true);
        assert.ok(req.rateLimit, "the reservation handle is attached");
        assert.equal(req.rateLimit.isFinalized(), false);
        await req.rateLimit.finalize("release");
        assert.equal(req.rateLimit.isFinalized(), true);
        await req.rateLimit.finalize("release");
        const deletes = poolQueries.filter((query) => query.sql.includes("DELETE FROM rate_limit_attempts"));
        assert.equal(deletes.length, 1, "finalize runs exactly once");
        assert.equal(deletes[0].params[0], "res-1");
    } finally {
        restore();
    }
});

test("middleware count finalization keeps the reservation row", async () => {
    const client = new FakeClient();
    const { poolQueries, restore } = mockPoolForMiddleware(client);
    try {
        const middleware = createRateLimitMiddleware([
            { policy: "register_ip", fields: (req, ip) => [ip] },
        ], "register");
        const req = { ip: "203.0.113.9" };
        await middleware(req, fakeResponse(), () => {});
        await req.rateLimit.finalize("count");
        const deletes = poolQueries.filter((query) => query.sql.includes("DELETE FROM rate_limit_attempts"));
        assert.equal(deletes.length, 0, "a counted failure keeps its row");
    } finally {
        restore();
    }
});

// ---------------------------------------------------------------------------
// Trust proxy integration through Express: req.ip must follow the
// configured trust proxy setting, since the limiter keys on req.ip.
// ---------------------------------------------------------------------------

async function runTrustProxyApp(trustProxyValue, forwardedForValues) {
    const seenKeys = [];
    const client = new FakeClient();
    const originalQuery = client.query.bind(client);
    client.query = async (sql, params) => {
        if (typeof sql === "string" && sql.includes("INSERT INTO rate_limit_attempts")) {
            seenKeys.push(params[0].toString("hex"));
        }
        return originalQuery(sql, params);
    };
    const connectMock = test.mock.method(pool, "connect", async () => client);
    const queryMock = test.mock.method(pool, "query", async () => ({ rows: [] }));
    const app = express();
    app.set("trust proxy", trustProxyValue);
    app.use(express.json());
    const middleware = createRateLimitMiddleware(
        [{ policy: "login_ip_email", fields: (req, ip) => [ip, req.body.email] }], "login");
    app.post("/t", middleware, (req, res) => res.json({ ip: req.ip }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
        for (const forwardedFor of forwardedForValues) {
            const response = await fetch(`${baseUrl}/t`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": forwardedFor,
                    Connection: "close",
                },
                body: JSON.stringify({ email: "user@example.com" }),
            });
            assert.equal(response.status, 200);
        }
    } finally {
        if (server.closeAllConnections) {
            server.closeAllConnections();
        }
        await new Promise((resolve) => server.close(resolve));
        connectMock.mock.restore();
        queryMock.mock.restore();
    }
    return seenKeys;
}

test("with trust proxy enabled, forwarded addresses key separate buckets", async () => {
    const keys = await runTrustProxyApp(1, ["203.0.113.7", "198.51.100.8"]);
    assert.equal(keys.length, 2);
    assert.notEqual(keys[0], keys[1]);
});

test("with trust proxy disabled, forwarded headers are ignored", async () => {
    const keys = await runTrustProxyApp(false, ["203.0.113.7", "198.51.100.8"]);
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1], "both requests key on the loopback socket address");
});

test("the exported policy table matches the approved limits", () => {
    assert.deepEqual(POLICIES.login_ip_email, { windowMs: 15 * 60 * 1000, limit: 5 });
    assert.deepEqual(POLICIES.login_ip, { windowMs: 15 * 60 * 1000, limit: 30 });
    assert.deepEqual(POLICIES.register_ip, { windowMs: 60 * 60 * 1000, limit: 5 });
});
