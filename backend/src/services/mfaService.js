// TOTP MFA service for roadmap T2.1–T2.3.
//
// All database work runs through the application pool with the same
// discipline as the verification/reset flows: the user row is locked
// FOR UPDATE before any recheck, token rows are re-read under the
// lock, and bcrypt never runs inside a transaction. A TOTP code or
// recovery code is verified only after the challenge (or enrollment)
// row is rechecked, and the challenge is consumed in the same
// transaction that issues the session — so a consumed challenge can
// never issue twice, and a failed verify never consumes anything.
//
// Failure discipline follows authErrors.js: nothing here logs a code,
// a secret, a token, or a password. Callers log route + kind + code
// only. Audit events (PR #78, security/audit-logging) are marked at
// each event point with an AUDIT comment naming the kind; this PR
// does not invent its own audit table.

const bcrypt = require("bcrypt");
const pool = require("../db/db");
const sessions = require("./sessionService");
const { getMfaEncryptionKey, encryptTotpSecret, decryptTotpSecret } = require("../utils/mfaCrypto");
const { MFA_CHALLENGE_TTL_MS, generateMfaChallengeToken, hashMfaChallengeToken } = require("../utils/mfaChallenge");
const { generateRecoveryCodeSet, normalizeRecoveryCode, matchesRecoveryCode } = require("../utils/mfaRecoveryCodes");
const { generateTotpSecret, buildOtpAuthUrl, verifyTotpCode } = require("../utils/mfaTotp");

// Thrown when MFA_ENCRYPTION_KEY is absent or malformed. MFA is
// optional, so this is not a boot failure; callers translate it to a
// controlled 503 (MFA_UNAVAILABLE) and issue no session.
class MfaUnavailableError extends Error {
    constructor() {
        super("MFA is unavailable.");
        this.name = "MfaUnavailableError";
    }
}

function requireMfaKey() {
    const key = getMfaEncryptionKey();
    if (!key) {
        throw new MfaUnavailableError();
    }
    return key;
}

async function getMfaStatus(db, userId) {
    const result = await db.query("SELECT enrolled FROM user_mfa WHERE user_id = $1", [userId]);
    return { enrolled: result.rows[0] ? result.rows[0].enrolled === true : false };
}

// Begin enrollment: generate a fresh secret, store it encrypted with
// enrolled=false, and return the otpauth URL + manual secret for the
// user to scan or type into their authenticator app. The secret is
// returned exactly once, here; it is never returned again. An already
// enrolled account must disable MFA first (409 at the route).
// Re-enrolling over an abandoned unenrolled row replaces its secret.
async function startEnrollment(db, userId, email) {
    const key = requireMfaKey();
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret, key);
    await db.query(
        `INSERT INTO user_mfa(user_id, secret_encrypted, enrolled, enrolled_at, updated_at)
         VALUES ($1, $2, FALSE, NULL, now())
         ON CONFLICT (user_id) DO UPDATE
         SET secret_encrypted = EXCLUDED.secret_encrypted,
             enrolled = FALSE, enrolled_at = NULL, updated_at = now()`,
        [userId, encrypted]
    );
    return { otpauthUrl: buildOtpAuthUrl({ label: email, secret }), secret };
}

// Confirm enrollment with a valid code. Only then does the secret
// become active: enrolled flips true and ten fresh recovery codes are
// issued (shown once). Any unused codes from a previous enrollment
// are marked used first, so only the new set is live. A wrong code
// changes nothing.
async function confirmEnrollment(db, userId, code) {
    const key = requireMfaKey();
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const locked = await client.query(
            "SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
        if (!locked.rows[0]) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "no-user" };
        }
        const mfa = await client.query(
            "SELECT secret_encrypted, enrolled FROM user_mfa WHERE user_id = $1 FOR UPDATE",
            [userId]);
        const row = mfa.rows[0];
        if (!row || row.enrolled) {
            await client.query("ROLLBACK");
            return { ok: false, reason: row ? "already-enrolled" : "no-enrollment" };
        }
        let secret;
        try {
            secret = decryptTotpSecret(row.secret_encrypted, key);
        } catch {
            await client.query("ROLLBACK");
            throw new MfaUnavailableError();
        }
        if (!(await verifyTotpCode(secret, code))) {
            await client.query("ROLLBACK");
            // AUDIT (rebase onto PR #78): audit(client, "mfa.verification_failed", userId)
            return { ok: false, reason: "code" };
        }
        const codes = generateRecoveryCodeSet();
        await client.query(
            "UPDATE user_mfa SET enrolled = TRUE, enrolled_at = now(), updated_at = now() WHERE user_id = $1",
            [userId]);
        await client.query(
            "UPDATE mfa_recovery_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
            [userId]);
        for (const record of codes) {
            await client.query(
                "INSERT INTO mfa_recovery_codes(user_id, code_hash, code_salt) VALUES ($1, $2, $3)",
                [userId, record.codeHash, record.codeSalt]);
        }
        await client.query("COMMIT");
        // AUDIT (rebase onto PR #78): audit(pool, "mfa.enrolled", userId)
        return { ok: true, recoveryCodes: codes.map((record) => record.code) };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

