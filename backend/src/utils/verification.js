// Email verification tokens for issue #9.
//
// Pure, dependency-free helpers: no database, no network, no logs. The
// raw token exists only in the email and in the browser's memory; the
// database holds only its SHA-256 hash, and nothing here ever logs a
// token, a link, or a hash.

const crypto = require("node:crypto");

const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
// 32 random bytes encode to 43 base64url characters (no padding).
const VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hashVerificationToken(token) {
    return crypto.createHash("sha256").update(token, "utf8").digest();
}

function generateVerificationToken() {
    const token = crypto.randomBytes(VERIFICATION_TOKEN_BYTES).toString("base64url");
    return { token, tokenHash: hashVerificationToken(token) };
}

// Structural gate for verify requests: only a well-formed token ever
// reaches the limiter or the database. Malformed input is a validation
// failure (400, no quota consumed), while a well-formed but unknown
// token is a generic 400 that does count against the verify limit.
function isValidVerificationTokenFormat(value) {
    return typeof value === "string" && VERIFICATION_TOKEN_PATTERN.test(value);
}

function buildVerificationLink(frontendUrl, token) {
    return `${frontendUrl}/verify-email#token=${token}`;
}

module.exports = {
    VERIFICATION_TOKEN_BYTES,
    VERIFICATION_TTL_MS,
    generateVerificationToken,
    hashVerificationToken,
    isValidVerificationTokenFormat,
    buildVerificationLink,
};
