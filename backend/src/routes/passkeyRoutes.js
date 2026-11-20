// WebAuthn helpers are called through the module namespace object so
// tests can substitute verification functions without private key data.

const express = require("express");
const crypto = require("node:crypto");
const pool = require("../db/db");
const { verifyPassword } = require("../utils/passwordHash");
const router = express.Router();
const sessions = require("../services/sessionService");
const authenticateToken = require("../middleware/authMiddleware");
const { internalErrorBody, logAuthFailure } = require("../utils/authErrors");
const { audit } = require("../utils/auditLog");
const {
    validateEmailAddress,
    validateLoginPassword,
    validatePasskeyLabel,
    VALIDATION_CODE,
} = require("../utils/authValidation");
const { createRateLimitMiddleware } = require("../utils/rateLimit");
const webAuthn = require("../utils/webauthn");
const { MAX_PASSKEYS_PER_USER } = webAuthn;
const passkeys = require("../services/passkeyService");

const ROUTE_REGISTER_OPTIONS = "POST /api/auth/passkeys/register/options";
const ROUTE_REGISTER_VERIFY = "POST /api/auth/passkeys/register/verify";
const ROUTE_LIST = "GET /api/auth/passkeys";
const ROUTE_RENAME = "PATCH /api/auth/passkeys/:id";
const ROUTE_REMOVE = "DELETE /api/auth/passkeys/:id";
const ROUTE_LOGIN_OPTIONS = "POST /api/auth/passkeys/login/options";
const ROUTE_LOGIN_VERIFY = "POST /api/auth/passkeys/login/verify";

// The same generic body is used for a wrong password or assertion.
const INVALID_CREDENTIALS_BODY = {
    error: "Invalid email or password.",
    code: "INVALID_CREDENTIALS",
};

const CHALLENGE_INVALID_BODY = {
    error: "Invalid or expired passkey challenge.",
    code: "PASSKEY_CHALLENGE_INVALID",
};

const PASSKEY_NOT_FOUND_BODY = {
    error: "Passkey not found.",
    code: "PASSKEY_NOT_FOUND",
};

const VERIFICATION_FAILED_BODY = {
    error: "Passkey verification failed.",
    code: "PASSKEY_VERIFICATION_FAILED",
};

function isObjectBody(body) {
    return body !== null && typeof body === "object" && !Array.isArray(body);
}

function invalidBody(res, error) {
    return res.status(400).json({ error, code: VALIDATION_CODE });
}

// Mirrors authRoutes.js: guarantees a rate-limit reservation is
// always settled. Handlers finalize explicitly on every path; this
// wrapper covers the rest.
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

// The login ceremonies set the refresh cookie, so they carry the
// same exact-Origin check as password login.
const requireSessionOrigin = sessions.browserSessionRequest;

function validateEmailBody(req, res, next) {
    const email = validateEmailAddress(req.body && req.body.email);
    if (email.error) return invalidBody(res, email.error);
    req.validated = { email: email.value };
    return next();
}

function validatePasswordBody(req, res, next) {
    if (!isObjectBody(req.body)) {
        return invalidBody(res, "Request body must be an object.");
    }
    const password = validateLoginPassword(req.body.password);
    if (password.error) return invalidBody(res, password.error);
    req.validated = { password: password.value };
    return next();
}

// A ceremony response is opaque to validation: its shape is checked
// by the WebAuthn library, and its contents are never logged. Only
// the presence of the top-level object is asserted here so a missing
// body is a controlled 400, not a library throw.
function validateCeremonyBody(req, res, next) {
    if (!isObjectBody(req.body) || !isObjectBody(req.body.response)) {
        return invalidBody(res, "Passkey response is required.");
    }
    req.validated = { response: req.body.response };
    return next();
}

// Login ceremonies share the password-login buckets: options are
// limited per (IP + submitted email) and per IP, verify per IP.
// Every options request counts, regardless of account state, so the
// rate-limit response cannot reveal whether a passkey is registered.
// Successful finish requests release their reservation.
const loginOptionsRateLimit = createRateLimitMiddleware([
    { policy: "login_ip_email", fields: (req, ip) => [ip, req.validated.email] },
    { policy: "login_ip", fields: (req, ip) => [ip] },
], "passkey-login");

