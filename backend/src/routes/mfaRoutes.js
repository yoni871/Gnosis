// TOTP MFA routes for roadmap T2.1–T2.3.
//
// Endpoints:
//   GET  /api/auth/mfa/status                  enrolled state
//   POST /api/auth/mfa/enroll                 start enrollment (secret, once)
//   POST /api/auth/mfa/enroll/confirm         confirm with a valid code
//   POST /api/auth/mfa/verify                 complete login (challenge + code)
//   POST /api/auth/mfa/recovery-codes/regenerate
//   POST /api/auth/mfa/disable
//
// A TOTP secret is never returned after enrollment completes, a
// recovery code is never returned after it is issued, and no code,
// secret, token, or password is ever logged: failures log route +
// kind + database code only (authErrors.js discipline). Audit events
// are marked AUDIT at the service layer for the PR #78 rebase; this
// router writes no audit rows itself.

const express = require("express");
const pool = require("../db/db");
const router = express.Router();
const sessions = require("../services/sessionService");
const authenticateToken = require("../middleware/authMiddleware");
const { internalErrorBody, logAuthFailure } = require("../utils/authErrors");
const { VALIDATION_CODE } = require("../utils/authValidation");
const { createRateLimitMiddleware } = require("../utils/rateLimit");
const { isValidMfaChallengeTokenFormat } = require("../utils/mfaChallenge");
const { isTotpCodeFormat } = require("../utils/mfaTotp");
const { isRecoveryCodeFormat } = require("../utils/mfaRecoveryCodes");
const mfa = require("../services/mfaService");
const { MfaUnavailableError } = mfa;

// MFA is optional, so a missing encryption key is a controlled 503,
// never a boot failure and never a bypass: enrollment and MFA login
// cannot proceed without it.
const MFA_UNAVAILABLE_BODY = {
    error: "Two-factor authentication is unavailable right now. Please try again later.",
    code: "MFA_UNAVAILABLE",
};

// One generic body for every failed second-factor attempt: unknown,
// expired, or already-used challenge and wrong TOTP or recovery code
// are indistinguishable to the caller.
const INVALID_MFA_CODE_BODY = {
    error: "Invalid verification code.",
    code: "INVALID_MFA_CODE",
};

const INVALID_MFA_CREDENTIALS_BODY = {
    error: "Invalid password or verification code.",
    code: "INVALID_MFA_CREDENTIALS",
};

function noStore(res) {
    res.set("Cache-Control", "no-store");
    return res;
}

function invalidBody(message) {
    return { error: message, code: VALIDATION_CODE };
}

function isObjectBody(body) {
    return body !== null && typeof body === "object" && !Array.isArray(body);
}

function validateVerify(req, res, next) {
    if (!isObjectBody(req.body) || !isValidMfaChallengeTokenFormat(req.body.challenge)
        || (typeof req.body.code !== "string"
            || (!isTotpCodeFormat(req.body.code) && !isRecoveryCodeFormat(req.body.code)))) {
        return res.status(400).json(invalidBody("Invalid verification request."));
    }
    req.validated = { challenge: req.body.challenge, code: req.body.code };
    return next();
}

function validateTotpCode(req, res, next) {
    if (!isObjectBody(req.body) || !isTotpCodeFormat(req.body.code)) {
        return res.status(400).json(invalidBody("A 6-digit verification code is required."));
    }
    req.validated = { code: req.body.code };
    return next();
}

function validatePasswordCode(req, res, next) {
    if (!isObjectBody(req.body) || typeof req.body.password !== "string"
        || req.body.password === ""
        || (typeof req.body.code !== "string"
            || (!isTotpCodeFormat(req.body.code) && !isRecoveryCodeFormat(req.body.code)))) {
        return res.status(400).json(invalidBody("A password and a verification code are required."));
    }
    req.validated = { password: req.body.password, code: req.body.code };
    return next();
}

function validatePasswordTotp(req, res, next) {
    if (!isObjectBody(req.body) || typeof req.body.password !== "string"
        || req.body.password === "" || !isTotpCodeFormat(req.body.code)) {
        return res.status(400).json(invalidBody("A password and a 6-digit verification code are required."));
    }
    req.validated = { password: req.body.password, code: req.body.code };
    return next();
}

// TOTP verification attempts are rate-limited like the verify
// endpoint: 30/15 min per IP, 5/15 min per IP + challenge. A wrong
// code counts; a success or an internal failure does not.
const verifyRateLimit = createRateLimitMiddleware([
    { policy: "mfa_verify_ip", fields: (req, ip) => [ip] },
    { policy: "mfa_verify_ip_challenge", fields: (req, ip) => [ip, req.validated.challenge] },
], "mfa");

// Authenticated code endpoints share one per-user+IP bucket (5/15
// min): enroll confirm, regenerate, disable. A wrong code counts;
// a success or an internal failure does not.
const codeRateLimit = createRateLimitMiddleware([
    { policy: "mfa_code_ip_user", fields: (req, ip) => [ip, String(req.user.userId)] },
], "mfa");

// Mirrors authRoutes.withRateLimitFinalize: handlers finalize
// explicitly on every path; this wrapper covers the rest.
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

