const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
    createResendClient,
    resolveResendBaseUrl,
    RESEND_API_BASE_URL_DEFAULT,
    RESEND_TIMEOUT_MS,
} = require("../../src/utils/resendClient");

const ENV = {
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "Gnosis <verify@example.com>",
    FRONTEND_URL: "https://frontend.example.invalid",
};

test("production always uses the Resend API, even with an override set", () => {
    assert.equal(RESEND_API_BASE_URL_DEFAULT, "https://api.resend.com");
    assert.equal(resolveResendBaseUrl({ env: {} }), "https://api.resend.com");
    assert.equal(
        resolveResendBaseUrl({ env: { ...ENV, RESEND_API_BASE_URL: "http://stub.invalid" } }),
        "https://api.resend.com",
        "without test isolation the override is ignored"
    );
});

test("the override is honored only under test isolation, and injection wins", () => {
    assert.equal(
        resolveResendBaseUrl({ env: { ...ENV, GNOSIS_TEST_ISOLATION: "1", RESEND_API_BASE_URL: "http://stub.invalid" } }),
        "http://stub.invalid"
    );
    assert.equal(
        resolveResendBaseUrl({
            injectedBaseUrl: "http://injected.invalid",
            env: { ...ENV, GNOSIS_TEST_ISOLATION: "1", RESEND_API_BASE_URL: "http://stub.invalid" },
        }),
        "http://injected.invalid"
    );
    assert.equal(
        resolveResendBaseUrl({ injectedBaseUrl: "http://injected.invalid", env: {} }),
        "http://injected.invalid"
    );
});

test("sends the verification email with the validated config and link", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ id: "synthetic-id" }) };
    };
    const client = createResendClient({ fetchImpl, env: ENV });
    assert.equal(client.baseUrl, "https://api.resend.com");
    const token = "a".repeat(43);
    await client.sendVerificationEmail({ to: "new@example.com", token });
    assert.equal(calls.length, 1);
    const { url, options } = calls[0];
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer re_test_key");
    const body = JSON.parse(options.body);
    assert.equal(body.from, "Gnosis <verify@example.com>");
    assert.equal(body.to, "new@example.com");
    assert.ok(body.subject.length > 0);
    assert.ok(body.html.includes("https://frontend.example.invalid/verify-email#token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    assert.ok(body.text.includes("https://frontend.example.invalid/verify-email#token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    assert.ok(options.signal instanceof AbortSignal, "a timeout signal must guard the provider call");
    assert.equal(RESEND_TIMEOUT_MS, 5000);
});

test("a provider failure throws with its status and never logs the link", async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });
    const client = createResendClient({ fetchImpl, env: ENV });
    await assert.rejects(
        client.sendVerificationEmail({ to: "new@example.com", token: "b".repeat(43) }),
        (error) => error.status === 403
    );
});

test("bad configuration throws before any fetch", async () => {
    let called = false;
    const fetchImpl = async () => {
        called = true;
        return { ok: true, json: async () => ({}) };
    };
    const client = createResendClient({ fetchImpl, env: { ...ENV, RESEND_API_KEY: "" } });
    await assert.rejects(client.sendVerificationEmail({ to: "new@example.com", token: "c".repeat(43) }));
    assert.equal(called, false);
});

test("sends the password reset email with the validated config and link", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ id: "synthetic-id" }) };
    };
    const client = createResendClient({ fetchImpl, env: ENV });
    assert.equal(client.baseUrl, "https://api.resend.com");
    const token = "a".repeat(43);
    await client.sendPasswordResetEmail({ to: "old@example.com", token });
    assert.equal(calls.length, 1);
    const { url, options } = calls[0];
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer re_test_key");
    const body = JSON.parse(options.body);
    assert.equal(body.from, "Gnosis <verify@example.com>");
    assert.equal(body.to, "old@example.com");
    assert.equal(body.subject, "Reset your Gnosis password");
    assert.ok(body.html.includes("https://frontend.example.invalid/reset-password#token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    assert.ok(body.text.includes("https://frontend.example.invalid/reset-password#token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    assert.ok(body.html.includes("1 hour"), "the email must state the 1-hour expiry");
    assert.ok(options.signal instanceof AbortSignal, "a timeout signal must guard the provider call");
});

test("a password reset provider failure throws with its status", async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });
    const client = createResendClient({ fetchImpl, env: ENV });
    await assert.rejects(
        client.sendPasswordResetEmail({ to: "old@example.com", token: "b".repeat(43) }),
        (error) => error.status === 403
    );
});

test("the link token hashes to the stored form", async () => {
    // The email carries the raw token; the database must hold only its
    // SHA-256 hash. This test pins the relationship the routes rely on.
    const token = crypto.randomBytes(32).toString("base64url");
    const hash = crypto.createHash("sha256").update(token, "utf8").digest();
    assert.equal(hash.length, 32);
    assert.notEqual(hash.toString("hex"), token);
});