const loginVerifyRateLimit = createRateLimitMiddleware([
    { policy: "login_ip", fields: (req, ip) => [ip] },
], "passkey-login");

const passwordConfirmRateLimit = createRateLimitMiddleware([
    { policy: "passkey_password_user", fields: req => [String(req.user.userId)] },
], "passkey");

async function loadAuthenticatedUser(req, res) {
    let result;
    try {
        result = await pool.query(
            "SELECT id, first_name, last_name, email, password_hash FROM users WHERE id = $1",
            [req.user.userId],
        );
    } catch (error) {
        logAuthFailure("passkey", "database", error);
        res.status(500).json(internalErrorBody("passkey"));
        return null;
    }
    const user = result.rows[0];
    if (!user) {
        // The session's user no longer exists: the token is stale.
        res.status(403).json({ error: "Invalid or expired token.", code: "TOKEN_INVALID" });
        return null;
    }
    return user;
}

async function verifyPasswordOrFail(req, res, user) {
    let match;
    try {
        match = await verifyPassword(req.validated.password, user.password_hash);
    } catch (error) {
        logAuthFailure("passkey", "password", error);
        res.status(500).json(internalErrorBody("passkey"));
        return false;
    }
    if (!match) {
        res.status(401).json(INVALID_CREDENTIALS_BODY);
        return false;
    }
    return true;
}

function publicPasskey(stored) {
    // Key material is never sent to the client: the list and
    // management responses carry only the handle, label, and dates.
    return {
        id: stored.id,
        label: stored.label,
        createdAt: stored.createdAt,
        lastUsedAt: stored.lastUsedAt,
        flaggedAt: stored.flaggedAt,
    };
}

// Decode the challenge the browser signed over. A malformed
// clientDataJSON is a controlled 400, never a throw and never a log
// of the payload.
function challengeFromResponse(response) {
    try {
        const clientData = response.response && response.response.clientDataJSON;
        if (typeof clientData !== "string" || clientData.length === 0) return null;
        const parsed = JSON.parse(Buffer.from(clientData, "base64url").toString("utf8"));
        return typeof parsed.challenge === "string" ? parsed.challenge : null;
    } catch {
        return null;
    }
}

// Register a passkey: authenticated, and the current password must
// be confirmed on the start step (the same re-auth discipline as an
// authenticated password change).
router.post("/register/options", authenticateToken, validatePasswordBody, passwordConfirmRateLimit,
    withRateLimitFinalize(async (req, res) => {
    const user = await loadAuthenticatedUser(req, res);
    if (!user) return;
    if (!(await verifyPasswordOrFail(req, res, user))) return;

    let count;
    let existing;
    try {
        count = await passkeys.countPasskeys(user.id);
        existing = await passkeys.listPasskeys(user.id);
    } catch (error) {
        logAuthFailure(ROUTE_REGISTER_OPTIONS, "database", error);
        return res.status(500).json(internalErrorBody("passkey"));
    }
    if (count >= MAX_PASSKEYS_PER_USER) {
        return res.status(400).json({
            error: `You already have the maximum number of passkeys (${MAX_PASSKEYS_PER_USER}).`,
            code: "PASSKEY_LIMIT_REACHED",
        });
    }

    const { rpName, rpId } = webAuthn.relyingParty();
    let challenge;
    try {
        challenge = await webAuthn.createChallenge(user.id, "registration");
    } catch (error) {
        logAuthFailure(ROUTE_REGISTER_OPTIONS, "database", error);
        return res.status(500).json(internalErrorBody("passkey"));
    }
    let options;
    try {
        options = await webAuthn.registrationOptions({
            rpName,
            rpID: rpId,
            userName: user.email,
            userID: webAuthn.userHandle(user.id),
            userDisplayName: `${user.first_name} ${user.last_name}`,
            // Bytes, not the base64url string: SimpleWebAuthn treats
            // a string challenge as raw text and re-encodes it, so the
            // challenge the browser signs would no longer match the
            // stored base64url value. The JSON options still carry the
            // base64url form of these same bytes.
            challenge: Buffer.from(challenge, "base64url"),
            // 'none': no attestation statement is needed (or wanted —
            // attestation would fingerprint the authenticator model).
            attestationType: "none",
            excludeCredentials: existing.map((stored) => ({ id: stored.credentialId })),
            // Registration is a sensitive action: the authenticator
            // must verify the user (biometric/PIN), not just presence.
            authenticatorSelection: { userVerification: "required", residentKey: "required" },
            timeout: 60000,
        });
    } catch (error) {
        logAuthFailure(ROUTE_REGISTER_OPTIONS, "webauthn", error);
        return res.status(500).json(internalErrorBody("passkey"));
    }
    res.set("Cache-Control", "no-store");
    return res.json(options);
}));

