const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = "test-secret-for-verification-tests";
process.env.RATE_LIMIT_KEY_SECRET = "test-rate-limit-secret-for-verification";
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
            if (/INSERT INTO auth_(sessions|refresh_tokens)/.test(sql)) return { rows: [] };
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

const GENERIC_RESEND = {
    message: "If there is an unverified account for this email, a new verification link has been sent.",
};
const GENERIC_VERIFY = {
    error: "Invalid or expired verification link.",
    code: "INVALID_VERIFICATION_LINK",
};

test("login gate: correct password for an unverified account returns 403", async () => {
    resetBehaviors();
    const passwordHash = await bcrypt.hash("correct-password", 10);
    queryBehavior = async () => ({
        rows: [{ id: 42, password_hash: passwordHash, email_verified_at: null }],
    });
    const result = await post("/api/auth/login", { email: "new@example.com", password: "correct-password" });
    assert.equal(result.response.status, 403);
    assert.deepEqual(result.json, { error: "Email not verified.", code: "EMAIL_NOT_VERIFIED" });
    assert.equal(result.json.token, undefined);
});

test("login gate: verified account logs in normally", async () => {
    resetBehaviors();
    const passwordHash = await bcrypt.hash("correct-password", 10);
    queryBehavior = async () => ({
        rows: [{ id: 42, password_hash: passwordHash, email_verified_at: new Date() }],
    });
    const result = await post("/api/auth/login", { email: "old@example.com", password: "correct-password" });
    assert.equal(result.response.status, 200);
    assert.equal(jwt.verify(result.json.token, process.env.JWT_SECRET).userId, 42);
});

test("login gate changes nothing for unknown and wrong-password logins", async () => {
    resetBehaviors();
    queryBehavior = async () => ({ rows: [] });
    const unknown = await post("/api/auth/login", { email: "nobody@example.com", password: "whatever-password" });
    assert.equal(unknown.response.status, 401);
    const passwordHash = await bcrypt.hash("correct-password", 10);
    queryBehavior = async () => ({
        rows: [{ id: 42, password_hash: passwordHash, email_verified_at: null }],
    });
    const wrong = await post("/api/auth/login", { email: "new@example.com", password: "wrong-password" });
    assert.equal(wrong.response.status, 401);
    assert.deepEqual(wrong.json, unknown.json);
});

test("register rolls back when the token insert fails", async () => {
    resetBehaviors();
    clientBehavior = async (...args) => {
        if (/INSERT INTO users/.test(args[0])) {
            return { rows: [{ id: 7, first_name: "Test", last_name: "User", email: "new@example.com" }] };
        }
        if (/INSERT INTO email_verification_tokens/.test(args[0])) {
            throw new Error("synthetic token failure");
        }
        return { rows: [] };
    };
    const result = await post("/api/auth/register", {
        firstName: "Test", lastName: "User", email: "new@example.com", password: "a-valid-password",
    });
    assert.equal(result.response.status, 500);
    assert.deepEqual(result.json, { error: "Can not create an account.", code: "INTERNAL_ERROR" });
    // Scope to the handler's transaction: the limiter's own reservation
    // transaction commits before the handler runs, so only statements
    // from the user insert onward belong to the registration.
    const handlerStart = allClientQueries.findIndex((sql) => /INSERT INTO users/.test(sql));
    const handlerQueries = allClientQueries.slice(handlerStart);
    assert.ok(handlerQueries.some((sql) => /^ROLLBACK/.test(sql.trim())), "rollback must run");
    assert.ok(!handlerQueries.some((sql) => /^COMMIT/.test(sql.trim())), "commit must not run");
    assert.equal(stubEmails.length, 0, "no email may send for a rolled-back registration");
});

