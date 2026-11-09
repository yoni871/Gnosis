// MFA challenge tokens for roadmap T2.3.
//
// Shape mirrors password reset (issue #10) deliberately: 32 random
// bytes, base64url, SHA-256 hash only, single-use rows with a
// consumed_reason. The differences are the ones the use case demands:
// a 10-minute TTL instead of 1 hour, because the challenge is the
// second half of a login already in progress, and the token is
// returned in the login response (not emailed), so it must be short
// lived. The raw token exists only in the login response and in the
// browser's memory; the database holds only its hash, and nothing here
// ever logs a token or a hash.

const crypto = require("node:crypto");

const MFA_CHALLENGE_TOKEN_BYTES = 32;
const MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;
// 32 random bytes encode to 43 base64url characters (no padding).
const MFA_CHALLENGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hashMfaChallengeToken(token) {
    return crypto.createHash("sha256").update(token, "utf8").digest();
}

function generateMfaChallengeToken() {
    const token = crypto.randomBytes(MFA_CHALLENGE_TOKEN_BYTES).toString("base64url");
    return { token, tokenHash: hashMfaChallengeToken(token) };
}

// Structural gate for MFA verification: only a well-formed token ever
// reaches the limiter or the database. Malformed input is a validation
// failure (400, no quota consumed), while a well-formed but unknown
// token is a generic 401 that does count against the verify limit.
function isValidMfaChallengeTokenFormat(value) {
    return typeof value === "string" && MFA_CHALLENGE_TOKEN_PATTERN.test(value);
}

module.exports = {
    MFA_CHALLENGE_TOKEN_BYTES,
    MFA_CHALLENGE_TTL_MS,
    generateMfaChallengeToken,
    hashMfaChallengeToken,
    isValidMfaChallengeTokenFormat,
};
