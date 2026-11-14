// Enrollment-scoped JWT (design §9).
//
// When an admin account has no enrolled MFA, login does not issue a
// session. Instead it returns this short-lived token, which grants
// ONLY enrollment (POST /api/auth/mfa/enroll and
// /api/auth/mfa/enroll/confirm). It is a JWT with the same secret,
// algorithm, issuer, and audience as a session token, plus a purpose
// claim `purpose: "mfa-enroll"` and the userId. Ten-minute expiry.
//
// It is NOT a session: it carries no sid and no auth_sessions row
// exists for it, so authenticateToken rejects it (no sid, no row).
// The enrollment endpoints use authenticateMfaEnroll, which accepts
// either this token or a full session JWT — never both, and never
// this token on any other endpoint.
//
// The token is bound to the credential login verified: the payload
// carries a SHA-256 digest of the account's password hash at issue
// time (never the hash itself — the digest is one-way and reveals
// nothing about the password). authenticateMfaEnroll re-reads the
// account's current password hash and compares digests; a password
// reset or change after the token was issued invalidates it, so a
// token minted before a reset cannot enroll MFA for the new
// credential.

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { isStrongSecret } = require("./secretStrength");

const MFA_ENROLL_PURPOSE = "mfa-enroll";
const MFA_ENROLL_EXPIRES_SECONDS = 600;

function digestPasswordHash(passwordHash) {
    return crypto.createHash("sha256").update(passwordHash, "utf8").digest("hex");
}

function createMfaEnrollToken(userId, passwordHash) {
    if (!Number.isInteger(userId)) {
        throw new TypeError("Mfa enroll token userId must be an integer.");
    }
    if (typeof passwordHash !== "string" || passwordHash === "") {
        throw new TypeError("Mfa enroll token requires the verified password hash.");
    }
    if (!isStrongSecret(process.env.JWT_SECRET)) {
        throw new Error("JWT secret is not configured.");
    }
    return jwt.sign(
        { userId, purpose: MFA_ENROLL_PURPOSE, pwd: digestPasswordHash(passwordHash) },
        process.env.JWT_SECRET,
        { algorithm: "HS256", expiresIn: MFA_ENROLL_EXPIRES_SECONDS, issuer: "gnosis", audience: "gnosis-api" }
    );
}

function verifyMfaEnrollToken(token) {
    if (typeof token !== "string" || token === "") {
        return null;
    }
    if (!isStrongSecret(process.env.JWT_SECRET)) {
        return null;
    }
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ["HS256"], issuer: "gnosis", audience: "gnosis-api",
        });
        if (!Number.isInteger(payload.userId) || payload.purpose !== MFA_ENROLL_PURPOSE
            || typeof payload.pwd !== "string" || payload.pwd === "") {
            return null;
        }
        return { userId: payload.userId, passwordHashDigest: payload.pwd, expiresAt: payload.exp };
    } catch {
        return null;
    }
}

module.exports = { MFA_ENROLL_PURPOSE, MFA_ENROLL_EXPIRES_SECONDS, digestPasswordHash, createMfaEnrollToken, verifyMfaEnrollToken };
