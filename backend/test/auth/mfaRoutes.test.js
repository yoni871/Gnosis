const test = require("node:test");
const assert = require("node:assert/strict");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = "synthetic-test-jwt-secret-synthetic-test-jwt-secret";
process.env.RATE_LIMIT_KEY_SECRET = "synthetic-test-rate-limit-secret-synthetic-test";
// No MFA_ENCRYPTION_KEY here on purpose: the fail-closed tests below
// assert enrollment and verification refuse without it.
delete process.env.MFA_ENCRYPTION_KEY;
// Issue #9: app.js validates email configuration at import time.
process.env.RESEND_API_KEY = "synthetic-test-resend-key";
process.env.EMAIL_FROM = "Gnosis Test <test@example.invalid>";
process.env.FRONTEND_URL = "https://frontend.example.invalid";

const app = require("../../src/app");
const pool = require("../../src/db/db");
const mfaService = require("../../src/services/mfaService");

// Reject queries by default: no real database connection is attempted.
// Individual tests replace queryBehavior to answer the exact SELECTs
// their route performs before the fail-closed key check.
let queryBehavior = async () => {
    throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
};
const queryMock = test.mock.method(pool, "query", async (...args) => queryBehavior(...args));
// The /enroll rate limiter (and the cleanup sweep) use pool.connect, so
// the fake client answers the limiter's own queries: BEGIN/COMMIT,
// the advisory lock, the reservation INSERT, and the count. The
// sweep finds no sweep-state row and skips. Any other query throws,
// so a route reaching the database unexpectedly is still caught.
const connectMock = test.mock.method(pool, "connect", async () => {
    return {
        query: async (sql) => {
            if (typeof sql === "string" && (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK")) {
                return { rows: [] };
            }
            if (typeof sql === "string" && sql.includes("pg_try_advisory_xact_lock")) {
                return { rows: [{ locked: true }] };
            }
            if (typeof sql === "string" && sql.includes("INSERT INTO rate_limit_attempts")) {
                return { rows: [{ id: 1 }] };
            }
            if (typeof sql === "string" && sql.includes("FROM rate_limit_attempts")) {
                return { rows: [{ count: 1, oldest: new Date() }] };
            }
            if (typeof sql === "string" && sql.includes("FROM rate_limit_sweep_state")) {
                return { rows: [] };
            }
            throw new Error(`Unexpected connect query in MFA test: ${sql}`);
        },
        release: () => {},
    };
});

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

test.beforeEach(() => {
    queryBehavior = async () => {
        throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
    };
});

async function request(path, options = {}) {
    const { headers, ...rest } = options;
    const response = await fetch(`${baseUrl}${path}`, {
        ...rest,
        headers: { Connection: "close", ...headers },
    });
    const text = await response.text();
    return {
        response,
        text,
        json: text ? JSON.parse(text) : null,
    };
}

function post(path, body, headers = {}) {
    return request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
    });
}

test("MFA endpoints require authentication", async () => {
    for (const [path, body] of [
        ["/api/auth/mfa/status", null],
        ["/api/auth/mfa/enroll", {}],
        ["/api/auth/mfa/enroll/confirm", { code: "123456" }],
        ["/api/auth/mfa/recovery-codes/regenerate", { password: "x", code: "123456" }],
        ["/api/auth/mfa/disable", { password: "x", code: "123456" }],
    ]) {
        const result = body === null
            ? await request(path)
            : await post(path, body);
        assert.equal(result.response.status, 401, path);
        assert.deepEqual(result.json, { error: "Access token required.", code: "TOKEN_REQUIRED" });
    }
});

test("verify rejects malformed challenges and codes before any database work", async () => {
    for (const body of [
        { challenge: "short", code: "123456" },
        { challenge: "a".repeat(43), code: "12345" },
        { challenge: "a".repeat(43), code: "not-a-code" },
        { challenge: "a".repeat(43) },
        { code: "123456" },
        {},
    ]) {
        const result = await post("/api/auth/mfa/verify", body);
        assert.equal(result.response.status, 400, JSON.stringify(body));
        assert.equal(result.json.code, "VALIDATION_FAILED");
        assert.ok(!result.text.includes("SELECT"), result.text);
    }
});

test("enrollment fails closed with 503 when the encryption key is absent", async () => {
    // authenticateToken only needs a session row, so answer the
    // session lookup as well as the route's own SELECTs.
    queryBehavior = async (sql) => {
        if (typeof sql === "string" && sql.includes("FROM auth_sessions")) {
            return { rows: [{ id: "00000000-0000-4000-8000-000000000001" }] };
        }
        if (typeof sql === "string" && sql.includes("SELECT email FROM users")) {
            return { rows: [{ email: "reader@example.invalid" }] };
        }
        if (typeof sql === "string" && sql.includes("FROM user_mfa")) {
            return { rows: [] };
        }
        throw new Error(`Unexpected query in MFA test: ${sql}`);
    };
    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
        { userId: 7, sid: "00000000-0000-4000-8000-000000000001" },
        process.env.JWT_SECRET,
        { algorithm: "HS256", expiresIn: 900, issuer: "gnosis", audience: "gnosis-api" }
    );
    const result = await post("/api/auth/mfa/enroll", {}, { Authorization: `Bearer ${token}` });
    assert.equal(result.response.status, 503);
    assert.deepEqual(result.json, {
        error: "Two-factor authentication is unavailable right now. Please try again later.",
        code: "MFA_UNAVAILABLE",
    });
    assert.ok(!result.text.includes("MFA_ENCRYPTION_KEY"), result.text);
});

test("service calls fail closed before touching the database without a key", async () => {
    const failingPool = {
        query: async () => { throw new Error("must not be called"); },
        connect: async () => { throw new Error("must not be called"); },
    };
    await assert.rejects(
        mfaService.startEnrollment(failingPool, 7, "reader@example.invalid"),
        (error) => error instanceof mfaService.MfaUnavailableError);
    await assert.rejects(
        mfaService.confirmEnrollment(failingPool, 7, "123456"),
        (error) => error instanceof mfaService.MfaUnavailableError);
    await assert.rejects(
        mfaService.verifyMfaChallenge(failingPool, "a".repeat(43), "123456"),
        (error) => error instanceof mfaService.MfaUnavailableError);
    await assert.rejects(
        mfaService.regenerateRecoveryCodes(failingPool, 7, "password", "123456"),
        (error) => error instanceof mfaService.MfaUnavailableError);
    await assert.rejects(
        mfaService.disableMfa(failingPool, 7, "password", "123456"),
        (error) => error instanceof mfaService.MfaUnavailableError);
});
