const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = "test-secret-for-login-migration-tests";
process.env.RATE_LIMIT_KEY_SECRET = "test-secret-for-rate-limit-tests";
// Issue #9: app.js validates email configuration at import time.
process.env.RESEND_API_KEY = "synthetic-test-resend-key";
process.env.EMAIL_FROM = "Gnosis Test <test@example.invalid>";
process.env.FRONTEND_URL = "https://frontend.example.invalid";

const app = require("../../src/app");
const pool = require("../../src/db/db");
const { verifyPassword } = require("../../src/utils/passwordHash");

const PASSWORD = "correct-password";

// The mock delegates to a per-test behavior so each test controls what
// the "database" does. The limiter's own SQL is answered in memory
// (advisory lock always acquired, count always below every limit), so
// valid requests pass the limiter and reach the handler under test.
let queryBehavior = async () => {
    throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
};
const queryMock = test.mock.method(pool, "query", (...args) => {
    if (typeof args[0] === "string" && args[0].includes("rate_limit_attempts")) {
        return Promise.resolve({ rows: [] });
    }
    return queryBehavior(...args);
});
function fakeClient() {
    return {
        query: async (...args) => {
            const sql = args[0];
            if (typeof sql === "string" && sql.includes("pg_advisory_xact_lock")) {
                return { rows: [{ pg_advisory_xact_lock: true }] };
            }
            if (typeof sql === "string" && sql.includes("INSERT INTO rate_limit_attempts")) {
                return { rows: [{ id: "limiter-1" }] };
            }
            if (typeof sql === "string" && sql.includes("DELETE FROM rate_limit_attempts")) {
                return { rows: [], rowCount: 0 };
            }
            if (typeof sql === "string" && sql.includes("FROM rate_limit_attempts")) {
                return { rows: [{ count: 0, oldest: null }] };
            }
            if (typeof sql === "string" && sql.includes("pg_try_advisory_xact_lock")) {
                return { rows: [{ locked: true }] };
            }
            if (typeof sql === "string" && sql.includes("rate_limit_sweep_state")) {
                return { rows: [{ last_swept_at: new Date(0) }] };
            }
            if (typeof sql === "string" && /^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) {
                return { rows: [] };
            }
            return queryBehavior(...args);
        },
        release: () => {},
    };
}
const connectMock = test.mock.method(pool, "connect", async () => fakeClient());

let server;
let baseUrl;

test.before(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (server.closeAllConnections) {
        server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
    queryMock.mock.restore();
    connectMock.mock.restore();
    await pool.end();
});

async function login(email, password) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify({ email, password }),
    });
    const text = await response.text();
    return { response, json: text ? JSON.parse(text) : null };
}

// The "database" for one login test: the user row the handler reads, the
// hash createSession's recheck sees, and a capture of every UPDATE of
// the stored hash. `recheckHash` defaults to the seeded hash; tests
// override it to simulate a password change landing mid-login.
function useUser({ storedHash, recheckHash = storedHash, onUpdate } = {}) {
    const updates = [];
    queryBehavior = async (...args) => {
        const sql = args[0];
        if (typeof sql === "string" && sql.includes("SELECT * FROM users")) {
            return {
                rows: [{
                    id: 42,
                    password_hash: storedHash,
                    email_verified_at: new Date(),
                }],
            };
        }
        if (typeof sql === "string" && sql.includes("SELECT password_hash FROM users")) {
            return { rows: [{ password_hash: recheckHash }] };
        }
        if (typeof sql === "string" && sql.includes("UPDATE users SET password_hash")) {
            updates.push(args);
            if (onUpdate) return onUpdate(...args);
            return { rows: [], rowCount: 1 };
        }
        return { rows: [] };
    };
    return updates;
}

test("a successful bcrypt login migrates the stored hash to Argon2id", async () => {
    const storedHash = await bcrypt.hash(PASSWORD, 10);
    const updates = useUser({ storedHash });
    const result = await login("test@example.com", PASSWORD);
    assert.equal(result.response.status, 200);
    assert.equal(typeof result.json.token, "string");
    assert.equal(jwt.verify(result.json.token, process.env.JWT_SECRET).userId, 42);
    assert.equal(updates.length, 1, "exactly one migration update must run");
    const [sql, params] = updates[0];
    // Compare-and-swap: the update only applies while the stored hash is
    // still the one login verified, so a concurrent reset wins instead.
    assert.match(sql, /UPDATE users SET password_hash = \$1 WHERE id = \$2 AND password_hash = \$3/);
    assert.equal(params[1], 42);
    assert.equal(params[2], storedHash);
    assert.match(params[0], /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    assert.equal(await verifyPassword(PASSWORD, params[0]), true);
    assert.equal(await verifyPassword("wrong-password", params[0]), false);
});

test("a successful bcrypt cost-12 login migrates too", async () => {
    const storedHash = await bcrypt.hash(PASSWORD, 12);
    const updates = useUser({ storedHash });
    const result = await login("test@example.com", PASSWORD);
    assert.equal(result.response.status, 200);
    assert.equal(updates.length, 1);
    assert.match(updates[0][1][0], /^\$argon2id\$/);
});

test("an Argon2id login does not re-migrate", async () => {
    const { hashPassword } = require("../../src/utils/passwordHash");
    const storedHash = await hashPassword(PASSWORD);
    const updates = useUser({ storedHash });
    const result = await login("test@example.com", PASSWORD);
    assert.equal(result.response.status, 200);
    assert.equal(updates.length, 0, "an Argon2id hash is already migrated");
});

test("a failed login migrates nothing", async () => {
    const storedHash = await bcrypt.hash(PASSWORD, 10);
    const updates = useUser({ storedHash });
    const result = await login("test@example.com", "wrong-password");
    assert.equal(result.response.status, 401);
    assert.deepEqual(result.json, { error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
    assert.equal(updates.length, 0);
});

test("a failed migration write does not fail the login", async () => {
    const storedHash = await bcrypt.hash(PASSWORD, 10);
    const updates = useUser({
        storedHash,
        onUpdate: async () => {
            throw Object.assign(new Error("Synthetic migration failure"), { code: "ECONNREFUSED" });
        },
    });
    const result = await login("test@example.com", PASSWORD);
    assert.equal(result.response.status, 200, "the login still succeeds");
    assert.equal(typeof result.json.token, "string");
    assert.equal(updates.length, 1, "the migration was attempted");
});

test("a stored hash in neither format fails closed with 401", async () => {
    const updates = useUser({ storedHash: "synthetic-hash" });
    const result = await login("test@example.com", PASSWORD);
    assert.equal(result.response.status, 401);
    assert.deepEqual(result.json, { error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
    assert.equal(updates.length, 0);
});

test("a hash changed after comparison issues no session and migrates nothing", async () => {
    // A reset landing between verification and session issuance: the
    // createSession recheck sees the new hash, returns no session, and
    // the login fails before any migration runs, so the new password is
    // never clobbered by a hash of the old one.
    const storedHash = await bcrypt.hash(PASSWORD, 10);
    const updates = useUser({ storedHash, recheckHash: "changed-by-reset" });
    const result = await login("test@example.com", PASSWORD);
    assert.equal(result.response.status, 401);
    assert.deepEqual(result.json, { error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
    assert.equal(result.response.headers.get("set-cookie"), null);
    assert.equal(updates.length, 0);
});
