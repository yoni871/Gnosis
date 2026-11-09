const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = "synthetic-test-jwt-secret";
process.env.RATE_LIMIT_KEY_SECRET = "synthetic-test-rate-limit-secret";
// Issue #9: app.js validates email configuration at import time.
process.env.RESEND_API_KEY = "synthetic-test-resend-key";
process.env.EMAIL_FROM = 'Gnosis Test <test@example.invalid>';
process.env.FRONTEND_URL = "https://frontend.example.invalid";

const app = require("../../src/app");
const pool = require("../../src/db/db");

// Session management (T2.5): route tests with the pool mocked in
// memory, following the passwordResetRoutes harness. The fake client
// answers the rate limiter's reservation SQL and the transaction
// framing, so the handler's own queries are the only ones the
// behaviors below need to decide.
const CURRENT_SID = "00000000-0000-4000-8000-000000000001";
const OTHER_SID = "00000000-0000-4000-8000-000000000002";
const USER_ID = 7;
let storedHash;
let queryBehavior = async () => ({ rows: [] });
let clientBehavior = async () => ({ rows: [] });
let queryCalls = [];
let clientCalls = [];
const queryMock = test.mock.method(pool, "query", (...args) => {
    queryCalls.push(args);
    if (typeof args[0] === "string"
        && (args[0].includes("rate_limit_attempts") || args[0].includes("rate_limit_sweep_state"))) {
        return Promise.resolve({ rows: [] });
    }
    return queryBehavior(...args);
});
function fakeClient() {
    return {
        query: async (...args) => {
            const sql = args[0];
            clientCalls.push(args);
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
            return clientBehavior(...args);
        },
        release: () => {},
    };
}
const connectMock = test.mock.method(pool, "connect", async () => fakeClient());

let server;
let baseUrl;

test.before(async () => {
    storedHash = await bcrypt.hash("correct-password", 4);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    queryMock.mock.restore();
    connectMock.mock.restore();
    await pool.end();
});

function tokenFor(userId = USER_ID, sid = CURRENT_SID) {
    return jwt.sign({ userId, sid }, process.env.JWT_SECRET,
        { expiresIn: "15m", issuer: "gnosis", audience: "gnosis-api" });
}

async function request(path, options = {}) {
    const { headers, ...rest } = options;
    const response = await fetch(`${baseUrl}${path}`, {
        ...rest,
        headers: { Connection: "close", ...headers },
    });
    const text = await response.text();
    return { response, json: text ? JSON.parse(text) : null, text };
}

function resetBehaviors() {
    queryCalls = [];
    clientCalls = [];
    queryBehavior = async (sql, args) => {
        // The auth middleware's session revalidation.
        if (typeof sql === "string" && sql.includes("revoked_at IS NULL AND expires_at > now()")) {
            return { rows: [{ id: args[1] === USER_ID ? CURRENT_SID : OTHER_SID }] };
        }
        return { rows: [] };
    };
    clientBehavior = async () => ({ rows: [] });
}

test("sessions list without an authorization header returns 401 JSON", async () => {
    resetBehaviors();
    const result = await request("/api/auth/sessions");
    assert.equal(result.response.status, 401);
    assert.deepEqual(result.json, { error: "Access token required.", code: "TOKEN_REQUIRED" });
});

test("sessions list returns only the caller's sessions, flags the current one, and never selects token material", async () => {
    resetBehaviors();
    const now = new Date();
    const rows = [
        { id: CURRENT_SID, created_at: new Date(now - 3600000), expires_at: new Date(now + 7 * 86400000), revoked_at: null },
        { id: OTHER_SID, created_at: new Date(now - 7200000), expires_at: new Date(now + 6 * 86400000), revoked_at: new Date(now - 60000) },
    ];
    queryBehavior = async (sql, args) => {
        if (typeof sql === "string" && sql.includes("revoked_at IS NULL AND expires_at > now()")) {
            return { rows: [{ id: CURRENT_SID }] };
        }
        if (typeof sql === "string" && sql.includes("FROM auth_sessions")) {
            assert.deepEqual(args, [USER_ID], "the list must be scoped to the caller");
            assert.ok(sql.includes("30 days"), "revoked sessions older than 30 days are excluded");
            return { rows };
        }
        return { rows: [] };
    };
    const result = await request("/api/auth/sessions", {
        headers: { Authorization: `Bearer ${tokenFor()}` },
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get("cache-control"), "private, no-store");
    assert.equal(result.json.sessions.length, 2);
    assert.deepEqual(result.json.sessions[0], {
        id: CURRENT_SID,
        createdAt: rows[0].created_at.toISOString(),
        expiresAt: rows[0].expires_at.toISOString(),
        revokedAt: null,
        current: true,
    });
    assert.equal(result.json.sessions[1].current, false);
    assert.equal(result.json.sessions[1].revokedAt, rows[1].revoked_at.toISOString());
    assert.ok(!JSON.stringify(queryCalls).includes("auth_refresh_tokens"),
        "the list query must never touch refresh-token hashes");
    assert.ok(!JSON.stringify(queryCalls).includes("token_hash"));
});

test("sessions list database failure is a controlled 500", async () => {
    resetBehaviors();
    queryBehavior = async (sql) => {
        if (typeof sql === "string" && sql.includes("revoked_at IS NULL AND expires_at > now()")) {
            return { rows: [{ id: CURRENT_SID }] };
        }
        throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
    };
    const result = await request("/api/auth/sessions", {
        headers: { Authorization: `Bearer ${tokenFor()}` },
    });
    assert.equal(result.response.status, 500);
    assert.deepEqual(result.json, { error: "Something went wrong.", code: "INTERNAL_ERROR" });
});

test("revoking an own session returns 204; revoking another user's session returns 404 and revokes nothing", async () => {
    resetBehaviors();
    queryBehavior = async (sql, args) => {
        if (typeof sql === "string" && sql.includes("revoked_at IS NULL AND expires_at > now()")) {
            return { rows: [{ id: CURRENT_SID }] };
        }
        if (typeof sql === "string" && sql.includes("UPDATE auth_sessions SET revoked_at")) {
            // Only the caller's own session id revokes; any other id
            // matches no row, so the route answers 404.
            return { rows: args[0] === CURRENT_SID && args[1] === USER_ID ? [{ id: CURRENT_SID }] : [] };
        }
        return { rows: [] };
    };
    const own = await request(`/api/auth/sessions/${CURRENT_SID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokenFor()}` },
    });
    assert.equal(own.response.status, 204);
    assert.ok(own.response.headers.get("set-cookie")?.includes("gnosisRefresh=;"),
        "revoking the current session clears the refresh cookie");
    const other = await request(`/api/auth/sessions/${OTHER_SID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokenFor()}` },
    });
    assert.equal(other.response.status, 404);
    assert.deepEqual(other.json, { error: "Session not found.", code: "SESSION_NOT_FOUND" });
    const revokes = queryCalls
        .filter(([sql]) => sql.includes("UPDATE auth_sessions SET revoked_at"))
        .map(([, args]) => args);
    assert.deepEqual(revokes, [[CURRENT_SID, USER_ID], [OTHER_SID, USER_ID]],
        "each revoke is scoped by both session id and user id");
});

