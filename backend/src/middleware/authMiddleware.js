const jwt = require("jsonwebtoken");
const pool = require("../db/db");
const { isStrongSecret } = require("../utils/secretStrength");
const { getAdminEmails, isAdminEmail } = require("../utils/adminAuth");
const { CLIENT_AUTH_RESPONSES, logAuthFailure } = require("../utils/authErrors");

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if(!authHeader) {
        const { status, body } = CLIENT_AUTH_RESPONSES.tokenRequired;
        return res.status(status).json(body);
    }

    // A missing or too-weak server secret is a server configuration
    // failure, never an invalid client token: answer 500 instead of a
    // misleading 403. This also covers importing app.js independently
    // of server.js, whose startup check cannot run in that case.
    // Strength (audit N06) is checked here as well as at boot, so a
    // weak secret can never silently serve requests.
    if(!isStrongSecret(process.env.JWT_SECRET)) {
        logAuthFailure("authMiddleware", "token", null);
        const { status, body } = CLIENT_AUTH_RESPONSES.internal;
        return res.status(status).json(body);
    }

    const invalid = () => {
        const { status, body } = CLIENT_AUTH_RESPONSES.tokenInvalid;
        return res.status(status).json(body);
    };
    let user;
    try {
        const match = /^Bearer ([^ ]+)$/.exec(authHeader);
        if (!match) return invalid();
        user = jwt.verify(match[1], process.env.JWT_SECRET, {
            algorithms: ['HS256'], issuer: 'gnosis', audience: 'gnosis-api'
        });
        if (!Number.isInteger(user.userId) || typeof user.sid !== 'string'
            || !/^[a-f0-9-]{36}$/.test(user.sid)) return invalid();
    } catch {
        return invalid();
    }
    try {
        const result = await pool.query(`SELECT id, mfa_verified, mfa_generation FROM auth_sessions
            WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()`, [user.sid, user.userId]);
        if (!result.rows[0]) return invalid();
        // Admin-mandatory MFA (design §9), enforced throughout
        // authenticated session use — not only at login. If the
        // account is an admin (ADMIN_EMAILS) and MFA is not
        // enrolled, the session is refused: an admin who disables
        // MFA (blocked at disableMfa, but also if the factor is
        // removed by any other path) or an account that becomes an
        // admin after login (ADMIN_EMAILS changed) cannot keep
        // using an existing session without MFA. The check is one
        // indexed lookup per request, and only runs when admins are
        // configured at all (an empty ADMIN_EMAILS means no admins,
        // so no query is needed); a missing user_mfa row means not
        // enrolled.
        if (getAdminEmails().size > 0) {
            const adminCheck = await pool.query(
                `SELECT u.email, m.enrolled, m.mfa_generation FROM users u
                 LEFT JOIN user_mfa m ON m.user_id = u.id WHERE u.id = $1`,
                [user.userId]);
            const adminRow = adminCheck.rows[0];
            if (adminRow && isAdminEmail(adminRow.email) && (adminRow.enrolled !== true || result.rows[0].mfa_verified !== true
                || !result.rows[0].mfa_generation || result.rows[0].mfa_generation !== adminRow.mfa_generation)) {
                return res.status(403).json({
                    error: "Multi-factor authentication is required for this account.",
                    code: "MFA_ENROLLMENT_REQUIRED",
                });
            }
        }
        req.user = user;
        return next();
    } catch (error) {
        logAuthFailure('authMiddleware', 'database', error);
        const { status, body } = CLIENT_AUTH_RESPONSES.internal;
        return res.status(status).json(body);
    }
};
module.exports = authenticateToken;
