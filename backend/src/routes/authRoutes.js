const express = require("express");
const pool = require("../db/db");
const bcrypt = require("bcrypt");
const router = express.Router();
const sessions = require("../services/sessionService");
const authenticateToken = require("../middleware/authMiddleware");
const { resolveAuthError, internalErrorBody, logAuthFailure } = require("../utils/authErrors");
const { validateRegisterInput, validateLoginInput, validateEmailAddress, validateForgotPasswordInput, validateResetPasswordInput, VALIDATION_CODE } = require("../utils/authValidation");
const { createRateLimitMiddleware } = require("../utils/rateLimit");
const {
    VERIFICATION_TTL_MS,
    generateVerificationToken,
    hashVerificationToken,
    isValidVerificationTokenFormat,
} = require("../utils/verification");
const {
    PASSWORD_RESET_TTL_MS,
    generatePasswordResetToken,
    hashPasswordResetToken,
} = require("../utils/passwordReset");
const { createResendClient } = require("../utils/resendClient");

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

// Issue #9: resend takes only an email, verified with the same structural
// rule as registration; verify takes only a token, gated on its format.
// Both run before the limiter, so invalid input never counts.
function validateResend(req, res, next) {
    if (req.body === null || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "Request body must be an object.", code: VALIDATION_CODE });
    }
    const email = validateEmailAddress(req.body.email);
    if (email.error) {
        return res.status(400).json({ error: email.error, code: VALIDATION_CODE });
    }
    req.validated = { email: email.value };
    return next();
}

function validateVerify(req, res, next) {
    if (req.body === null || typeof req.body !== "object" || Array.isArray(req.body)
        || !isValidVerificationTokenFormat(req.body.token)) {
        return res.status(400).json({ error: "Verification token is invalid.", code: VALIDATION_CODE });
    }
    req.validated = { token: req.body.token };
    return next();
}

// Issue #10: forgot-password takes only an email, verified with the
// same structural rule as registration; reset-password takes a token
// and a new password. Both run before the limiter, so invalid input
// never counts.
function validateForgot(req, res, next) {
    const validation = validateForgotPasswordInput(req.body);
    if (validation.error) {
        return res.status(400).json({ error: validation.error, code: VALIDATION_CODE });
    }
    req.validated = validation.value;
    return next();
}