// Issue a single-use MFA challenge for a password-verified login.
// Any still-unused challenge for the account is superseded first, so
// exactly one challenge is live. The raw token is returned to the
// caller (the login response); only its hash is stored.
async function issueMfaChallenge(db, userId) {
    const { token, tokenHash } = generateMfaChallengeToken();
    const expiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_MS);
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const locked = await client.query(
            "SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
        if (!locked.rows[0]) {
            await client.query("ROLLBACK");
            return null;
        }
        await client.query(
            `UPDATE mfa_challenges SET used_at = now(), consumed_reason = 'superseded'
             WHERE user_id = $1 AND consumed_reason IS NULL`,
            [userId]);
        await client.query(
            "INSERT INTO mfa_challenges(user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
            [userId, tokenHash, expiresAt]);
        await client.query("COMMIT");
        return token;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

// Verify a challenge + code and issue the session, atomically. The
// code is a 6-digit TOTP code or a recovery code (dispatched on
// shape); a recovery code is marked used in the same transaction. A
// failed verify consumes nothing and issues nothing. The key is
// checked first: with no encryption key, TOTP verification is
// impossible, and the whole second factor fails closed rather than
// silently degrading.
async function verifyMfaChallenge(db, challengeToken, code) {
    const key = requireMfaKey();
    const tokenHash = hashMfaChallengeToken(challengeToken);
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const challengeResult = await client.query(
            `SELECT id, user_id, expires_at, used_at, consumed_reason
             FROM mfa_challenges WHERE token_hash = $1 FOR UPDATE`,
            [tokenHash]);
        const challenge = challengeResult.rows[0];
        const now = new Date();
        if (!challenge || challenge.consumed_reason !== null
            || new Date(challenge.expires_at) <= now) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "challenge" };
        }
        const userResult = await client.query(
            "SELECT id, password_hash FROM users WHERE id = $1 FOR UPDATE",
            [challenge.user_id]);
        const user = userResult.rows[0];
        if (!user) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "challenge" };
        }
        const mfa = await client.query(
            "SELECT secret_encrypted, enrolled FROM user_mfa WHERE user_id = $1",
            [user.id]);
        const row = mfa.rows[0];
        if (!row || !row.enrolled) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "code" };
        }
        let secret;
        try {
            secret = decryptTotpSecret(row.secret_encrypted, key);
        } catch {
            await client.query("ROLLBACK");
            throw new MfaUnavailableError();
        }
        const bareRecovery = normalizeRecoveryCode(code);
        let codeOk = false;
        let usedRecoveryId = null;
        if (bareRecovery !== null) {
            const codes = await client.query(
                `SELECT id, code_hash, code_salt FROM mfa_recovery_codes
                 WHERE user_id = $1 AND used_at IS NULL ORDER BY id FOR UPDATE`,
                [user.id]);
            for (const candidate of codes.rows) {
                if (matchesRecoveryCode(bareRecovery, candidate)) {
                    codeOk = true;
                    usedRecoveryId = candidate.id;
                    break;
                }
            }
        } else {
            codeOk = await verifyTotpCode(secret, code);
        }
        if (!codeOk) {
            await client.query("ROLLBACK");
            // AUDIT (rebase onto PR #78): audit(client, "mfa.verification_failed", user.id)
            return { ok: false, reason: "code" };
        }
        await client.query(
            `UPDATE mfa_challenges SET used_at = now(), consumed_reason = 'used' WHERE id = $1`,
            [challenge.id]);
        if (usedRecoveryId !== null) {
            await client.query(
                "UPDATE mfa_recovery_codes SET used_at = now() WHERE id = $1",
                [usedRecoveryId]);
            // AUDIT (rebase onto PR #78): audit(client, "recovery_code.used", user.id)
        }
        // The session is issued inside this same transaction, so the
        // challenge consumption and the login are atomic: no session
        // without a consumed challenge, and no reusable challenge
        // after a session. createSessionInTransaction rechecks the
        // password hash under the user lock, exactly like login.
        const session = await sessions.createSessionInTransaction(client, user.id, user.password_hash);
        if (!session) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "session" };
        }
        await client.query("COMMIT");
        // AUDIT (rebase onto PR #78): audit(pool, "mfa.verified", user.id)
        return { ok: true, session };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

// Check the account password outside any transaction (bcrypt never
// runs under a lock), then verify the TOTP code. Shared by regenerate
// and disable; both require the password AND a valid code.
async function verifyPasswordAndTotp(db, userId, password, code) {
    const key = requireMfaKey();
    const userResult = await db.query(
        "SELECT id, password_hash FROM users WHERE id = $1", [userId]);
    const user = userResult.rows[0];
    if (!user) {
        return { ok: false, reason: "no-user" };
    }
    let passwordMatch;
    try {
        passwordMatch = await bcrypt.compare(password, user.password_hash);
    } catch {
        return { ok: false, reason: "password" };
    }
    if (!passwordMatch) {
        return { ok: false, reason: "password" };
    }
    const mfa = await db.query(
        "SELECT secret_encrypted, enrolled FROM user_mfa WHERE user_id = $1", [userId]);
    const row = mfa.rows[0];
    if (!row || !row.enrolled) {
        return { ok: false, reason: "code" };
    }
    let secret;
    try {
        secret = decryptTotpSecret(row.secret_encrypted, key);
    } catch {
        throw new MfaUnavailableError();
    }
    if (!(await verifyTotpCode(secret, code))) {
        return { ok: false, reason: "code" };
    }
    return { ok: true };
}