router.post("/register/verify", authenticateToken, validateCeremonyBody, async (req, res) => {
    const user = await loadAuthenticatedUser(req, res);
    if (!user) return;

    const labelInput = req.body.label;
    let label;
    if (labelInput === undefined || labelInput === null || labelInput === "") {
        label = "Passkey";
    } else {
        const validated = validatePasskeyLabel(labelInput);
        if (validated.error) return invalidBody(res, validated.error);
        label = validated.value;
    }

    const challenge = challengeFromResponse(req.validated.response);
    if (!challenge) return res.status(400).json(CHALLENGE_INVALID_BODY);
    let claimed;
    try {
        claimed = await webAuthn.consumeChallenge(user.id, "registration", challenge);
    } catch (error) {
        logAuthFailure(ROUTE_REGISTER_VERIFY, "database", error);
        return res.status(500).json(internalErrorBody("passkey"));
    }
    if (!claimed) return res.status(400).json(CHALLENGE_INVALID_BODY);

    const { rpId, origin } = webAuthn.relyingParty();
    let verification;
    try {
        verification = await webAuthn.verifyRegistration({
            response: req.validated.response,
            expectedChallenge: challenge,
            expectedOrigin: origin,
            expectedRPID: rpId,
            requireUserVerification: true,
        });
    } catch (error) {
        logAuthFailure(ROUTE_REGISTER_VERIFY, "verification", error);
        return res.status(400).json(VERIFICATION_FAILED_BODY);
    }
    if (!verification.verified) {
        logAuthFailure(ROUTE_REGISTER_VERIFY, "verification", null);
        return res.status(400).json(VERIFICATION_FAILED_BODY);
    }

    const { credential, credentialBackedUp } = verification.registrationInfo;
    let stored;
    try {
        stored = await passkeys.insertPasskey(user.id, {
            id: credential.id,
            publicKey: credential.publicKey,
            counter: credential.counter,
            transports: credential.transports,
            backedUp: credentialBackedUp,
            label,
        });
    } catch (error) {
        logAuthFailure(ROUTE_REGISTER_VERIFY, "database", error);
        if (error && error.code === "23505") {
            return res.status(400).json({
                error: "This passkey is already registered.",
                code: "PASSKEY_ALREADY_REGISTERED",
            });
        }
        return res.status(500).json(internalErrorBody("passkey"));
    }
    await audit(pool, "passkey.registered", user.id);
    res.set("Cache-Control", "no-store");
    return res.status(201).json(publicPasskey(stored));
});

router.get("/", authenticateToken, async (req, res) => {
    let stored;
    try {
        stored = await passkeys.listPasskeys(req.user.userId);
    } catch (error) {
        logAuthFailure(ROUTE_LIST, "database", error);
        return res.status(500).json(internalErrorBody("passkey"));
    }
    res.set("Cache-Control", "no-store");
    return res.json({ passkeys: stored.map(publicPasskey) });
});

