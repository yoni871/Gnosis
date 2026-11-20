const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { isBreachedPassword, resolveHibpBaseUrl, HIBP_API_BASE_URL_DEFAULT } = require("../../src/utils/breachedPasswords");

// Audit N07, roadmap T1.7: Have I Been Pwned k-anonymity screening.
// Only the first 5 SHA-1 hex characters ever leave the process; the
// match is done locally. No test here makes a network call: fetch is
// always stubbed, and the range body is built from the test password's
// own SHA-1.

function sha1(password) {
    return crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
}

function rangeBodyFor(password, count = 3) {
    return `${sha1(password).slice(5)}:${count}\n`;
}

function stubFetch({ body = "", ok = true, throws = null } = {}) {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        if (throws) throw throws;
        return { ok, text: async () => body };
    };
    return { fetchImpl, calls };
}

test("resolveHibpBaseUrl defaults to the HIBP range API", () => {
    assert.equal(resolveHibpBaseUrl({ env: {} }), HIBP_API_BASE_URL_DEFAULT);
    assert.equal(resolveHibpBaseUrl({ env: { GNOSIS_TEST_ISOLATION: "0", HIBP_API_BASE_URL: "http://stub.invalid/" } }),
        HIBP_API_BASE_URL_DEFAULT);
});

test("resolveHibpBaseUrl honors the override only under test isolation", () => {
    assert.equal(
        resolveHibpBaseUrl({ env: { GNOSIS_TEST_ISOLATION: "1", HIBP_API_BASE_URL: "http://stub.invalid/" } }),
        "http://stub.invalid/");
    assert.equal(
        resolveHibpBaseUrl({ injectedBaseUrl: "http://injected.invalid/", env: {} }),
        "http://injected.invalid/");
});

test("base URL without a trailing slash still forms the range path", async () => {
    const password = "breached-password-1";
    const { fetchImpl, calls } = stubFetch({ body: rangeBodyFor(password) });
    assert.equal(await isBreachedPassword(password, {
        fetchImpl,
        baseUrl: "http://stub.invalid",
    }), true);
    assert.equal(calls[0].url, `http://stub.invalid/${sha1(password).slice(0, 5)}`);
});

test("breached password: only the 5-character prefix is sent, suffix matched locally", async () => {
    const password = "breached-password-1";
    const { fetchImpl, calls } = stubFetch({ body: rangeBodyFor(password) });
    assert.equal(await isBreachedPassword(password, { fetchImpl }), true);
    assert.equal(calls.length, 1);
    const sentUrl = calls[0].url;
    assert.ok(sentUrl.startsWith(HIBP_API_BASE_URL_DEFAULT), sentUrl);
    assert.ok(sentUrl.endsWith(sha1(password).slice(0, 5)), sentUrl);
    assert.ok(!sentUrl.includes(sha1(password).slice(5)), "the full hash must never be sent");
    assert.ok(!sentUrl.includes(password), "the password must never be sent");
});

test("unbreached password: no suffix matches", async () => {
    const { fetchImpl } = stubFetch({ body: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:2\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:1\n" });
    assert.equal(await isBreachedPassword("a-strong-unique-password-99", { fetchImpl }), false);
});

test("empty range body means not breached", async () => {
    const { fetchImpl } = stubFetch({ body: "" });
    assert.equal(await isBreachedPassword("another-strong-password-99", { fetchImpl }), false);
});

test("network error fails open and warns without password data", async () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => { warnings.push(args.join(" ")); };
    try {
        const { fetchImpl } = stubFetch({ throws: new Error("synthetic network failure") });
        assert.equal(await isBreachedPassword("some-password-12345", { fetchImpl }), false);
    } finally {
        console.warn = originalWarn;
    }
    assert.equal(warnings.length, 1);
    assert.ok(!warnings[0].includes("some-password-12345"), "the warn line must not carry the password");
});

test("non-2xx response fails open", async () => {
    const { fetchImpl } = stubFetch({ ok: false, body: "error" });
    assert.equal(await isBreachedPassword("some-password-12345", { fetchImpl }), false);
});

test("timeout signal is set", async () => {
    const { fetchImpl, calls } = stubFetch({ body: "" });
    await isBreachedPassword("some-password-12345", { fetchImpl });
    assert.ok(calls[0].options.signal instanceof AbortSignal, "an abort signal must be passed");
});
