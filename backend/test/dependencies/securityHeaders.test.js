const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Audit F03 (security headers + CSP), F12 (no-store on private
// responses), N05 (JSON 404 for unmatched /api/*). These tests exercise
// the real app with the database mocked to fail loudly, following
// test/auth/authRoutes.test.js: any request that reaches the database
// throws, so only header/auth behaviour is asserted here. Authenticated
// happy paths are covered by the database-backed application suite.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = "test-secret-for-security-headers-000000000000";
process.env.RATE_LIMIT_KEY_SECRET = "test-secret-for-security-headers-111111111111";
process.env.RESEND_API_KEY = "test-key-for-security-headers-222222222222";
process.env.EMAIL_FROM = "Gnosis Test <test@example.invalid>";
process.env.FRONTEND_URL = "https://frontend.example.invalid";

const app = require("../../src/app");
const pool = require("../../src/db/db");
const {
    CONTENT_SECURITY_POLICY,
    INLINE_SCRIPT_SHA256,
} = require("../../src/middleware/securityHeaders");

const queryMock = test.mock.method(pool, "query", async () => {
    throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
});
const connectMock = test.mock.method(pool, "connect", async () => {
    throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
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

async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { Connection: "close", ...options.headers },
    });
    const text = await response.text();
    return { response, text, json: text ? JSON.parse(text) : null };
}

function assertSecurityHeaders(result) {
    const headers = result.response.headers;
    assert.equal(headers.get("content-security-policy"), CONTENT_SECURITY_POLICY);
    assert.equal(headers.get("x-content-type-options"), "nosniff");
    assert.equal(headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.equal(headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
    assert.equal(headers.get("cross-origin-opener-policy"), "same-origin");
    // Audit F03: the framework must not be advertised.
    assert.equal(headers.get("x-powered-by"), null);
}

function assertPrivateNoStore(result) {
    assert.equal(result.response.headers.get("cache-control"), "private, no-store");
}

test("health endpoint carries the full security header set and no X-Powered-By", async () => {
    const result = await request("/");
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.json, { message: "Bible commentary API is running!" });
    assertSecurityHeaders(result);
});

test("CSP is enforced with a hash for the one inline script, not unsafe-inline", () => {
    assert.match(CONTENT_SECURITY_POLICY, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
    // script-src must never carry 'unsafe-inline': the single inline
    // script is allowed by hash instead. style-src may carry it (React
    // inline style attributes); assert the two directives separately so
    // a future relaxation of script-src fails loudly.
    const scriptSrc = CONTENT_SECURITY_POLICY.match(/script-src ([^;]+)/)[1];
    assert.ok(!scriptSrc.includes("unsafe-inline"), scriptSrc);
    assert.ok(!CONTENT_SECURITY_POLICY.includes("Content-Security-Policy-Report-Only"));
    assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'self'/);
    assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
});

test("CSP script hash matches the inline script in frontend/index.html", () => {
    const html = fs.readFileSync(
        path.resolve(__dirname, "../../../frontend/index.html"),
        "utf8"
    );
    const match = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(match, "expected one inline <script> in frontend/index.html");
    const hash = crypto.createHash("sha256").update(match[1], "utf8").digest("base64");
    assert.equal(hash, INLINE_SCRIPT_SHA256);
    assert.ok(CONTENT_SECURITY_POLICY.includes(`'sha256-${INLINE_SCRIPT_SHA256}'`));
});

test("unmatched /api/* GET returns controlled JSON 404, not Express HTML", async () => {
    const result = await request("/api/does-not-exist");
    assert.equal(result.response.status, 404);
    assert.match(result.response.headers.get("content-type") || "", /application\/json/);
    assert.deepEqual(result.json, { error: "Not found.", code: "NOT_FOUND" });
    assert.ok(!result.text.includes("<!DOCTYPE"), result.text);
    assert.ok(!result.text.includes("Cannot GET"), result.text);
    assertSecurityHeaders(result);
});

test("unmatched /api/* POST returns the same controlled JSON 404", async () => {
    const result = await request("/api/does-not-exist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });
    assert.equal(result.response.status, 404);
    assert.deepEqual(result.json, { error: "Not found.", code: "NOT_FOUND" });
    assertSecurityHeaders(result);
});

test("private endpoints carry no-store even on unauthenticated errors", async () => {
    for (const path of [
        "/api/auth/profile",
        "/api/notes",
        "/api/bookmarks",
        "/api/highlights",
        "/api/reading-state",
    ]) {
        const result = await request(path);
        assert.equal(result.response.status, 401, path);
        assert.deepEqual(result.json, {
            error: "Access token required.",
            code: "TOKEN_REQUIRED",
        });
        assertPrivateNoStore(result);
        assertSecurityHeaders(result);
    }
});

test("public reference endpoint keeps its intentional public caching", async () => {
    // /api/books sets its public Cache-Control before the handler runs,
    // so the header survives even though the mocked database fails.
    const result = await request("/api/books");
    assert.equal(result.response.status, 500);
    assert.match(result.response.headers.get("cache-control") || "", /^public, max-age=/);
    assert.ok(
        !(result.response.headers.get("cache-control") || "").includes("no-store"),
        "public caching must not become no-store"
    );
    assertSecurityHeaders(result);
});

test("frontend vercel.json carries the same CSP as the backend", () => {
    const vercel = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../../frontend/vercel.json"), "utf8")
    );
    const catchAll = vercel.headers.find((entry) => entry.source === "/(.*)");
    assert.ok(catchAll, "expected a /(.*) headers entry in frontend/vercel.json");
    const csp = catchAll.headers.find((header) => header.key === "Content-Security-Policy");
    assert.ok(csp, "expected a CSP header in frontend/vercel.json");
    assert.equal(csp.value, CONTENT_SECURITY_POLICY);
    const keys = catchAll.headers.map((header) => header.key);
    for (const key of [
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Cross-Origin-Opener-Policy",
    ]) {
        assert.ok(keys.includes(key), `missing ${key} in frontend/vercel.json`);
    }
});
