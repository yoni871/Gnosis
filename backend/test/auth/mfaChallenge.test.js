const test = require("node:test");
const assert = require("node:assert/strict");
const {
    generateMfaChallengeToken,
    hashMfaChallengeToken,
    isValidMfaChallengeTokenFormat,
    MFA_CHALLENGE_TTL_MS,
} = require("../../src/utils/mfaChallenge");

test("challenge tokens are 43 base64url characters with a 10-minute TTL", () => {
    assert.equal(MFA_CHALLENGE_TTL_MS, 10 * 60 * 1000);
    const { token, tokenHash } = generateMfaChallengeToken();
    assert.equal(isValidMfaChallengeTokenFormat(token), true);
    assert.equal(token.length, 43);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(Buffer.isBuffer(tokenHash));
    assert.equal(tokenHash.length, 32);
    // Two challenges never share a token or a hash.
    const second = generateMfaChallengeToken();
    assert.notEqual(second.token, token);
    assert.ok(!second.tokenHash.equals(tokenHash));
});

test("the hash is a deterministic SHA-256 of the token", () => {
    const { token, tokenHash } = generateMfaChallengeToken();
    assert.ok(hashMfaChallengeToken(token).equals(tokenHash));
});

test("malformed challenges are rejected structurally", () => {
    for (const value of ["", "short", "a".repeat(42), "a".repeat(44), "a".repeat(43).replace("a", "!"), null, 42]) {
        assert.equal(isValidMfaChallengeTokenFormat(value), false, JSON.stringify(value));
    }
});
