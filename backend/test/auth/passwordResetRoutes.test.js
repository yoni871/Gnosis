const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const bcrypt = require("bcrypt");
const crypto = require("node:crypto");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = "synthetic-test-jwt-secret";
process.env.RATE_LIMIT_KEY_SECRET = "synthetic-test-rate-limit-secret";
// Issue #9: app.js validates email configuration at import time.
process.env.RESEND_API_KEY = "synthetic-test-resend-key";
process.env.EMAIL_FROM = "Gnosis Test <test@example.invalid>";
process.env.FRONTEND_URL = "https://frontend.example.invalid";

const app = require("../../src/app");
const pool = require("../../src/db/db");

let queryBehavior = async () => {
    throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
};
let clientBehavior = async () => {
    throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
};
let handlerClientCalls = 0;
let allClientQueries = [];
const queryMock = test.mock.method(pool, "query", (...args) => {
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
            allClientQueries.push(typeof sql === "string" ? sql : "");
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
            handlerClientCalls += 1;
            return clientBehavior(...args);
        },
        release: () => {},
    };
}
const connectMock = test.mock.method(pool, "connect", async () => fakeClient());

let server;
let baseUrl;
let stubServer;
let stubEmails;
let stubMode;

test.before(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    // Loopback delivery stub, honored only under test isolation, so no
    // test ever calls the real Resend API.
    stubEmails = [];
    stubMode = "ok";
    stubServer = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
            stubEmails.push({ url: req.url, body });
            if (stubMode === "fail") {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end("{}");
            } else {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end("{}");
            }
        });
    });
    await new Promise((resolve) => stubServer.listen(0, "127.0.0.1", resolve));
    process.env.RESEND_API_BASE_URL = `http://127.0.0.1:${stubServer.address().port}`;
});

test.after(async () => {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (stubServer) await new Promise((resolve) => stubServer.close(resolve));
    delete process.env.RESEND_API_BASE_URL;
    queryMock.mock.restore();
    connectMock.mock.restore();
    await pool.end();
});

async function post(path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    return { response, json: text ? JSON.parse(text) : null, text };
}

function resetBehaviors() {
    queryBehavior = async () => {
        throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
    };
    clientBehavior = async () => {
        throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
    };
    handlerClientCalls = 0;
    allClientQueries = [];
    stubEmails.length = 0;
    stubMode = "ok";
}

const GENERIC_FORGOT = {
    message: "If there is an account for this email, a password reset link has been sent.",
};
const GENERIC_RESET = {
    error: "Invalid or expired password reset link.",
    code: "INVALID_RESET_LINK",
};

async function postRaw(path, rawBody) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: rawBody,
    });
    const text = await response.text();
    return { response, json: text ? JSON.parse(text) : null, text };
}

test("forgot rejects invalid input before the limiter and database", async () => {
    resetBehaviors();
    const beforeQuery = queryMock.mock.calls.length;
    const beforeConnect = connectMock.mock.calls.length;
    for (const body of [{ email: "not-an-email" }, { email: "" }]) {
        const result = await post("/api/auth/forgot-password", body);
        assert.equal(result.response.status, 400);
        assert.equal(result.json.code, "VALIDATION_FAILED");
    }
    // A JSON array body is well-formed JSON but not an object.
    const raw = await postRaw("/api/auth/forgot-password", "[1, 2]");
    assert.equal(raw.response.status, 400);
    assert.equal(raw.json.code, "VALIDATION_FAILED");
    assert.equal(queryMock.mock.calls.length, beforeQuery, "invalid forgot must cause zero database calls");
    assert.equal(connectMock.mock.calls.length, beforeConnect, "invalid forgot must cause zero checkouts");
});

test("forgot returns the generic body for unknown and unverified addresses", async () => {
    resetBehaviors();
    queryBehavior = async () => ({ rows: [] });
    const unknown = await post("/api/auth/forgot-password", { email: "nobody@example.com" });
    assert.equal(unknown.response.status, 200);
    assert.deepEqual(unknown.json, GENERIC_FORGOT);
    queryBehavior = async () => ({ rows: [{ id: 9, email_verified_at: null }] });
    const unverified = await post("/api/auth/forgot-password", { email: "new@example.com" });
    assert.equal(unverified.response.status, 200);
    assert.deepEqual(unverified.json, GENERIC_FORGOT);
    assert.equal(handlerClientCalls, 0, "no transaction may run for unknown or unverified addresses");
    assert.equal(stubEmails.length, 0, "no email may send for unknown or unverified addresses");
});

