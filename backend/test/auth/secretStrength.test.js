const test = require("node:test");
const assert = require("node:assert/strict");

const { isStrongSecret } = require("../../src/utils/secretStrength");

// Audit N06, roadmap T1.5: a value counts as at least 32 random bytes if
// it is 64 hex characters, or at least 43 base64url characters, or
// otherwise at least 32 characters long. Anything shorter fails boot.

test("accepts 64 hex characters (32 bytes)", () => {
    assert.equal(isStrongSecret("a".repeat(64)), true);
    assert.equal(isStrongSecret("0123456789abcdef".repeat(4)), true);
    assert.equal(isStrongSecret("ABCDEF0123456789".repeat(4)), true);
});

test("accepts at least 43 base64url characters (32 bytes)", () => {
    assert.equal(isStrongSecret("A".repeat(43)), true);
    assert.equal(isStrongSecret("Ab3-_x".repeat(8)), true); // 48 chars, base64url alphabet
    assert.equal(isStrongSecret("a".repeat(64)), true); // hex is also base64url
});

test("accepts any other value of at least 32 characters", () => {
    assert.equal(isStrongSecret("x".repeat(32)), true);
    assert.equal(isStrongSecret("test-secret-for-server-config-tests"), true); // 35 chars
    assert.equal(isStrongSecret("correct horse battery staple, 2026!"), true);
});

test("rejects values shorter than 32 characters", () => {
    assert.equal(isStrongSecret("x".repeat(31)), false);
    assert.equal(isStrongSecret("Ab3-_x".repeat(5)), false); // 30 base64url chars
    assert.equal(isStrongSecret("short-secret"), false);
});

test("rejects empty and non-string values", () => {
    assert.equal(isStrongSecret(""), false);
    assert.equal(isStrongSecret(undefined), false);
    assert.equal(isStrongSecret(null), false);
    assert.equal(isStrongSecret(12345678901234567890123456789012), false);
    assert.equal(isStrongSecret({}), false);
});