function validateReset(req, res, next) {
    const validation = validateResetPasswordInput(req.body);
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
//
// Issue #9: resend is limited per (IP + submitted email) and per IP, and
// the limiter runs before any account lookup, so unknown, verified, and
// unverified addresses all count identically. Verify is limited per IP.
const loginRateLimit = createRateLimitMiddleware([
    { policy: "login_ip_email", fields: (req, ip) => [ip, req.validated.email] },
    { policy: "login_ip", fields: (req, ip) => [ip] },
], "login");

const registerRateLimit = createRateLimitMiddleware([
    { policy: "register_ip", fields: (req, ip) => [ip] },
], "register");

const resendRateLimit = createRateLimitMiddleware([
    { policy: "resend_ip_email", fields: (req, ip) => [ip, req.validated.email] },
    { policy: "resend_ip", fields: (req, ip) => [ip] },
], "resend");

const verifyRateLimit = createRateLimitMiddleware([
    { policy: "verify_ip", fields: (req, ip) => [ip] },
], "verify");

// Issue #10: forgot-password mirrors resend (per-IP+email and per-IP,
// so a flood against one address cannot lock out others), and
// reset-password mirrors verify (per-IP token guessing). Both limiters
// run before any account lookup, so unknown, unverified, and verified
// addresses all count identically.
const forgotRateLimit = createRateLimitMiddleware([
    { policy: "forgot_ip_email", fields: (req, ip) => [ip, req.validated.email] },
    { policy: "forgot_ip", fields: (req, ip) => [ip] },
], "forgot");

const resetRateLimit = createRateLimitMiddleware([
    { policy: "reset_ip", fields: (req, ip) => [ip] },
], "reset");

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

// Issue #9: every invalid token shares this one body, whether the token
// is superseded, expired, nonexistent, or inconsistent with the account.
// The client learns nothing about which case it hit.
const VERIFY_INVALID_BODY = {
    error: "Invalid or expired verification link.",
    code: "INVALID_VERIFICATION_LINK",
};

// Issue #9: every resend shares this one body, whether the address is
// unknown, verified, or unverified. It never claims an email was sent.
const RESEND_GENERIC_BODY = {
    message: "If there is an unverified account for this email, a new verification link has been sent.",
};

// Issue #10: every forgot-password request shares this one body,
// whether the address is unknown, unverified, or verified. It never
// claims an email was sent, so no response can leak account state.
const FORGOT_GENERIC_BODY = {
    message: "If there is an account for this email, a password reset link has been sent.",
};

// Issue #10: every invalid reset token shares this one body, whether
// the token is superseded, expired, used, nonexistent, or inconsistent
// with the account. The client learns nothing about which case it hit.
const RESET_INVALID_BODY = {
    error: "Invalid or expired password reset link.",
    code: "INVALID_RESET_LINK",
};


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

    // Issue #9: the user row and its first verification token are created
    // in one short transaction. Either both land or neither does; the
    // transaction is closed before any network call, so no lock is ever
    // held across the Resend request below.
    const { token, tokenHash } = generateVerificationToken();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
    let client;
    try {
        client = await pool.connect();
    } catch (error) {
        logAuthFailure("POST /api/auth/register", "database", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("register"));
    }
    let user;
    try {
        await client.query("BEGIN");
        try {
            const result = await client.query(
                `
                INSERT INTO users(first_name, last_name, email, password_hash)
                VALUES ($1, $2, $3, $4)
                RETURNING id, first_name, last_name, email
                `,
                [firstName, lastName, email, hashedPassword]
            );
            user = result.rows[0];
        } catch (error) {
            await client.query("ROLLBACK").catch(() => {});
            // Duplicate email is the only client error here, exactly as
            // before: any 23505 from the user insert is the email clash.
            if (error && error.code === "23505") {
                logAuthFailure("POST /api/auth/register", "database", error);
                await req.rateLimit.finalize("count");
                return res.status(409).json({
                    error: "An account with that email already exists.",
                    code: "EMAIL_EXISTS",
                });
            }
            logAuthFailure("POST /api/auth/register", "database", error);
            await req.rateLimit.finalize("release");
            return res.status(500).json(internalErrorBody("register"));
        }
        try {
            await client.query(
                `
                INSERT INTO email_verification_tokens(user_id, token_hash, expires_at)
                VALUES ($1, $2, $3)
                `,
                [user.id, tokenHash, expiresAt]
            );
            await client.query("COMMIT");
        } catch (error) {
            // A token-insert failure rolls the whole transaction back:
            // no partial account is ever left behind.
            await client.query("ROLLBACK").catch(() => {});
            logAuthFailure("POST /api/auth/register", "database", error);
            await req.rateLimit.finalize("release");
            return res.status(500).json(internalErrorBody("register"));
        }
    } finally {
        client.release();
    }

    // Registration successes count toward the per-IP limit, as do
    // duplicate-email (409) attempts above.
    await req.rateLimit.finalize("count");
    // Email sending happens only after commit, with no lock held. A send
    // failure preserves the unverified account and changes nothing about
    // this response: the user resends for a fresh token.
    try {
        await createResendClient().sendVerificationEmail({ to: email, token });
    } catch (error) {
        logAuthFailure("POST /api/auth/register", "email", error);
    }
    // No auto-login for issue #9: the frontend shows the check-email
    // state for this address instead of a session.
    return res.json(user);
}));