test("forgot for a verified address supersedes and sends a hashed reset link", async () => {
    resetBehaviors();
    queryBehavior = async () => ({ rows: [{ id: 5, email_verified_at: new Date() }] });
    const clientQueries = [];
    let tokenParams;
    clientBehavior = async (...args) => {
        clientQueries.push(args[0]);
        if (/FOR UPDATE/.test(args[0]) && /FROM users/.test(args[0])) {
            return { rows: [{ email_verified_at: new Date() }] };
        }
        if (/SELECT id FROM password_reset_tokens/.test(args[0])) {
            return { rows: [{ id: "00000000-0000-0000-0000-000000000001" }] };
        }
        if (/INSERT INTO password_reset_tokens/.test(args[0])) {
            tokenParams = args[1];
            return { rows: [] };
        }
        return { rows: [] };
    };
    const result = await post("/api/auth/forgot-password", { email: "old@example.com" });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.json, GENERIC_FORGOT);
    assert.ok(clientQueries.some((sql) => /consumed_reason = 'superseded'/.test(sql)), "old tokens must supersede");
    assert.ok(clientQueries.some((sql) => /INSERT INTO password_reset_tokens/.test(sql)), "a fresh token must insert");
    assert.equal(stubEmails.length, 1);
    const body = JSON.parse(stubEmails[0].body);
    assert.equal(body.from, "Gnosis Test <test@example.invalid>");
    assert.equal(body.to, "old@example.com");
    assert.equal(body.subject, "Reset your Gnosis password");
    const match = body.html.match(/reset-password#token=([A-Za-z0-9_-]{43})/);
    assert.ok(match, "the email must carry a fragment reset link");
    assert.ok(body.text.includes(match[0]), "the text body must carry the same link");
    assert.equal(tokenParams[0], 5);
    assert.deepEqual(
        tokenParams[1],
        crypto.createHash("sha256").update(match[1], "utf8").digest(),
        "the stored value must be the link token's hash, never the token"
    );
    const expiresAt = new Date(tokenParams[2]).getTime();
    const oneHour = 60 * 60 * 1000;
    assert.ok(Math.abs(expiresAt - (Date.now() + oneHour)) < 60 * 1000, "the token must expire in about 1 hour");
});

test("forgot still returns the generic body when the provider is down", async () => {
    resetBehaviors();
    stubMode = "fail";
    queryBehavior = async () => ({ rows: [{ id: 5, email_verified_at: new Date() }] });
    clientBehavior = async (...args) => {
        if (/FOR UPDATE/.test(args[0]) && /FROM users/.test(args[0])) {
            return { rows: [{ email_verified_at: new Date() }] };
        }
        if (/SELECT id FROM password_reset_tokens/.test(args[0])) {
            return { rows: [] };
        }
        return { rows: [] };
    };
    const result = await post("/api/auth/forgot-password", { email: "old@example.com" });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.json, GENERIC_FORGOT);
    assert.equal(stubEmails.length, 1, "the attempt was made; the failure changed nothing");
});

test("reset rejects malformed tokens and short passwords before the limiter and database", async () => {
    resetBehaviors();
    const beforeQuery = queryMock.mock.calls.length;
    const beforeConnect = connectMock.mock.calls.length;
    const validToken = "a".repeat(43);
    for (const body of [
        { token: "short", password: "a-valid-password" },
        { token: 42, password: "a-valid-password" },
        { token: validToken, password: "short" },
        { token: validToken, password: "" },
    ]) {
        const result = await post("/api/auth/reset-password", body);
        assert.equal(result.response.status, 400);
        assert.equal(result.json.code, "VALIDATION_FAILED");
    }
    assert.equal(queryMock.mock.calls.length, beforeQuery, "invalid reset must cause zero database calls");
    assert.equal(connectMock.mock.calls.length, beforeConnect, "invalid reset must cause zero checkouts");
});

