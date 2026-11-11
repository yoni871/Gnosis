const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
    PASSWORD_RESET_TOKEN_BYTES,
    PASSWORD_RESET_TTL_MS,
    generatePasswordResetToken,
    hashPasswordResetToken,
    isValidPasswordResetTokenFormat,
    buildPasswordResetLink,
} = require("../../src/utils/passwordReset");

test("tokens are 32 random bytes, base64url, and unique", () => {
    assert.equal(PASSWORD_RESET_TOKEN_BYTES, 32);
    const seen = new Set();
    for (let i = 0; i < 100; i++) {
        const { token } = generatePasswordResetToken();
        assert.equal(token.length, 43, "32 bytes encode to 43 base64url characters");
        assert.match(token, /^[A-Za-z0-9_-]{43}$/);
        assert.ok(!token.includes("="), "base64url has no padding");
        assert.ok(!seen.has(token), "tokens must not repeat");
        seen.add(token);
    }
});

test("hashing is SHA-256, deterministic, and never contains the token", () => {
    const { token, tokenHash } = generatePasswordResetToken();
    assert.ok(Buffer.isBuffer(tokenHash));
    assert.equal(tokenHash.length, 32);
    assert.deepEqual(tokenHash, crypto.createHash("sha256").update(token, "utf8").digest());
    assert.deepEqual(tokenHash, hashPasswordResetToken(token));
    assert.ok(!tokenHash.toString("utf8").includes(token), "the hash must not embed the raw token");
    assert.ok(!tokenHash.equals(Buffer.from(token, "utf8")), "the hash is not the token");
});

test("different tokens hash differently", () => {
    const first = generatePasswordResetToken();
    const second = generatePasswordResetToken();
    assert.ok(!first.tokenHash.equals(second.tokenHash));
});

test("reset tokens live for 1 hour", () => {
    assert.equal(PASSWORD_RESET_TTL_MS, 60 * 60 * 1000);
});

test("the format gate accepts only well-formed tokens", () => {
    const { token } = generatePasswordResetToken();
    assert.equal(isValidPasswordResetTokenFormat(token), true);
    for (const value of ["short", "a".repeat(42), "a".repeat(44),
        "a".repeat(43).replace("a", "+"), "a".repeat(43).replace("a", "="),
        "a".repeat(43).replace("a", " "), 42, null, undefined, {}, []]) {
        assert.equal(isValidPasswordResetTokenFormat(value), false, JSON.stringify(value));
    }
});

test("the link targets the reset page with the token in the fragment", () => {
    const { token } = generatePasswordResetToken();
    assert.equal(
        buildPasswordResetLink("https://frontend.example.invalid", token),
        `https://frontend.example.invalid/reset-password#token=${token}`);
});