//to login into an exisitng account
router.post("/login", (req, res, next) => {
    if (req.headers.origin && req.headers.origin !== new URL(process.env.FRONTEND_URL).origin) {
        return res.status(403).json({ error: "Invalid session request.", code: "SESSION_REQUEST_INVALID" });
    }
    next();
}, validateLogin, loginRateLimit, withRateLimitFinalize(async (req, res) => {
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

    // Issue #9: hard login gate. A correct password for an unverified
    // account is a controlled 403, not a credential failure, and it does
    // not count toward the login buckets: the credential was valid, and
    // the verification path has its own limits. Accounts created before
    // the #9 migration were backfilled as verified, so the gate only
    // ever fires for accounts created after it.
    if (!user.email_verified_at) {
        await req.rateLimit.finalize("release");
        return res.status(403).json({
            error: "Email not verified.",
            code: "EMAIL_NOT_VERIFIED",
        });
    }

    let session;
    try {
        session = await sessions.createSession(user.id);
    } catch (error) {
        logAuthFailure("POST /api/auth/login", "session", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("login"));
    }
    sessions.setCookie(res, session.refresh);
    res.set("Cache-Control", "no-store");

    // Login successes do not count and do not reset prior failures.
    await req.rateLimit.finalize("release");
    res.json({
        token: session.token, expiresIn: sessions.ACCESS_SECONDS
    });
}));


// Cookie endpoints require an explicit browser session request and a trusted origin.
router.post("/refresh", sessions.browserSessionRequest, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const session = await sessions.rotateSession(sessions.readCookie(req));
    if (!session) {
        sessions.clearCookie(res);
        return res.status(401).json({ error: "Session expired. Please sign in again.", code: "SESSION_INVALID" });
    }
    sessions.setCookie(res, session.refresh, session.expiresAt);
    res.json({ token: session.token, expiresIn: sessions.ACCESS_SECONDS });
});
router.post("/logout", sessions.browserSessionRequest, async (req, res) => {
    await sessions.revokeRefresh(sessions.readCookie(req));
    await sessions.revokeAccess(req.headers.authorization);
    sessions.clearCookie(res);
    res.set("Cache-Control", "no-store").sendStatus(204);
});
router.post("/logout-all", authenticateToken, async (req, res) => {
    await pool.query("UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1", [req.user.userId]);
    sessions.clearCookie(res);
    res.set("Cache-Control", "no-store").sendStatus(204);
});

//to verify an email address with a link token
// Lock order for every verify, resend, forgot, and reset transaction:
// resolve the user (or the token's user) for routing, lock the user
// row FOR UPDATE, then lock and recheck the token rows, then write and
// commit. No lock is ever held across a Resend call, and token rows
// are locked in id order, so concurrent verify/resend/forgot/reset
// pairs cannot deadlock.
router.post("/verify-email", validateVerify, verifyRateLimit, withRateLimitFinalize(async (req, res) => {
    const tokenHash = hashVerificationToken(req.validated.token);

    let tokenRow;
    try {
        const result = await pool.query(
            `
            SELECT id, user_id, expires_at, used_at, consumed_reason
            FROM email_verification_tokens
            WHERE token_hash = $1
            `,
            [tokenHash]
        );
        tokenRow = result.rows[0];
    } catch (error) {
        logAuthFailure("POST /api/auth/verify-email", "database", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("verify"));
    }

    if (!tokenRow) {
        // Unknown token: structurally valid, so it counts against the
        // verify limit, but the response is the generic one.
        await req.rateLimit.finalize("count");
        return res.status(400).json(VERIFY_INVALID_BODY);
    }

    let client;
    try {
        client = await pool.connect();
    } catch (error) {
        logAuthFailure("POST /api/auth/verify-email", "database", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("verify"));
    }
    try {
        await client.query("BEGIN");
        const userResult = await client.query(
            "SELECT id, email_verified_at FROM users WHERE id = $1 FOR UPDATE",
            [tokenRow.user_id]
        );
        const user = userResult.rows[0];
        const freshResult = await client.query(
            `
            SELECT id, expires_at, used_at, consumed_reason
            FROM email_verification_tokens
            WHERE id = $1 FOR UPDATE
            `,
            [tokenRow.id]
        );
        const current = freshResult.rows[0];
        const now = new Date();
        // Idempotent repeat success: the exact token previously consumed
        // by successful verification, while the user is verified. A
        // double-click or a re-clicked link succeeds again.
        if (user && user.email_verified_at && current && current.consumed_reason === "verified") {
            await client.query("COMMIT");
            await req.rateLimit.finalize("count");
            return res.status(200).json({ verified: true });
        }
        // Every other non-success state shares the generic response:
        // superseded, expired, missing user, or an inconsistent row
        // (used but unreasoned, or verified-reasoned without a verified
        // user) is impossible by construction and still gets no detail.
        if (!user || !current || current.consumed_reason !== null
            || new Date(current.expires_at) <= now) {
            await client.query("ROLLBACK");
            await req.rateLimit.finalize("count");
            return res.status(400).json(VERIFY_INVALID_BODY);
        }
        await client.query(
            "UPDATE users SET email_verified_at = now() WHERE id = $1",
            [user.id]
        );
        await client.query(
            `
            UPDATE email_verification_tokens
            SET used_at = now(), consumed_reason = 'verified'
            WHERE id = $1
            `,
            [current.id]
        );
        await client.query("COMMIT");
        await req.rateLimit.finalize("count");
        return res.status(200).json({ verified: true });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        logAuthFailure("POST /api/auth/verify-email", "database", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("verify"));
    } finally {
        client.release();
    }
}));


