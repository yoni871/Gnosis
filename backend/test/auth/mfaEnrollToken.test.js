const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const {
    MFA_ENROLL_PURPOSE,
    createMfaEnrollToken,
    verifyMfaEnrollToken,
} = require("../../src/utils/mfaEnrollToken");

process.env.JWT_SECRET = "synthetic-test-jwt-secret-synthetic-test-jwt-secret";

test("an enrollment token verifies and carries the mfa-enroll purpose", () => {
    const token = createMfaEnrollToken(7);
    const decoded = jwt.decode(token);
    assert.equal(decoded.userId, 7);
    assert.equal(decoded.purpose, MFA_ENROLL_PURPOSE);
    assert.equal(decoded.iss, "gnosis");
    assert.equal(decoded.aud, "gnosis-api");
    // Ten-minute expiry.
    assert.equal(decoded.exp - decoded.iat, 600);
    assert.deepEqual(verifyMfaEnrollToken(token), { userId: 7 });
});

test("a session JWT is not an enrollment token", () => {
    const session = jwt.sign(
        { userId: 7, sid: "00000000-0000-4000-8000-000000000001" },
        process.env.JWT_SECRET,
        { algorithm: "HS256", expiresIn: 900, issuer: "gnosis", audience: "gnosis-api" }
    );
    assert.equal(verifyMfaEnrollToken(session), null);
});

test("a token with the wrong purpose, wrong audience, or tampered payload is rejected", () => {
    const wrongPurpose = jwt.sign(
        { userId: 7, purpose: "other" },
        process.env.JWT_SECRET,
        { algorithm: "HS256", expiresIn: 600, issuer: "gnosis", audience: "gnosis-api" }
    );
    assert.equal(verifyMfaEnrollToken(wrongPurpose), null);
    const wrongAudience = jwt.sign(
        { userId: 7, purpose: MFA_ENROLL_PURPOSE },
        process.env.JWT_SECRET,
        { algorithm: "HS256", expiresIn: 600, issuer: "gnosis", audience: "other-api" }
    );
    assert.equal(verifyMfaEnrollToken(wrongAudience), null);
    const token = createMfaEnrollToken(7);
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${"A".repeat(parts[2].length)}`;
    assert.equal(verifyMfaEnrollToken(tampered), null);
    assert.equal(verifyMfaEnrollToken(""), null);
    assert.equal(verifyMfaEnrollToken(null), null);
    assert.equal(verifyMfaEnrollToken("not-a-token"), null);
});

test("a non-integer userId cannot mint an enrollment token", () => {
    assert.throws(() => createMfaEnrollToken("7"), TypeError);
    assert.throws(() => createMfaEnrollToken(null), TypeError);
});
