const jwt = require("jsonwebtoken");
const pool = require("../db/db");
const { CLIENT_AUTH_RESPONSES, logAuthFailure } = require("../utils/authErrors");

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if(!authHeader) {
        const { status, body } = CLIENT_AUTH_RESPONSES.tokenRequired;
        return res.status(status).json(body);
    }

    // A missing server secret is a server configuration failure, never an
    // invalid client token: answer 500 instead of a misleading 403. This
    // also covers importing app.js independently of server.js, whose
    // startup check cannot run in that case.
    if(!process.env.JWT_SECRET) {
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
        const result = await pool.query(`SELECT id FROM auth_sessions
            WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()`, [user.sid, user.userId]);
        if (!result.rows[0]) return invalid();
        req.user = user;
        return next();
    } catch (error) {
        logAuthFailure('authMiddleware', 'database', error);
        const { status, body } = CLIENT_AUTH_RESPONSES.internal;
        return res.status(status).json(body);
    }
};
module.exports = authenticateToken;