router.patch("/:id", authenticateToken, async (req, res) => {
    if (!isObjectBody(req.body)) return invalidBody(res, "Request body must be an object.");
    const validated = validatePasskeyLabel(req.body.label);
    if (validated.error) return invalidBody(res, validated.error);
    let stored;
    try {
        stored = await passkeys.renamePasskey(req.user.userId, req.params.id, validated.value);
    } catch (error) {
        logAuthFailure(ROUTE_RENAME, "database", error);
        return res.status(500).json(internalErrorBody("passkey"));
    }
    if (!stored) return res.status(404).json(PASSKEY_NOT_FOUND_BODY);
    res.set("Cache-Control", "no-store");
    return res.json(publicPasskey(stored));
});

router.delete("/:id", authenticateToken, validatePasswordBody, passwordConfirmRateLimit,
    withRateLimitFinalize(async (req, res) => {
    const user = await loadAuthenticatedUser(req, res);
    if (!user) return;
    if (!(await verifyPasswordOrFail(req, res, user))) return;
    // Removal is always safe: passwords are mandatory at
    // registration, so password login still works after the last
    // passkey is gone. There is no passkey-only account to strand.
    let removed;
    try {
        removed = await passkeys.removePasskey(user.id, req.params.id);
    } catch (error) {
        logAuthFailure(ROUTE_REMOVE, "database", error);
        return res.status(500).json(internalErrorBody("passkey"));
    }
    if (!removed) return res.status(404).json(PASSKEY_NOT_FOUND_BODY);
    await audit(pool, "passkey.removed", user.id);
    res.set("Cache-Control", "no-store");
    return res.sendStatus(204);
}));

// Sign in with a passkey. Every structurally valid email gets the
// same discoverable-credential options shape without account IDs.
router.post("/login/options", requireSessionOrigin, validateEmailBody, loginOptionsRateLimit,
    withRateLimitFinalize(async (req, res) => {
        let userRow;
        try {
            userRow = await pool.query(
                "SELECT id FROM users WHERE email = $1",
                [req.validated.email],
            );
        } catch (error) {
            logAuthFailure(ROUTE_LOGIN_OPTIONS, "database", error);
            await req.rateLimit.finalize("release");
            return res.status(500).json(internalErrorBody("passkey"));
        }
        const userId = userRow.rows[0] && userRow.rows[0].id;
        let existing = [];
        if (userId) {
            try {
                existing = await passkeys.listPasskeys(userId);
            } catch (error) {
                logAuthFailure(ROUTE_LOGIN_OPTIONS, "database", error);
                await req.rateLimit.finalize("release");
                return res.status(500).json(internalErrorBody("passkey"));
            }
        }
        const { rpId } = webAuthn.relyingParty();
        let challenge;
        try {
            // Unknown accounts get a fresh but unpersisted challenge.
            // Every valid email receives the same options shape; only
            // a known account with a passkey can finish the ceremony.
            challenge = userId && existing.length
                ? await webAuthn.createChallenge(userId, "authentication")
                : crypto.randomBytes(32).toString("base64url");
        } catch (error) {
            logAuthFailure(ROUTE_LOGIN_OPTIONS, "database", error);
            await req.rateLimit.finalize("release");
            return res.status(500).json(internalErrorBody("passkey"));
        }
        let options;
        try {
            options = await webAuthn.authenticationOptions({
                rpID: rpId,
                // Discoverable credentials avoid exposing registered
                // credential IDs or account state in public options.
                allowCredentials: [],
                // Bytes, not the base64url string: see the
                // registration-options note above.
                challenge: Buffer.from(challenge, "base64url"),
                userVerification: "required",
                timeout: 60000,
            });
        } catch (error) {
            logAuthFailure(ROUTE_LOGIN_OPTIONS, "webauthn", error);
            await req.rateLimit.finalize("release");
            return res.status(500).json(internalErrorBody("passkey"));
        }
        await req.rateLimit.finalize("count");
        res.set("Cache-Control", "no-store");
        return res.json(options);
    }));