// Regenerate recovery codes: password + valid TOTP required. All
// still-unused codes are marked used first, then ten fresh codes are
// issued (shown once). The old set stops working immediately.
async function regenerateRecoveryCodes(db, userId, password, code) {
    const checked = await verifyPasswordAndTotp(db, userId, password, code);
    if (!checked.ok) {
        return checked;
    }
    const codes = generateRecoveryCodeSet();
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const locked = await client.query(
            "SELECT enrolled FROM user_mfa WHERE user_id = $1 FOR UPDATE", [userId]);
        if (!locked.rows[0] || !locked.rows[0].enrolled) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "code" };
        }
        await client.query(
            "UPDATE mfa_recovery_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
            [userId]);
        for (const record of codes) {
            await client.query(
                "INSERT INTO mfa_recovery_codes(user_id, code_hash, code_salt) VALUES ($1, $2, $3)",
                [userId, record.codeHash, record.codeSalt]);
        }
        await client.query("COMMIT");
        // AUDIT (rebase onto PR #78): audit(pool, "recovery_codes.regenerated", userId)
        return { ok: true, recoveryCodes: codes.map((record) => record.code) };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

// Disable MFA: password + a valid TOTP code OR a recovery code.
// The secret is cleared and enrollment revoked in one update, and
// all still-unused recovery codes are marked used. A recovery code
// spent here is consumed, like a login. Disabling also revokes every
// OTHER session: the device that turned MFA off keeps working, every
// other signed-in device must sign in again (same rule as a password
// change). The recovery flows (email reset / operator-assisted) revoke
// ALL sessions instead — they do not exist yet and are not part of
// this change. sessionId is the current session's id, validated as a
// 36-character UUID by authMiddleware before it reaches the route.
async function disableMfa(db, userId, password, code, sessionId) {
    const key = requireMfaKey();
    const userResult = await db.query(
        "SELECT id, password_hash FROM users WHERE id = $1", [userId]);
    const user = userResult.rows[0];
    if (!user) {
        return { ok: false, reason: "no-user" };
    }
    let passwordMatch;
    try {
        passwordMatch = await bcrypt.compare(password, user.password_hash);
    } catch {
        return { ok: false, reason: "password" };
    }
    if (!passwordMatch) {
        return { ok: false, reason: "password" };
    }
    const mfa = await db.query(
        "SELECT secret_encrypted, enrolled FROM user_mfa WHERE user_id = $1", [userId]);
    const row = mfa.rows[0];
    if (!row || !row.enrolled) {
        return { ok: false, reason: "code" };
    }
    let secret;
    try {
        secret = decryptTotpSecret(row.secret_encrypted, key);
    } catch {
        throw new MfaUnavailableError();
    }
    const bareRecovery = normalizeRecoveryCode(code);
    let codeOk = false;
    let usedRecoveryId = null;
    if (bareRecovery !== null) {
        const codes = await db.query(
            `SELECT id, code_hash, code_salt FROM mfa_recovery_codes
             WHERE user_id = $1 AND used_at IS NULL ORDER BY id`,
            [userId]);
        for (const candidate of codes.rows) {
            if (matchesRecoveryCode(bareRecovery, candidate)) {
                codeOk = true;
                usedRecoveryId = candidate.id;
                break;
            }
        }
    } else {
        codeOk = await verifyTotpCode(secret, code);
    }
    if (!codeOk) {
        return { ok: false, reason: "code" };
    }
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const locked = await client.query(
            "SELECT enrolled FROM user_mfa WHERE user_id = $1 FOR UPDATE", [userId]);
        if (!locked.rows[0] || !locked.rows[0].enrolled) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "code" };
        }
        await client.query(
            `UPDATE user_mfa SET enrolled = FALSE, enrolled_at = NULL,
             secret_encrypted = '', updated_at = now() WHERE user_id = $1`,
            [userId]);
        await client.query(
            "UPDATE mfa_recovery_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
            [userId]);
        // Revoke every other session (PR #94 changePassword precedent).
        // The current session (id = sessionId) is untouched, so the
        // device that disabled MFA stays signed in.
        await client.query(
            `UPDATE auth_sessions SET revoked_at = now()
             WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
            [userId, sessionId]);
        await client.query("COMMIT");
        // AUDIT (rebase onto PR #78): audit(pool, "mfa.removed", userId)
        // Note: usedRecoveryId is already spent above (marked used by
        // the bulk update); no separate update is needed.
        return { ok: true };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    MfaUnavailableError,
    getMfaStatus,
    startEnrollment,
    confirmEnrollment,
    issueMfaChallenge,
    verifyMfaChallenge,
    verifyPasswordAndTotp,
    regenerateRecoveryCodes,
    disableMfa,
};