function handleMfaError(route, error, req, res) {
    if (error instanceof MfaUnavailableError) {
        if (req.rateLimit) {
            req.rateLimit.finalize("release").catch(() => {});
        }
        return noStore(res).status(503).json(MFA_UNAVAILABLE_BODY);
    }
    logAuthFailure(route, "database", error);
    if (req.rateLimit) {
        req.rateLimit.finalize("release").catch(() => {});
    }
    return noStore(res).status(500).json(internalErrorBody("mfa"));
}

router.get("/status", authenticateToken, async (req, res) => {
    try {
        const status = await mfa.getMfaStatus(pool, req.user.userId);
        return noStore(res).json(status);
    } catch (error) {
        logAuthFailure("GET /api/auth/mfa/status", "database", error);
        return noStore(res).status(500).json(internalErrorBody("mfa"));
    }
});

router.post("/enroll", authenticateToken, async (req, res) => {
    let userRow;
    try {
        const result = await pool.query("SELECT email FROM users WHERE id = $1", [req.user.userId]);
        userRow = result.rows[0];
    } catch (error) {
        return handleMfaError("POST /api/auth/mfa/enroll", error, req, res);
    }
    if (!userRow) {
        return noStore(res).status(500).json(internalErrorBody("mfa"));
    }
    try {
        const status = await mfa.getMfaStatus(pool, req.user.userId);
        if (status.enrolled) {
            return noStore(res).status(409).json({
                error: "Two-factor authentication is already enabled. Disable it before setting up a new authenticator.",
                code: "MFA_ALREADY_ENROLLED",
            });
        }
        const enrollment = await mfa.startEnrollment(pool, req.user.userId, userRow.email);
        return noStore(res).json(enrollment);
    } catch (error) {
        return handleMfaError("POST /api/auth/mfa/enroll", error, req, res);
    }
});

router.post("/enroll/confirm", authenticateToken, validateTotpCode, codeRateLimit,
    withRateLimitFinalize(async (req, res) => {
        let result;
        try {
            result = await mfa.confirmEnrollment(pool, req.user.userId, req.validated.code);
        } catch (error) {
            return handleMfaError("POST /api/auth/mfa/enroll/confirm", error, req, res);
        }
        if (!result.ok) {
            if (result.reason === "code") {
                await req.rateLimit.finalize("count");
                return noStore(res).status(401).json(INVALID_MFA_CODE_BODY);
            }
            await req.rateLimit.finalize("release");
            if (result.reason === "already-enrolled") {
                return noStore(res).status(409).json({
                    error: "Two-factor authentication is already enabled.",
                    code: "MFA_ALREADY_ENROLLED",
                });
            }
            return noStore(res).status(400).json({
                error: "No authenticator setup in progress.",
                code: "MFA_ENROLLMENT_NOT_FOUND",
            });
        }
        await req.rateLimit.finalize("release");
        return noStore(res).json({ enrolled: true, recoveryCodes: result.recoveryCodes });
    }));

// Completes a login for an MFA-enrolled account. The challenge token
// is the login response's bearer credential for this step only: it
// grants nothing without a valid code, expires in 10 minutes, and is
// consumed on success. The Origin check mirrors login: a mismatched
// Origin is a controlled 403, never a session.
router.post("/verify", (req, res, next) => {
    if (req.headers.origin && req.headers.origin !== new URL(process.env.FRONTEND_URL).origin) {
        return res.status(403).json({ error: "Invalid session request.", code: "SESSION_REQUEST_INVALID" });
    }
    next();
}, validateVerify, verifyRateLimit, withRateLimitFinalize(async (req, res) => {
    let result;
    try {
        result = await mfa.verifyMfaChallenge(pool, req.validated.challenge, req.validated.code);
    } catch (error) {
        return handleMfaError("POST /api/auth/mfa/verify", error, req, res);
    }
    if (!result.ok) {
        await req.rateLimit.finalize("count");
        return noStore(res).status(401).json(INVALID_MFA_CODE_BODY);
    }
    sessions.setCookie(res, result.session.refresh);
    await req.rateLimit.finalize("release");
    return noStore(res).json({ token: result.session.token, expiresIn: sessions.ACCESS_SECONDS });
}));

router.post("/recovery-codes/regenerate", authenticateToken, validatePasswordTotp, codeRateLimit,
    withRateLimitFinalize(async (req, res) => {
        let result;
        try {
            result = await mfa.regenerateRecoveryCodes(
                pool, req.user.userId, req.validated.password, req.validated.code);
        } catch (error) {
            return handleMfaError("POST /api/auth/mfa/recovery-codes/regenerate", error, req, res);
        }
        if (!result.ok) {
            await req.rateLimit.finalize("count");
            return noStore(res).status(401).json(INVALID_MFA_CREDENTIALS_BODY);
        }
        await req.rateLimit.finalize("release");
        return noStore(res).json({ recoveryCodes: result.recoveryCodes });
    }));

router.post("/disable", authenticateToken, validatePasswordCode, codeRateLimit,
    withRateLimitFinalize(async (req, res) => {
        let result;
        try {
            result = await mfa.disableMfa(pool, req.user.userId, req.validated.password, req.validated.code);
        } catch (error) {
            return handleMfaError("POST /api/auth/mfa/disable", error, req, res);
        }
        if (!result.ok) {
            await req.rateLimit.finalize("count");
            return noStore(res).status(401).json(INVALID_MFA_CREDENTIALS_BODY);
        }
        await req.rateLimit.finalize("release");
        return noStore(res).json({ disabled: true });
    }));

module.exports = router;