router.post("/login/verify", requireSessionOrigin, validateCeremonyBody, loginVerifyRateLimit,
    withRateLimitFinalize(async (req, res) => {
        const fail = async (status, body) => {
            await req.rateLimit.finalize("count");
            return res.status(status).json(body);
        };
        const challenge = challengeFromResponse(req.validated.response);
        if (!challenge) return fail(400, CHALLENGE_INVALID_BODY);
        let challengeRow;
        try {
            challengeRow = await webAuthn.findLoginChallenge(challenge);
        } catch (error) {
            logAuthFailure(ROUTE_LOGIN_VERIFY, "database", error);
            await req.rateLimit.finalize("release");
            return res.status(500).json(internalErrorBody("passkey"));
        }
        if (!challengeRow) return fail(400, CHALLENGE_INVALID_BODY);
        const userId = challengeRow.user_id;

        const credentialId = req.validated.response.id;
        if (typeof credentialId !== "string" || credentialId.length === 0) {
            return fail(401, INVALID_CREDENTIALS_BODY);
        }
        let stored;
        try {
            stored = await passkeys.getPasskeyByCredentialId(credentialId);
        } catch (error) {
            logAuthFailure(ROUTE_LOGIN_VERIFY, "database", error);
            await req.rateLimit.finalize("release");
            return res.status(500).json(internalErrorBody("passkey"));
        }
        // Unknown credential, a credential for another account, or a
        // flagged credential: all share the failed-login body.
        if (!stored || stored.userId !== userId || stored.flaggedAt) {
            return fail(401, INVALID_CREDENTIALS_BODY);
        }
        // The browser must echo the user handle the credential was
        // registered with, when it sends one at all.
        if (req.validated.response.userHandle !== undefined
            && !webAuthn.userHandleMatches(req.validated.response.userHandle, userId)) {
            return fail(401, INVALID_CREDENTIALS_BODY);
        }

        // Burn the challenge before verifying, so a failed assertion
        // cannot be replayed against the same challenge.
        let claimed;
        try {
            claimed = await webAuthn.consumeChallenge(userId, "authentication", challenge);
        } catch (error) {
            logAuthFailure(ROUTE_LOGIN_VERIFY, "database", error);
            await req.rateLimit.finalize("release");
            return res.status(500).json(internalErrorBody("passkey"));
        }
        if (!claimed) return fail(400, CHALLENGE_INVALID_BODY);

        const { rpId, origin } = webAuthn.relyingParty();
        let verification;
        try {
            // The counter is deliberately passed as 0: the library
            // checks the counter BEFORE verifying the signature, so a
            // forged assertion with a low counter would trip its
            // check. The route applies its own counter policy below,
            // only after the signature has verified — flagging an
            // unverified assertion would let anyone who knows a
            // credential ID (enumerable via login options) flag a
            // victim's credential.
            verification = await webAuthn.verifyAuthentication({
                response: req.validated.response,
                expectedChallenge: challenge,
                expectedOrigin: origin,
                expectedRPID: rpId,
                credential: {
                    id: stored.credentialId,
                    publicKey: stored.publicKey,
                    counter: 0,
                    transports: stored.transports,
                },
                requireUserVerification: true,
            });
        } catch (error) {
            logAuthFailure(ROUTE_LOGIN_VERIFY, "verification", error);
            return fail(401, INVALID_CREDENTIALS_BODY);
        }
        if (!verification.verified) {
            logAuthFailure(ROUTE_LOGIN_VERIFY, "verification", null);
            return fail(401, INVALID_CREDENTIALS_BODY);
        }

        let session;
        try {
            session = await passkeys.completeVerifiedLogin(stored, verification.authenticationInfo.newCounter,
                sessions.createPasskeySessionInTransaction);
        } catch (error) {
            logAuthFailure(ROUTE_LOGIN_VERIFY, "session", error);
            await req.rateLimit.finalize("release");
            return res.status(500).json(internalErrorBody("passkey"));
        }
        if (!session) {
            return fail(401, INVALID_CREDENTIALS_BODY);
        }
        sessions.setCookie(res, session.refresh);
        res.set("Cache-Control", "no-store");
        await audit(pool, "passkey.login", userId);
        await req.rateLimit.finalize("release");
        return res.json({ token: session.token, expiresIn: sessions.ACCESS_SECONDS });
    }));

module.exports = router;
