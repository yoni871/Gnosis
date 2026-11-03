const express = require("express");
const pool = require("../db/db");
const bcrypt = require("bcrypt");
const router = express.Router();
const jwt = require("jsonwebtoken");
const authenticateToken = require("../middleware/authMiddleware");
const { resolveAuthError, internalErrorBody, logAuthFailure } = require("../utils/authErrors");
const { validateRegisterInput, validateLoginInput, VALIDATION_CODE } = require("../utils/authValidation");
const { createRateLimitMiddleware } = require("../utils/rateLimit");

// Issue #3: validation runs as middleware, before the limiter and before
// any hashing or database access. Only the validated (trimmed) values
// below ever reach bcrypt or the query. Validation failures are not
// logged: they are ordinary client errors, and logging them could record
// submitted values. Because validation runs first, invalid input never
// creates a rate-limit reservation and never counts.
function validateRegister(req, res, next) {
    const validation = validateRegisterInput(req.body);
    if (validation.error) {
        return res.status(400).json({ error: validation.error, code: VALIDATION_CODE });
    }
    req.validated = validation.value;
    return next();
}

function validateLogin(req, res, next) {
    const validation = validateLoginInput(req.body);
    if (validation.error) {
        return res.status(400).json({ error: validation.error, code: VALIDATION_CODE });
    }
    req.validated = validation.value;
    return next();
}

// Issue #4: rate limiting runs after validation and before the handler.
// Login is limited per (IP + submitted email) and per IP across accounts;
// registration is limited per IP. The submitted email (not a looked-up
// account) keys the per-email policy, so unknown-email failures count
// exactly like wrong-password failures.
const loginRateLimit = createRateLimitMiddleware([
    { policy: "login_ip_email", fields: (req, ip) => [ip, req.validated.email] },
    { policy: "login_ip", fields: (req, ip) => [ip] },
], "login");

const registerRateLimit = createRateLimitMiddleware([
    { policy: "register_ip", fields: (req, ip) => [ip] },
], "register");

// Guarantees a reservation is always settled. Handlers finalize
// explicitly on every path; this wrapper covers the rest: an unexpected
// throw is an internal error and releases, while a handler that somehow
// returns without declaring an outcome counts (fail closed).
function withRateLimitFinalize(handler) {
    return async (req, res, next) => {
        try {
            await handler(req, res, next);
            if (req.rateLimit && !req.rateLimit.isFinalized()) {
                await req.rateLimit.finalize("count");
            }
        } catch (error) {
            if (req.rateLimit) {
                await req.rateLimit.finalize("release");
            }
            throw error;
        }
    };
}


//to register an account
router.post("/register", validateRegister, registerRateLimit, withRateLimitFinalize(async (req, res) => {
    const { firstName, lastName, email, password } = req.validated;

    // Hashing failures are internal errors for issue #5. Missing or
    // malformed input is rejected above by issue #3 validation and never
    // reaches this point.
    let hashedPassword;
    try {
        hashedPassword = await bcrypt.hash(password, 10);
    } catch (error) {
        logAuthFailure("POST /api/auth/register", "password", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("register"));
    }

    try {
        const result = await pool.query(
            `
            INSERT INTO users(first_name, last_name, email, password_hash)
            VALUES ($1, $2, $3, $4)
            RETURNING id, first_name, last_name, email
            `,
            [firstName, lastName, email, hashedPassword]
        );
        // Registration successes count toward the per-IP limit, as do
        // duplicate-email (409) attempts below.
        await req.rateLimit.finalize("count");
        res.json(result.rows[0]);
    } catch (error) {
        logAuthFailure("POST /api/auth/register", "database", error);
        const { status, body } = resolveAuthError(error, "register");
        await req.rateLimit.finalize(status === 409 ? "count" : "release");
        return res.status(status).json(body);
    }
}));


//to login into an exisitng account
router.post("/login", validateLogin, loginRateLimit, withRateLimitFinalize(async (req, res) => {
    const { email, password } = req.validated;

    let result;
    try {
        result = await pool.query(
            "SELECT * FROM users WHERE email = $1",
            [email]
        );
    } catch (error) {
        logAuthFailure("POST /api/auth/login", "database", error);
        await req.rateLimit.finalize("release");
        const { status, body } = resolveAuthError(error, "login");
        return res.status(status).json(body);
    }

    if(result.rows.length === 0) {
        // Unknown-email failures count, exactly like wrong passwords.
        await req.rateLimit.finalize("count");
        return res.status(401).json({
            error:"Invalid email or password.",
            code: "INVALID_CREDENTIALS"
        })
    }

    const user = result.rows[0];

    // Previously these two awaits ran inside the pool.query callback, so a
    // throw (bad password argument, corrupt stored hash, missing JWT
    // secret) escaped every catch and could crash the process. They now
    // run inside this handler's own try/catch and become controlled 500s.
    let passwordMatch;
    try {
        passwordMatch = await bcrypt.compare(password, user.password_hash);
    } catch (error) {
        logAuthFailure("POST /api/auth/login", "password", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("login"));
    }

    if(!passwordMatch) {
        await req.rateLimit.finalize("count");
        return res.status(401).json({
            error: "Invalid email or password.",
            code: "INVALID_CREDENTIALS"
        });
    }

    let token;
    try {
        token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );
    } catch (error) {
        logAuthFailure("POST /api/auth/login", "token", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("login"));
    }

    // Login successes do not count and do not reset prior failures.
    await req.rateLimit.finalize("release");
    res.json({
        token: token
    });
}));


//to get the profile of the currently logged in user
// Issue #4: profile reads are intentionally unthrottled.
router.get("/profile", authenticateToken, async (req, res) => {
    //get the id of the currently authenticated user
    const userId = req.user.userId;

    //find the user's profile in the database
    try {
        const result = await pool.query(
            `
            SELECT id, first_name, last_name, email
            FROM users
            WHERE id = $1
            `,
            [userId]
        );
        //return the user's profile
        // Preserved as-is for issue #5 (decision D2): when the token's user
        // no longer exists, this still returns the same empty 200 response
        // as before. That quirk is tracked as a follow-up, not changed here.
        res.json(result.rows[0]);
    } catch (error) {
        logAuthFailure("GET /api/auth/profile", "database", error);
        const { status, body } = resolveAuthError(error, "profile");
        return res.status(status).json(body);
    }
});

module.exports = router;