test("revoking a malformed session id returns 404 without touching the database", async () => {
    resetBehaviors();
    const result = await request("/api/auth/sessions/not-a-uuid", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokenFor()}` },
    });
    assert.equal(result.response.status, 404);
    assert.deepEqual(result.json, { error: "Session not found.", code: "SESSION_NOT_FOUND" });
    assert.ok(!queryCalls.some(([sql]) => sql.includes("UPDATE auth_sessions")),
        "a malformed id must not reach the revoke query");
});

test("change password with a wrong current password returns 401 and changes nothing", async () => {
    resetBehaviors();
    queryBehavior = async (sql) => {
        if (typeof sql === "string" && sql.includes("revoked_at IS NULL AND expires_at > now()")) {
            return { rows: [{ id: CURRENT_SID }] };
        }
        if (typeof sql === "string" && sql.includes("SELECT password_hash FROM users")) {
            return { rows: [{ password_hash: storedHash }] };
        }
        return { rows: [] };
    };
    const result = await request("/api/auth/change-password", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenFor()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: "wrong-password", newPassword: "a-new-password" }),
    });
    assert.equal(result.response.status, 401);
    assert.deepEqual(result.json, { error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
    assert.ok(!clientCalls.some(([sql]) => sql.includes("UPDATE users")),
        "a failed current-password check must not update the hash");
    assert.ok(!clientCalls.some(([sql]) => sql.includes("UPDATE auth_sessions")),
        "a failed current-password check must not revoke sessions");
});

test("change password success updates the hash and revokes every other session, not the current one", async () => {
    resetBehaviors();
    let updatedHash;
    queryBehavior = async (sql) => {
        if (typeof sql === "string" && sql.includes("revoked_at IS NULL AND expires_at > now()")) {
            return { rows: [{ id: CURRENT_SID }] };
        }
        if (typeof sql === "string" && sql.includes("SELECT password_hash FROM users")) {
            return { rows: [{ password_hash: storedHash }] };
        }
        return { rows: [] };
    };
    clientBehavior = async (sql, args) => {
        if (typeof sql === "string" && sql.includes("SELECT password_hash FROM users")) {
            return { rows: [{ password_hash: storedHash }] };
        }
        if (typeof sql === "string" && sql.includes("UPDATE users SET password_hash")) {
            updatedHash = args[0];
            return { rows: [] };
        }
        if (typeof sql === "string" && sql.includes("UPDATE auth_sessions SET revoked_at")) {
            assert.deepEqual(args, [USER_ID, CURRENT_SID], "other sessions are revoked, the current one is kept");
            return { rows: [] };
        }
        return { rows: [] };
    };
    const result = await request("/api/auth/change-password", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenFor()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: "correct-password", newPassword: "a-new-password" }),
    });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.json, { changed: true });
    assert.equal(await bcrypt.compare("a-new-password", updatedHash), true);
    assert.equal(await bcrypt.compare("correct-password", updatedHash), false);
    assert.ok(clientCalls.some(([sql]) => sql.includes("COMMIT")), "hash update and revocation commit together");
});

test("change password validation failures return 400 without touching the database", async () => {
    resetBehaviors();
    const result = await request("/api/auth/change-password", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenFor()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: "correct-password", newPassword: "short" }),
    });
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.json, { error: "Password must be at least 8 characters.", code: "VALIDATION_FAILED" });
    assert.equal(queryCalls.filter(([sql]) => sql.includes("SELECT password_hash")).length, 0);
});
