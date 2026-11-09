const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = 'test-jwt-secret-for-auth-route-tests';
process.env.RATE_LIMIT_KEY_SECRET = "test-secret-for-rate-limit-tests";
// Issue #9: app.js validates email configuration at import time.
process.env.RESEND_API_KEY = 'synthetic-test-resend-key';
process.env.EMAIL_FROM = 'Gnosis Test <test@example.invalid>';
process.env.FRONTEND_URL = 'https://frontend.example.invalid';

const app = require("../../src/app");
const pool = require("../../src/db/db");

// Reject queries in memory: no real database connection is attempted.
// Issue #4: the limiter checks out a client for its reservation
// transaction, so the database-down fixture must reject connect() too;
// otherwise a valid request would attempt a real connection.
const queryMock = test.mock.method(pool, "query", async () => {
    throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
});
const connectMock = test.mock.method(pool, "connect", async () => {
    throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
});

let server;
let baseUrl;
let hibpStub;

test.before(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    // Loopback HIBP stub (honored only under test isolation): the
    // register path screens passwords against HIBP, and no test may
    // call the real api.pwnedpasswords.com. Empty range body = not breached.
    hibpStub = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("");
    });
    await new Promise((resolve) => hibpStub.listen(0, "127.0.0.1", resolve));
    process.env.HIBP_API_BASE_URL = `http://127.0.0.1:${hibpStub.address().port}`;
});

test.after(async () => {
    if (server.closeAllConnections) {
        server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
    if (hibpStub) await new Promise((resolve) => hibpStub.close(resolve));
    delete process.env.HIBP_API_BASE_URL;
    queryMock.mock.restore();
    connectMock.mock.restore();
    await pool.end();
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

function assertJsonError(result, status, body) {
    assert.equal(result.response.status, status);
    assert.match(result.response.headers.get("content-type") || "", /application\/json/);
    assert.deepEqual(result.json, body);
    assert.ok(!result.text.includes("<!DOCTYPE"), result.text);
    assert.ok(!result.text.includes(" at "), result.text);
}

test("profile without an authorization header returns 401 JSON", async () => {
    const result = await request("/api/auth/profile");
    assertJsonError(result, 401, {
        error: "Access token required.",
        code: "TOKEN_REQUIRED",
    });
});

test("profile with an invalid token returns 403 JSON, not a stack trace", async () => {
    const result = await request("/api/auth/profile", {
        headers: { Authorization: "Bearer not.a.valid.token" },
    });
    assertJsonError(result, 403, {
        error: "Invalid or expired token.",
        code: "TOKEN_INVALID",
    });
});

test("malformed JSON returns exactly the INVALID_BODY response", async () => {
    const result = await request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
    });
    assertJsonError(result, 400, {
        error: "Invalid request body.",
        code: "INVALID_BODY",
    });
});

test("login with the database down returns a generic 500 JSON", async () => {
    const result = await request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "someone@example.com", password: "whatever" }),
    });
    assertJsonError(result, 500, {
        error: "Something went wrong.",
        code: "INTERNAL_ERROR",
    });
    assert.ok(!result.text.includes("SELECT"), result.text);
});

test("register with a missing password returns a controlled 400 VALIDATION_FAILED JSON", async () => {
    // Issue #3: a missing password is a validation failure (400), not an
    // internal error. The point here is that it is controlled JSON, never
    // HTML or a stack trace.
    const result = await request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: "Test", lastName: "User", email: "test@example.com" }),
    });
    assertJsonError(result, 400, {
        error: "Password is required.",
        code: "VALIDATION_FAILED",
    });
});

test("register with the database down returns a generic 500 JSON", async () => {
    const result = await request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            email: "test@example.com",
            password: "a-valid-looking-password",
        }),
    });
    assertJsonError(result, 500, {
        error: "Can not create an account.",
        code: "INTERNAL_ERROR",
    });
});

test("profile with a valid token but the database down returns a generic 500 JSON", async () => {
    const token = jwt.sign({ userId: 1, sid: "00000000-0000-4000-8000-000000000001" }, process.env.JWT_SECRET, { expiresIn: "1h", issuer: "gnosis", audience: "gnosis-api" });
    const result = await request("/api/auth/profile", {
        headers: { Authorization: `Bearer ${token}` },
    });
    assertJsonError(result, 500, {
        error: "Something went wrong.",
        code: "INTERNAL_ERROR",
    });
});

test("missing JWT secret at request time is a 500, not a misleading 403", async () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
        const result = await request("/api/auth/profile", {
            headers: { Authorization: "Bearer anything.at.all" },
        });
        assertJsonError(result, 500, {
            error: "Something went wrong.",
            code: "INTERNAL_ERROR",
        });
    } finally {
        process.env.JWT_SECRET = saved;
    }
});
