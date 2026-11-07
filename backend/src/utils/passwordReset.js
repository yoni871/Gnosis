// Password reset tokens for issue #10.
//
// Pure, dependency-free helpers: no database, no network, no logs. The
// raw token exists only in the email and in the browser's memory; the
// database holds only its SHA-256 hash, and nothing here ever logs a
// token, a link, or a hash.
//
// The shape mirrors email verification (issue #9) deliberately: 32
// random bytes, base64url, SHA-256 hash, single-use rows with a
// consumed_reason. The differences are the ones the use case demands:
// a 1-hour TTL instead of 24 hours, because a reset token grants
// account access, and the link targets /reset-password.

const crypto = require("node:crypto");

const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
// 32 random bytes encode to 43 base64url characters (no padding).
const PASSWORD_RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hashPasswordResetToken(token) {
    return crypto.createHash("sha256").update(token, "utf8").digest();
}

function generatePasswordResetToken() {
    const token = crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("base64url");
    return { token, tokenHash: hashPasswordResetToken(token) };
}

// Structural gate for reset requests: only a well-formed token ever
// reaches the limiter or the database. Malformed input is a validation
// failure (400, no quota consumed), while a well-formed but unknown
// token is a generic 400 that does count against the reset limit.
function isValidPasswordResetTokenFormat(value) {
    return typeof value === "string" && PASSWORD_RESET_TOKEN_PATTERN.test(value);
}

function buildPasswordResetLink(frontendUrl, token) {
    return `${frontendUrl}/reset-password#token=${token}`;
}

module.exports = {
    PASSWORD_RESET_TOKEN_BYTES,
    PASSWORD_RESET_TTL_MS,
    generatePasswordResetToken,
    hashPasswordResetToken,
    isValidPasswordResetTokenFormat,
    buildPasswordResetLink,
};
