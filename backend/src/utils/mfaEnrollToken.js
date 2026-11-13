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

const jwt = require("jsonwebtoken");
const { isStrongSecret } = require("./secretStrength");

const MFA_ENROLL_PURPOSE = "mfa-enroll";
const MFA_ENROLL_EXPIRES_SECONDS = 600;

function createMfaEnrollToken(userId) {
    if (!Number.isInteger(userId)) {
        throw new TypeError("Mfa enroll token userId must be an integer.");
    }
    if (!isStrongSecret(process.env.JWT_SECRET)) {
        throw new Error("JWT secret is not configured.");
    }
    return jwt.sign(
        { userId, purpose: MFA_ENROLL_PURPOSE },
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
        if (!Number.isInteger(payload.userId) || payload.purpose !== MFA_ENROLL_PURPOSE) {
            return null;
        }
        return { userId: payload.userId };
    } catch {
        return null;
    }
}

module.exports = { MFA_ENROLL_PURPOSE, MFA_ENROLL_EXPIRES_SECONDS, createMfaEnrollToken, verifyMfaEnrollToken };
