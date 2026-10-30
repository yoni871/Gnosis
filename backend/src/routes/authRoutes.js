const express = require("express");
const pool = require("../db/db");
const bcrypt = require("bcrypt");
const router = express.Router();
const jwt = require("jsonwebtoken");
const authenticateToken = require("../middleware/authMiddleware");
const { resolveAuthError, internalErrorBody, logAuthFailure } = require("../utils/authErrors");


//to register an account
router.post("/register", async (req, res) => {
    const { firstName, lastName, email, password } = req.body || {};

    // Hashing failures (including a missing or non-string password) are
    // internal errors for issue #5; input validation belongs to issue #3,
    // so no 400 is produced here. Previously this throw escaped the
    // handler and reached Express's default HTML error page.
    let hashedPassword;
    try {
        hashedPassword = await bcrypt.hash(password, 10);
    } catch (error) {
        logAuthFailure("POST /api/auth/register", "password", error);
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
        res.json(result.rows[0]);
    } catch (error) {
        logAuthFailure("POST /api/auth/register", "database", error);
        const { status, body } = resolveAuthError(error, "register");
        return res.status(status).json(body);
    }
});


//to login into an exisitng account
router.post("/login", async (req, res) => {
    const { email, password } = req.body || {};

    let result;
    try {
        result = await pool.query(
            "SELECT * FROM users WHERE email = $1",
            [email]
        );
    } catch (error) {
        logAuthFailure("POST /api/auth/login", "database", error);
        const { status, body } = resolveAuthError(error, "login");
        return res.status(status).json(body);
    }

    if(result.rows.length === 0) {
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
        return res.status(500).json(internalErrorBody("login"));
    }

    if(!passwordMatch) {
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
        return res.status(500).json(internalErrorBody("login"));
    }

    res.json({
        token: token
    });
});


//to get the profile of the currently logged in user
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
