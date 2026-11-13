// Enrollment authentication for POST /api/auth/mfa/enroll and
// /api/auth/mfa/enroll/confirm (design §9).
//
// Accepts EITHER a full session JWT (the existing path: a signed-in
// user setting up MFA) OR an enrollment-scoped JWT (an admin who
// reached the login gate without enrolled MFA and holds a
// 10-minute mfa-enroll token). It never accepts both, and it
// rejects a token of the wrong kind for this purpose.
//
// - Session JWT: verified like authenticateToken (JWT + live
//   auth_sessions row), sets req.user = { userId, sid, mfaEnroll:
//   false }. A session JWT has no purpose claim, so it cannot be
//   mistaken for an enrollment token.
// - Enrollment token: verified by mfaEnrollToken (purpose
//   "mfa-enroll" + integer userId, 10-minute expiry), sets req.user
//   = { userId, mfaEnroll: true }. No session row exists for it and
//   none is checked. It grants ONLY enrollment: it carries no sid,
//   so authenticateToken rejects it on every other endpoint.
//
// Anything else (missing, malformed, expired, wrong purpose, or a
// session whose row is revoked/expired) is a 403. The enrollment
// handlers still reject an already-enrolled user with 409, so an
// enrollment token for an enrolled user cannot re-enroll.

const jwt = require("jsonwebtoken");
const pool = require("../db/db");
const { isStrongSecret } = require("../utils/secretStrength");
const { CLIENT_AUTH_RESPONSES, logAuthFailure } = require("../utils/authErrors");
const { verifyMfaEnrollToken, digestPasswordHash } = require("../utils/mfaEnrollToken");

const authenticateMfaEnroll = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        const { status, body } = CLIENT_AUTH_RESPONSES.tokenRequired;
        return res.status(status).json(body);
    }
    if (!isStrongSecret(process.env.JWT_SECRET)) {
        logAuthFailure("mfaEnrollMiddleware", "token", null);
        const { status, body } = CLIENT_AUTH_RESPONSES.internal;
        return res.status(status).json(body);
    }
    const invalid = () => {
        const { status, body } = CLIENT_AUTH_RESPONSES.tokenInvalid;
        return res.status(status).json(body);
    };
    const match = /^Bearer ([^ ]+)$/.exec(authHeader);
    if (!match) {
        return invalid();
    }
    const token = match[1];
    // Enrollment-scoped token first: it is the only token with the
    // mfa-enroll purpose, and a session JWT never carries it. The
    // token is bound to the credential login verified (a SHA-256
    // digest of the password hash); the account's current password
    // hash is re-read and compared, so a password reset or change
    // after the token was issued invalidates it.
    const enroll = verifyMfaEnrollToken(token);
    if (enroll) {
        try {
            const userRow = await pool.query(
                "SELECT password_hash FROM users WHERE id = $1", [enroll.userId]);
            const current = userRow.rows[0];
            if (!current || digestPasswordHash(current.password_hash) !== enroll.passwordHashDigest) {
                return invalid();
            }
        } catch (error) {
            logAuthFailure("mfaEnrollMiddleware", "database", error);
            const { status, body } = CLIENT_AUTH_RESPONSES.internal;
            return res.status(status).json(body);
        }
        req.user = { userId: enroll.userId, mfaEnroll: true };
        return next();
    }
    // Session JWT: same verification as authenticateToken, including
    // the live session row. A token with any other purpose claim (or
    // a malformed payload) fails the sid check below.
    let user;
    try {
        user = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ["HS256"], issuer: "gnosis", audience: "gnosis-api",
        });
        if (!Number.isInteger(user.userId) || typeof user.sid !== "string"
            || !/^[a-f0-9-]{36}$/.test(user.sid)) {
            return invalid();
        }
    } catch {
        return invalid();
    }
    try {
        const result = await pool.query(
            `SELECT id FROM auth_sessions
             WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()`,
            [user.sid, user.userId]);
        if (!result.rows[0]) {
            return invalid();
        }
        req.user = { userId: user.userId, sid: user.sid, mfaEnroll: false };
        return next();
    } catch (error) {
        logAuthFailure("mfaEnrollMiddleware", "database", error);
        const { status, body } = CLIENT_AUTH_RESPONSES.internal;
        return res.status(status).json(body);
    }
};

module.exports = authenticateMfaEnroll;
