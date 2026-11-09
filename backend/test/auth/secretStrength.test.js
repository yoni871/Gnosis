const test = require("node:test");
const assert = require("node:assert/strict");

const { isStrongSecret } = require("../../src/utils/secretStrength");

// Audit N06, roadmap T1.5: a value counts as at least 32 random bytes if
// it is 64 hex characters, or at least 43 base64url characters, or
// otherwise at least 32 characters long. Anything shorter fails boot.

test("accepts 64 hex characters (32 bytes)", () => {
    assert.equal(isStrongSecret("0123456789abcdef".repeat(4)), true);
    assert.equal(isStrongSecret("ABCDEF0123456789".repeat(4)), true);
});

test("accepts at least 43 base64url characters (32 bytes)", () => {
    assert.equal(isStrongSecret("Ab3-_xQw9ZkL2mN8pR4sT6vY0aB1cD5eF7gH3jK8mN2"), true); // 43 chars, base64url alphabet
});

test("accepts any other value of at least 32 characters", () => {
    assert.equal(isStrongSecret("test-secret-for-server-config-tests"), true); // 35 chars
    assert.equal(isStrongSecret("correct horse battery staple, 2026!"), true);
});

// Ported from #72 (securityConfig.strongSecret) by the integration
// disposition: length alone is not randomness. A degenerate value that
// passes the length/format rule above is still not 32 random bytes.
// The removed fixtures ("a".repeat(64), "A".repeat(43), "x".repeat(32))
// pinned acceptance of such values and contradict this rule, so they
// were replaced by the realistic fixtures in the accept tests above;
// the assertions below pin the rejection instead.
test("rejects low-entropy and placeholder values even at full length", () => {
    assert.equal(isStrongSecret("a".repeat(64)), false); // 1 distinct char
    assert.equal(isStrongSecret("A".repeat(43)), false); // 1 distinct char
    assert.equal(isStrongSecret("x".repeat(32)), false); // 1 distinct char
    assert.equal(isStrongSecret("abcdefghij".repeat(4)), false); // 40 chars, 10 distinct
    assert.equal(isStrongSecret("changeme-".repeat(8)), false); // placeholder
    assert.equal(isStrongSecret("your-secret-key-for-local-dev-only-12345"), false); // placeholder
    assert.equal(isStrongSecret("0123456789ab".repeat(3)), true); // 36 chars, exactly 12 distinct
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
