const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
    VERIFICATION_TOKEN_BYTES,
    VERIFICATION_TTL_MS,
    generateVerificationToken,
    hashVerificationToken,
    isValidVerificationTokenFormat,
    buildVerificationLink,
} = require("../../src/utils/verification");

test("tokens are 32 random bytes, base64url, and unique", () => {
    assert.equal(VERIFICATION_TOKEN_BYTES, 32);
    const seen = new Set();
    for (let i = 0; i < 100; i++) {
        const { token } = generateVerificationToken();
        assert.equal(token.length, 43, "32 bytes encode to 43 base64url characters");
        assert.match(token, /^[A-Za-z0-9_-]{43}$/);
        assert.ok(!token.includes("="), "base64url has no padding");
        assert.ok(!seen.has(token), "tokens must not repeat");
        seen.add(token);
    }
});

test("hashing is SHA-256, deterministic, and never contains the token", () => {
    const { token, tokenHash } = generateVerificationToken();
    assert.ok(Buffer.isBuffer(tokenHash));
    assert.equal(tokenHash.length, 32);
    assert.deepEqual(tokenHash, crypto.createHash("sha256").update(token, "utf8").digest());
    assert.deepEqual(tokenHash, hashVerificationToken(token));
    assert.ok(!tokenHash.toString("utf8").includes(token), "the hash must not embed the raw token");
    assert.ok(!tokenHash.equals(Buffer.from(token, "utf8")), "the hash is not the token");
});

test("different tokens hash differently", () => {
    const first = generateVerificationToken();
    const second = generateVerificationToken();
    assert.ok(!first.tokenHash.equals(second.tokenHash));
});

test("time to live is 24 hours", () => {
    assert.equal(VERIFICATION_TTL_MS, 24 * 60 * 60 * 1000);
});

test("token format gate accepts only well-formed tokens", () => {
    const { token } = generateVerificationToken();
    assert.equal(isValidVerificationTokenFormat(token), true);
    assert.equal(isValidVerificationTokenFormat(""), false);
    assert.equal(isValidVerificationTokenFormat("short"), false);
    assert.equal(isValidVerificationTokenFormat(`${token}x`), false);
    assert.equal(isValidVerificationTokenFormat(token.slice(0, 42)), false);
    assert.equal(isValidVerificationTokenFormat(`${token.slice(0, 42)}+`), false);
    assert.equal(isValidVerificationTokenFormat(`${token.slice(0, 42)}/`), false);
    assert.equal(isValidVerificationTokenFormat(`${token.slice(0, 42)}=`), false);
    assert.equal(isValidVerificationTokenFormat(null), false);
    assert.equal(isValidVerificationTokenFormat(42), false);
});

test("verification links use the frontend origin and a fragment", () => {
    const { token } = generateVerificationToken();
    const link = buildVerificationLink("https://frontend.example.invalid", token);
    assert.equal(link, `https://frontend.example.invalid/verify-email#token=${token}`);
    assert.ok(!link.includes("?token="), "the token must never be in the query string");
});