test("reset returns the generic body for unknown, superseded, expired, and used tokens", async () => {
    resetBehaviors();
    const token = "d".repeat(43);
    queryBehavior = async () => ({ rows: [] });
    const unknown = await post("/api/auth/reset-password", { token, password: "a-new-password" });
    assert.equal(unknown.response.status, 400);
    assert.deepEqual(unknown.json, GENERIC_RESET);

    const expired = new Date(Date.now() - 60 * 1000);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    for (const row of [
        { consumed_reason: "superseded", expires_at: future },
        { consumed_reason: "used", expires_at: future },
        { consumed_reason: null, expires_at: expired },
    ]) {
        queryBehavior = async () => ({
            rows: [{ id: "00000000-0000-0000-0000-000000000002", user_id: 5, ...row }],
        });
        clientBehavior = async (...args) => {
            if (/FROM users/.test(args[0])) return { rows: [{ id: 5 }] };
            if (/FROM password_reset_tokens/.test(args[0])) {
                return { rows: [{ id: "00000000-0000-0000-0000-000000000002", ...row }] };
            }
            return { rows: [] };
        };
        const result = await post("/api/auth/reset-password", { token, password: "a-new-password" });
        assert.equal(result.response.status, 400);
        assert.deepEqual(result.json, GENERIC_RESET);
    }
});

test("reset succeeds for a valid token, updates the password, and cannot be replayed", async () => {
    resetBehaviors();
    const token = "e".repeat(43);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    queryBehavior = async () => ({
        rows: [{ id: "00000000-0000-0000-0000-000000000003", user_id: 5, expires_at: future, used_at: null, consumed_reason: null }],
    });
    let state = "unused";
    let passwordParams;
    const clientQueries = [];
    clientBehavior = async (...args) => {
        clientQueries.push(args[0]);
        if (/FROM users/.test(args[0])) {
            return { rows: [{ id: 5 }] };
        }
        if (/FROM password_reset_tokens/.test(args[0])) {
            return {
                rows: [{
                    id: "00000000-0000-0000-0000-000000000003",
                    expires_at: future,
                    used_at: state === "used" ? new Date() : null,
                    consumed_reason: state === "used" ? "used" : null,
                }],
            };
        }
        if (/UPDATE users SET password_hash/.test(args[0])) {
            passwordParams = args[1];
            state = "used";
            return { rows: [] };
        }
        return { rows: [] };
    };
    const first = await post("/api/auth/reset-password", { token, password: "a-new-password" });
    assert.equal(first.response.status, 200);
    assert.deepEqual(first.json, { reset: true });
    assert.ok(clientQueries.some((sql) => /UPDATE users SET password_hash/.test(sql)));
    assert.ok(clientQueries.some((sql) => /consumed_reason = 'used'/.test(sql)));
    assert.ok(clientQueries.some((sql) => /consumed_reason = 'superseded'/.test(sql)),
        "other unused tokens for the account must supersede");
    assert.equal(passwordParams[1], 5);
    assert.equal(await bcrypt.compare("a-new-password", passwordParams[0]), true,
        "the stored hash must match the new password");
    assert.equal(await bcrypt.compare("the-old-password", passwordParams[0]), false,
        "the stored hash must not match the old password");
    clientQueries.length = 0;
    const replay = await post("/api/auth/reset-password", { token, password: "another-password" });
    assert.equal(replay.response.status, 400);
    assert.deepEqual(replay.json, GENERIC_RESET);
    assert.ok(!clientQueries.some((sql) => sql.trim().startsWith("UPDATE")), "a replay must write nothing");
});

test("reset and forgot database failures are controlled 500s", async () => {
    resetBehaviors();
    const token = "f".repeat(43);
    const failed = await post("/api/auth/reset-password", { token, password: "a-new-password" });
    assert.equal(failed.response.status, 500);
    assert.deepEqual(failed.json, { error: "Something went wrong.", code: "INTERNAL_ERROR" });
    const forgot = await post("/api/auth/forgot-password", { email: "old@example.com" });
    assert.equal(forgot.response.status, 500);
    assert.deepEqual(forgot.json, { error: "Something went wrong.", code: "INTERNAL_ERROR" });
});