test("register success sends a link whose token matches the stored hash", async () => {
    resetBehaviors();
    let tokenParams;
    clientBehavior = async (...args) => {
        if (/INSERT INTO users/.test(args[0])) {
            return { rows: [{ id: 7, first_name: "Test", last_name: "User", email: "new@example.com" }] };
        }
        if (/INSERT INTO email_verification_tokens/.test(args[0])) {
            tokenParams = args[1];
            return { rows: [] };
        }
        return { rows: [] };
    };
    const result = await post("/api/auth/register", {
        firstName: "Test", lastName: "User", email: "new@example.com", password: "a-valid-password",
    });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.json, { id: 7, first_name: "Test", last_name: "User", email: "new@example.com" });
    assert.equal(stubEmails.length, 1);
    const body = JSON.parse(stubEmails[0].body);
    assert.equal(body.from, "Gnosis Test <test@example.invalid>");
    assert.equal(body.to, "new@example.com");
    const match = body.html.match(/verify-email#token=([A-Za-z0-9_-]{43})/);
    assert.ok(match, "the email must carry a fragment verification link");
    assert.ok(body.text.includes(match[0]), "the text body must carry the same link");
    assert.equal(tokenParams[0], 7);
    assert.deepEqual(
        tokenParams[1],
        crypto.createHash("sha256").update(match[1], "utf8").digest(),
        "the stored value must be the link token's hash, never the token"
    );
});

async function postRaw(path, rawBody) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: rawBody,
    });
    const text = await response.text();
    return { response, json: text ? JSON.parse(text) : null, text };
}

test("resend rejects invalid input before the limiter and database", async () => {
    resetBehaviors();
    const beforeQuery = queryMock.mock.calls.length;
    const beforeConnect = connectMock.mock.calls.length;
    for (const body of [{ email: "not-an-email" }, { email: "" }]) {
        const result = await post("/api/auth/resend-verification", body);
        assert.equal(result.response.status, 400);
        assert.equal(result.json.code, "VALIDATION_FAILED");
    }
    // A JSON array body is well-formed JSON but not an object.
    const raw = await postRaw("/api/auth/resend-verification", "[1, 2]");
    assert.equal(raw.response.status, 400);
    assert.equal(raw.json.code, "VALIDATION_FAILED");
    assert.equal(queryMock.mock.calls.length, beforeQuery, "invalid resend must cause zero database calls");
    assert.equal(connectMock.mock.calls.length, beforeConnect, "invalid resend must cause zero checkouts");
});

test("verify rejects malformed tokens before the limiter and database", async () => {
    resetBehaviors();
    const beforeQuery = queryMock.mock.calls.length;
    const beforeConnect = connectMock.mock.calls.length;
    for (const token of ["short", "a".repeat(43).replace("a", "+"), 42, null]) {
        const result = await post("/api/auth/verify-email", { token });
        assert.equal(result.response.status, 400);
        assert.equal(result.json.code, "VALIDATION_FAILED");
    }
    assert.equal(queryMock.mock.calls.length, beforeQuery, "invalid verify must cause zero database calls");
    assert.equal(connectMock.mock.calls.length, beforeConnect, "invalid verify must cause zero checkouts");
});

test("resend returns the generic body for unknown and verified addresses", async () => {
    resetBehaviors();
    queryBehavior = async () => ({ rows: [] });
    const unknown = await post("/api/auth/resend-verification", { email: "nobody@example.com" });
    assert.equal(unknown.response.status, 200);
    assert.deepEqual(unknown.json, GENERIC_RESEND);
    queryBehavior = async () => ({ rows: [{ id: 9, email_verified_at: new Date() }] });
    const verified = await post("/api/auth/resend-verification", { email: "old@example.com" });
    assert.equal(verified.response.status, 200);
    assert.deepEqual(verified.json, GENERIC_RESEND);
    assert.equal(handlerClientCalls, 0, "no transaction may run for unknown or verified addresses");
    assert.equal(stubEmails.length, 0, "no email may send for unknown or verified addresses");
});

test("resend for an unverified address supersedes and sends", async () => {
    resetBehaviors();
    queryBehavior = async () => ({ rows: [{ id: 5, email_verified_at: null }] });
    const clientQueries = [];
    clientBehavior = async (...args) => {
        clientQueries.push(args[0]);
        if (/FOR UPDATE/.test(args[0]) && /FROM users/.test(args[0])) {
            return { rows: [{ email_verified_at: null }] };
        }
        if (/SELECT id FROM email_verification_tokens/.test(args[0])) {
            return { rows: [{ id: "00000000-0000-0000-0000-000000000001" }] };
        }
        return { rows: [] };
    };
    const result = await post("/api/auth/resend-verification", { email: "new@example.com" });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.json, GENERIC_RESEND);
    assert.ok(clientQueries.some((sql) => /consumed_reason = 'superseded'/.test(sql)), "old tokens must supersede");
    assert.ok(clientQueries.some((sql) => /INSERT INTO email_verification_tokens/.test(sql)), "a fresh token must insert");
    assert.equal(stubEmails.length, 1);
    assert.equal(JSON.parse(stubEmails[0].body).to, "new@example.com");
});