//to request a fresh verification email
router.post("/resend-verification", validateResend, resendRateLimit, withRateLimitFinalize(async (req, res) => {
    const { email } = req.validated;

    let userRow;
    try {
        const result = await pool.query(
            "SELECT id, email_verified_at FROM users WHERE email = $1",
            [email]
        );
        userRow = result.rows[0];
    } catch (error) {
        logAuthFailure("POST /api/auth/resend-verification", "database", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("resend"));
    }

    // Unknown and verified addresses share this exact response, and they
    // count exactly like unverified ones: the limiter ran before this
    // lookup, so no response can leak account state.
    if (!userRow || userRow.email_verified_at) {
        await req.rateLimit.finalize("count");
        return res.status(200).json(RESEND_GENERIC_BODY);
    }

    let client;
    try {
        client = await pool.connect();
    } catch (error) {
        logAuthFailure("POST /api/auth/resend-verification", "database", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("resend"));
    }
    let token;
    try {
        await client.query("BEGIN");
        const locked = await client.query(
            "SELECT email_verified_at FROM users WHERE id = $1 FOR UPDATE",
            [userRow.id]
        );
        if (!locked.rows[0] || locked.rows[0].email_verified_at) {
            // Verified between routing and locking: same generic response.
            await client.query("ROLLBACK");
            await req.rateLimit.finalize("count");
            return res.status(200).json(RESEND_GENERIC_BODY);
        }
        // Lock every unused token row in deterministic id order, then
        // supersede exactly the locked set. The user-row lock serializes
        // concurrent resends for this account, so both may complete and
        // send, with the later one superseding the earlier.
        await client.query(
            `
            SELECT id FROM email_verification_tokens
            WHERE user_id = $1 AND consumed_reason IS NULL
            ORDER BY id FOR UPDATE
            `,
            [userRow.id]
        );
        await client.query(
            `
            UPDATE email_verification_tokens
            SET used_at = now(), consumed_reason = 'superseded'
            WHERE user_id = $1 AND consumed_reason IS NULL
            `,
            [userRow.id]
        );
        const fresh = generateVerificationToken();
        token = fresh.token;
        await client.query(
            `
            INSERT INTO email_verification_tokens(user_id, token_hash, expires_at)
            VALUES ($1, $2, $3)
            `,
            [userRow.id, fresh.tokenHash, new Date(Date.now() + VERIFICATION_TTL_MS)]
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        logAuthFailure("POST /api/auth/resend-verification", "database", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("resend"));
    } finally {
        client.release();
    }

    // The transaction is closed before any network call: no lock is held
    // across the Resend request. A send failure preserves the account
    // and its fresh token, and the response is unchanged either way.
    await req.rateLimit.finalize("count");
    try {
        await createResendClient().sendVerificationEmail({ to: email, token });
    } catch (error) {
        logAuthFailure("POST /api/auth/resend-verification", "email", error);
    }
    return res.status(200).json(RESEND_GENERIC_BODY);
}));


//to request a password reset email
// Issue #10: only verified accounts receive a reset link. An
// unverified account cannot log in until it verifies, so a reset link
// would be useless to it — the login page's resend flow is its path.
// Unknown and unverified addresses share the exact generic response
// with verified ones, and they count exactly the same: the limiter
// ran before this lookup, so no response can leak account state.
router.post("/forgot-password", validateForgot, forgotRateLimit, withRateLimitFinalize(async (req, res) => {
    const { email } = req.validated;

    let userRow;
    try {
        const result = await pool.query(
            "SELECT id, email_verified_at FROM users WHERE email = $1",
            [email]
        );
        userRow = result.rows[0];
    } catch (error) {
        logAuthFailure("POST /api/auth/forgot-password", "database", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("forgot"));
    }

    if (!userRow || !userRow.email_verified_at) {
        await req.rateLimit.finalize("count");
        return res.status(200).json(FORGOT_GENERIC_BODY);
    }

    let client;
    try {
        client = await pool.connect();
    } catch (error) {
        logAuthFailure("POST /api/auth/forgot-password", "database", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("forgot"));
    }
    let token;
    try {
        await client.query("BEGIN");
        const locked = await client.query(
            "SELECT email_verified_at FROM users WHERE id = $1 FOR UPDATE",
            [userRow.id]
        );
        if (!locked.rows[0] || !locked.rows[0].email_verified_at) {
            // Deleted or unverified between routing and locking: same
            // generic response.
            await client.query("ROLLBACK");
            await req.rateLimit.finalize("count");
            return res.status(200).json(FORGOT_GENERIC_BODY);
        }
        // Lock every unused token row in deterministic id order, then
        // supersede exactly the locked set. The user-row lock serializes
        // concurrent forgot requests for this account, so both may
        // complete and send, with the later one superseding the earlier.
        await client.query(
            `
            SELECT id FROM password_reset_tokens
            WHERE user_id = $1 AND consumed_reason IS NULL
            ORDER BY id FOR UPDATE
            `,
            [userRow.id]
        );
        await client.query(
            `
            UPDATE password_reset_tokens
            SET used_at = now(), consumed_reason = 'superseded'
            WHERE user_id = $1 AND consumed_reason IS NULL
            `,
            [userRow.id]
        );
        const fresh = generatePasswordResetToken();
        token = fresh.token;
        await client.query(
            `
            INSERT INTO password_reset_tokens(user_id, token_hash, expires_at)
            VALUES ($1, $2, $3)
            `,
            [userRow.id, fresh.tokenHash, new Date(Date.now() + PASSWORD_RESET_TTL_MS)]
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        logAuthFailure("POST /api/auth/forgot-password", "database", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("forgot"));
    } finally {
        client.release();
    }

    // The transaction is closed before any network call: no lock is held
    // across the Resend request. A send failure preserves the account
    // and its fresh token, and the response is unchanged either way.
    await req.rateLimit.finalize("count");
    try {
        await createResendClient().sendPasswordResetEmail({ to: email, token });
    } catch (error) {
        logAuthFailure("POST /api/auth/forgot-password", "email", error);
    }
    return res.status(200).json(FORGOT_GENERIC_BODY);
}));


//to reset a password with a link token
// A successful reset sets the new password and consumes the token; any
// other still-unused token for the same account is superseded in the
// same transaction, so an older link cannot outlive the password it
// was issued against. Outstanding login sessions are NOT revoked here:
// JWTs are stateless and revocation belongs to issue #7. A reset does
// not log the user in — they sign in with the new password.
router.post("/reset-password", validateReset, resetRateLimit, withRateLimitFinalize(async (req, res) => {
    const tokenHash = hashPasswordResetToken(req.validated.token);

    let tokenRow;
    try {
        const result = await pool.query(
            `
            SELECT id, user_id, expires_at, used_at, consumed_reason
            FROM password_reset_tokens
            WHERE token_hash = $1
            `,
            [tokenHash]
        );
        tokenRow = result.rows[0];
    } catch (error) {
        logAuthFailure("POST /api/auth/reset-password", "database", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("reset"));
    }

    if (!tokenRow) {
        // Unknown token: structurally valid, so it counts against the
        // reset limit, but the response is the generic one.
        await req.rateLimit.finalize("count");
        return res.status(400).json(RESET_INVALID_BODY);
    }

    // Hashing runs before the transaction and before any lock: a hash
    // failure is an internal error, and no lock is ever held across
    // bcrypt. Only a known token reaches this point.
    let hashedPassword;
    try {
        hashedPassword = await bcrypt.hash(req.validated.password, 10);
    } catch (error) {
        logAuthFailure("POST /api/auth/reset-password", "password", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("reset"));
    }

    let client;
    try {
        client = await pool.connect();
    } catch (error) {
        logAuthFailure("POST /api/auth/reset-password", "database", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("reset"));
    }
    try {
        await client.query("BEGIN");
        const userResult = await client.query(
            "SELECT id FROM users WHERE id = $1 FOR UPDATE",
            [tokenRow.user_id]
        );
        const user = userResult.rows[0];
        const freshResult = await client.query(
            `
            SELECT id, expires_at, used_at, consumed_reason
            FROM password_reset_tokens
            WHERE id = $1 FOR UPDATE
            `,
            [tokenRow.id]
        );
        const current = freshResult.rows[0];
        const now = new Date();
        // Every non-success state shares the generic response: used,
        // superseded, expired, missing user, or an inconsistent row
        // (used but unreasoned) is impossible by construction and still
        // gets no detail. A used token is never idempotent-success here:
        // unlike verification, a replayed reset must not re-apply.
        if (!user || !current || current.consumed_reason !== null
            || new Date(current.expires_at) <= now) {
            await client.query("ROLLBACK");
            await req.rateLimit.finalize("count");
            return res.status(400).json(RESET_INVALID_BODY);
        }
        await client.query(
            "UPDATE users SET password_hash = $1 WHERE id = $2",
            [hashedPassword, user.id]
        );
        await client.query(
            `
            UPDATE password_reset_tokens
            SET used_at = now(), consumed_reason = 'used'
            WHERE id = $1
            `,
            [current.id]
        );
        await client.query(
            `
            UPDATE password_reset_tokens
            SET used_at = now(), consumed_reason = 'superseded'
            WHERE user_id = $1 AND consumed_reason IS NULL AND id <> $2
            `,
            [user.id, current.id]
        );
        await client.query("COMMIT");
        await req.rateLimit.finalize("count");
        return res.status(200).json({ reset: true });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        logAuthFailure("POST /api/auth/reset-password", "database", error);
        await req.rateLimit.finalize("release");
        return res.status(500).json(internalErrorBody("reset"));
    } finally {
        client.release();
    }
}));


//to get the profile of the currently logged in user
// Issue #4: profile reads are intentionally unthrottled.
// Issue #9: the profile gains email_verified_at (additive, informational;
// logged-in users are always verified under the hard gate).
router.get("/profile", authenticateToken, async (req, res) => {
    //get the id of the currently authenticated user
    const userId = req.user.userId;

    //find the user's profile in the database
    try {
        const result = await pool.query(
            `
            SELECT id, first_name, last_name, email, email_verified_at
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
