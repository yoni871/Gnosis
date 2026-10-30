const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

// Point the pool at a closed port so every database call fails fast and
// deterministically, without depending on any real database. These must be
// set before the app (and its pool) is required.
delete process.env.DATABASE_URL;
process.env.DB_HOST = "127.0.0.1";
process.env.DB_PORT = "59999";
process.env.DB_USER = "test";
process.env.DB_NAME = "test";
process.env.DB_PASSWORD = "test";
process.env.JWT_SECRET = "test-secret-for-auth-error-tests";

const app = require("../../src/app");
const pool = require("../../src/db/db");

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

test("register with a missing password returns a generic 500 JSON, not HTML", async () => {
    // No password field: bcrypt.hash(undefined) throws. Issue #5 maps that
    // to the generic 500 (input validation belongs to issue #3); the point
    // here is that it no longer escapes to Express's HTML error page.
    const result = await request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: "Test", lastName: "User", email: "test@example.com" }),
    });
    assertJsonError(result, 500, {
        error: "Can not create an account.",
        code: "INTERNAL_ERROR",
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
    const token = jwt.sign({ userId: 1 }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const result = await request("/api/auth/profile", {
        headers: { Authorization: `Bearer ${token}` },
    });
    assertJsonError(result, 500, {
        error: "Failed to retrieve profile.",
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