test("resend still returns the generic body when the provider is down", async () => {
    resetBehaviors();
    stubMode = "fail";
    queryBehavior = async () => ({ rows: [{ id: 5, email_verified_at: null }] });
    clientBehavior = async (...args) => {
        if (/FOR UPDATE/.test(args[0]) && /FROM users/.test(args[0])) {
            return { rows: [{ email_verified_at: null }] };
        }
        if (/SELECT id FROM email_verification_tokens/.test(args[0])) {
            return { rows: [] };
        }
        return { rows: [] };
    };
    const result = await post("/api/auth/resend-verification", { email: "new@example.com" });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.json, GENERIC_RESEND);
    assert.equal(stubEmails.length, 1, "the attempt was made; the failure changed nothing");
});

test("verify returns the generic body for unknown, superseded, and expired tokens", async () => {
    resetBehaviors();
    const token = "d".repeat(43);
    queryBehavior = async () => ({ rows: [] });
    const unknown = await post("/api/auth/verify-email", { token });
    assert.equal(unknown.response.status, 400);
    assert.deepEqual(unknown.json, GENERIC_VERIFY);

    const expired = new Date(Date.now() - 60 * 1000);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    for (const row of [
        { consumed_reason: "superseded", expires_at: future },
        { consumed_reason: null, expires_at: expired },
    ]) {
        queryBehavior = async () => ({
            rows: [{ id: "00000000-0000-0000-0000-000000000002", user_id: 5, ...row }],
        });
        clientBehavior = async (...args) => {
            if (/FROM users/.test(args[0])) return { rows: [{ id: 5, email_verified_at: null }] };
            if (/FROM email_verification_tokens/.test(args[0])) {
                return { rows: [{ id: "00000000-0000-0000-0000-000000000002", ...row }] };
            }
            return { rows: [] };
        };
        const result = await post("/api/auth/verify-email", { token });
        assert.equal(result.response.status, 400);
        assert.deepEqual(result.json, GENERIC_VERIFY);
    }
});

test("verify succeeds for a valid token and replays idempotently", async () => {
    resetBehaviors();
    const token = "e".repeat(43);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    queryBehavior = async () => ({
        rows: [{ id: "00000000-0000-0000-0000-000000000003", user_id: 5, expires_at: future, used_at: null, consumed_reason: null }],
    });
    let state = "unverified";
    const clientQueries = [];
    clientBehavior = async (...args) => {
        clientQueries.push(args[0]);
        if (/FROM users/.test(args[0])) {
            return { rows: [{ id: 5, email_verified_at: state === "verified" ? new Date() : null }] };
        }
        if (/FROM email_verification_tokens/.test(args[0])) {
            return {
                rows: [{
                    id: "00000000-0000-0000-0000-000000000003",
                    expires_at: future,
                    used_at: state === "verified" ? new Date() : null,
                    consumed_reason: state === "verified" ? "verified" : null,
                }],
            };
        }
        if (/UPDATE users SET email_verified_at/.test(args[0])) {
            state = "verified";
            return { rows: [] };
        }
        return { rows: [] };
    };
    const first = await post("/api/auth/verify-email", { token });
    assert.equal(first.response.status, 200);
    assert.deepEqual(first.json, { verified: true });
    assert.ok(clientQueries.some((sql) => /UPDATE users SET email_verified_at/.test(sql)));
    assert.ok(clientQueries.some((sql) => /consumed_reason = 'verified'/.test(sql)));
    clientQueries.length = 0;
    const replay = await post("/api/auth/verify-email", { token });
    assert.equal(replay.response.status, 200);
    assert.deepEqual(replay.json, { verified: true });
    assert.ok(!clientQueries.some((sql) => sql.trim().startsWith("UPDATE")), "a replay must write nothing");
});

test("verify and resend database failures are controlled 500s", async () => {
    resetBehaviors();
    const token = "f".repeat(43);
    const failed = await post("/api/auth/verify-email", { token });
    assert.equal(failed.response.status, 500);
    assert.deepEqual(failed.json, { error: "Something went wrong.", code: "INTERNAL_ERROR" });
    const resend = await post("/api/auth/resend-verification", { email: "new@example.com" });
    assert.equal(resend.response.status, 500);
    assert.deepEqual(resend.json, { error: "Something went wrong.", code: "INTERNAL_ERROR" });
});
