// TOTP MFA service for roadmap T2.1–T2.3.
//
// All database work runs through the application pool with the same
// discipline as the verification/reset flows: the user row is locked
// FOR UPDATE before any recheck, token rows are re-read under the
// lock, and password verification never runs inside a transaction. A
// TOTP code or recovery code is verified only after the challenge (or
// enrollment) row is rechecked, and the challenge is consumed in the
// same transaction that issues the session — so a consumed challenge
// can never issue twice, and a failed verify never consumes anything.
//
// Password checks use the shared passwordHash utility (PR #96):
// Argon2id and legacy bcrypt hashes both verify, so MFA flows keep
// working for accounts that already migrated to Argon2id.
//
// Failure discipline follows authErrors.js: nothing here logs a code,
// a secret, a token, or a password. Callers log route + kind + code
// only. Audit events (PR #78, security/audit-logging) are marked at
// each event point with an AUDIT comment naming the kind; this PR
// does not invent its own audit table.

const passwordHash = require("../utils/passwordHash");
const pool = require("../db/db");
const sessions = require("./sessionService");
const { isAdminEmail } = require("../utils/adminAuth");
const { digestPasswordHash } = require("../utils/mfaEnrollToken");
const { getMfaEncryptionKey, getCurrentMfaKeyVersion, getMfaEncryptionKeyForVersion, encryptTotpSecret, decryptTotpSecret } = require("../utils/mfaCrypto");
const { MFA_CHALLENGE_TTL_MS, generateMfaChallengeToken, hashMfaChallengeToken } = require("../utils/mfaChallenge");
const { generateRecoveryCodeSet, normalizeRecoveryCode, matchesRecoveryCode } = require("../utils/mfaRecoveryCodes");
const { generateTotpSecret, buildOtpAuthUrl, verifyTotpCodeStep } = require("../utils/mfaTotp");

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

// Decrypt a user_mfa row's secret using the key version recorded on
// the row (design §3.2). A row without a version (only possible before
// the key_version migration runs) is treated as version 1, the
// original key. An unknown version or a decryption failure is a
// controlled 503, never a bypass.
function decryptRowSecret(row) {
    const version = Number.isInteger(row.key_version) ? row.key_version : 1;
    const key = getMfaEncryptionKeyForVersion(version);
    if (!key) {
        throw new MfaUnavailableError();
    }
    try {
        return decryptTotpSecret(row.secret_encrypted, key);
    } catch {
        throw new MfaUnavailableError();
    }
}

// Atomically record an accepted TOTP time step (design §2 replay
// protection). Runs inside the caller's transaction, with the
// user_mfa row already locked FOR UPDATE. Returns true when the step
// is fresh (strictly after the last accepted step) and records it;
// returns false when the step was already accepted, so the caller
// rejects the code as a replay. A code is deterministic per step, so
// the same code presented again — with a fresh challenge, on another
// endpoint, or in a concurrent request — always lands on the same
// step and is caught here. The check-and-update is one statement
// under the row lock, so two concurrent requests for the same step
// cannot both pass.
async function burnTotpStep(client, userId, step) {
    const result = await client.query(
        `UPDATE user_mfa SET last_totp_step = $2, updated_at = now()
         WHERE user_id = $1 AND (last_totp_step IS NULL OR last_totp_step < $2)`,
        [userId, step]);
    return result.rowCount === 1;
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
// The row records the current key version, so a later rotation knows
// which key encrypted it (design §3.2).
//
// Atomicity: the enrolled check and the insert/update run in one
// transaction with the user row locked, including when no user_mfa row
// exists, so a concurrent request cannot reset an enrolled factor. Two
// concurrent starts for the same account serialize on the lock; the
// second sees the first's row (still unenrolled) and replaces its
// secret, which is safe — only the second secret is live. An
// already-enrolled row returns { ok: false, reason:
// "already-enrolled" } instead of touching it.
async function enrollmentAuthorizationValid(client, userId, auth, user) {
    if (!auth) return true; // Internal callers already enforce their own authorization.
    if (auth.mfaEnroll) return Number.isInteger(auth.expiresAt) && auth.expiresAt * 1000 > Date.now()
        && digestPasswordHash(user.password_hash) === auth.passwordHashDigest;
    const session = await client.query(
        "SELECT id FROM auth_sessions WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now() FOR UPDATE",
        [auth.sid, userId]);
    return !!session.rows[0];
}

async function startEnrollment(db, userId, email, auth) {
    const key = requireMfaKey();
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret, key);
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const user = await client.query("SELECT id, password_hash FROM users WHERE id = $1 FOR UPDATE", [userId]);
        if (!user.rows[0]) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "no-user" };
        }
        if (!(await enrollmentAuthorizationValid(client, userId, auth, user.rows[0]))) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "unauthorized" };
        }
        const locked = await client.query(
            "SELECT enrolled FROM user_mfa WHERE user_id = $1 FOR UPDATE", [userId]);
        if (locked.rows[0] && locked.rows[0].enrolled) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "already-enrolled" };
        }
        await client.query(
            `INSERT INTO user_mfa(user_id, secret_encrypted, key_version, enrolled, enrolled_at, updated_at)
             VALUES ($1, $2, $3, FALSE, NULL, now())
             ON CONFLICT (user_id) DO UPDATE
             SET secret_encrypted = EXCLUDED.secret_encrypted,
                 key_version = EXCLUDED.key_version,
                 enrolled = FALSE, enrolled_at = NULL, last_totp_step = NULL,
                 mfa_generation = gen_random_uuid(), updated_at = now()`,
            [userId, encrypted, getCurrentMfaKeyVersion()]
        );
        await client.query("COMMIT");
        return { ok: true, otpauthUrl: buildOtpAuthUrl({ label: email, secret }), secret };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

// Confirm enrollment with a valid code. Only then does the secret
// become active: enrolled flips true and ten fresh recovery codes are
// issued (shown once). Any unused codes from a previous enrollment
// are marked used first, so only the new set is live. A wrong code
// changes nothing.
async function confirmEnrollment(db, userId, code, auth) {
    // Fail closed early when no encryption key is configured; the
    // per-row decrypt below (decryptRowSecret) also fails closed.
    requireMfaKey();
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const locked = await client.query(
            "SELECT id, password_hash FROM users WHERE id = $1 FOR UPDATE", [userId]);
        if (!locked.rows[0]) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "no-user" };
        }
        if (!(await enrollmentAuthorizationValid(client, userId, auth, locked.rows[0]))) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "unauthorized" };
        }
        const mfa = await client.query(
            "SELECT secret_encrypted, key_version, enrolled FROM user_mfa WHERE user_id = $1 FOR UPDATE",
            [userId]);
        const row = mfa.rows[0];
        if (!row || row.enrolled) {
            await client.query("ROLLBACK");
            return { ok: false, reason: row ? "already-enrolled" : "no-enrollment" };
        }
        let secret;
        try {
            secret = decryptRowSecret(row);
        } catch {
            await client.query("ROLLBACK");
            throw new MfaUnavailableError();
        }
        const step = await verifyTotpCodeStep(secret, code);
        if (step === null || !(await burnTotpStep(client, userId, step))) {
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
//
// verifiedPasswordHash is the password hash login actually verified
// (after any Argon2id migration at login), passed in by the caller —
// never re-read here. It is atomically confirmed under the user lock:
// if the credential changed between verification and issuance (a
// password reset or change that landed in that window), the hashes
// differ and NO challenge is issued (null). A challenge must never
// be issued for a password that has since been reset. The stored
// password_hash on the challenge is the verified hash, so
// verifyMfaChallenge's later comparison also holds.
async function issueMfaChallenge(db, userId, verifiedPasswordHash) {
    if (typeof verifiedPasswordHash !== "string" || verifiedPasswordHash === "") {
        throw new TypeError("issueMfaChallenge requires the verified password hash.");
    }
    const { token, tokenHash } = generateMfaChallengeToken();
    const expiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_MS);
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const locked = await client.query(
            "SELECT id, password_hash FROM users WHERE id = $1 FOR UPDATE", [userId]);
        if (!locked.rows[0] || locked.rows[0].password_hash !== verifiedPasswordHash) {
            // No such user, or the password was reset/changed between
            // login's verification and this issuance. Issue nothing:
            // a challenge bound to a superseded credential must never
            // exist, even briefly.
            await client.query("ROLLBACK");
            return null;
        }
        // The user lock serializes issuance, verification, and cleanup.
        // Keeping only the new challenge bounds storage to one row per user.
        await client.query("DELETE FROM mfa_challenges WHERE user_id = $1", [userId]);
        await client.query(
            "INSERT INTO mfa_challenges(user_id, token_hash, password_hash, expires_at) VALUES ($1, $2, $3, $4)",
            [userId, tokenHash, verifiedPasswordHash, expiresAt]);
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
    // Fail closed early when no encryption key is configured; the
    // per-row decrypt below (decryptRowSecret) also fails closed.
    requireMfaKey();
    const tokenHash = hashMfaChallengeToken(challengeToken);
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        // Identify the owner without locking, then use the same user ->
        // challenge order as issuance and password reset.
        const owner = await client.query("SELECT user_id FROM mfa_challenges WHERE token_hash = $1", [tokenHash]);
        if (!owner.rows[0]) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "challenge" };
        }
        const userResult = await client.query(
            "SELECT id, password_hash FROM users WHERE id = $1 FOR UPDATE", [owner.rows[0].user_id]);
        const challengeResult = await client.query(
            `SELECT id, user_id, password_hash, expires_at, used_at, consumed_reason
             FROM mfa_challenges WHERE token_hash = $1 FOR UPDATE`,
            [tokenHash]);
        const challenge = challengeResult.rows[0];
        const now = new Date();
        if (!challenge || challenge.user_id !== owner.rows[0].user_id || challenge.consumed_reason !== null
            || new Date(challenge.expires_at) <= now) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "challenge" };
        }
        const user = userResult.rows[0];
        if (!user) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "challenge" };
        }
        // Password-reset race: the challenge is bound to the password
        // hash login verified (stored at issue time). If the password
        // changed or reset since — reset, change, or a transparent
        // migration that landed after the challenge was issued — the
        // hashes differ and the challenge is dead: mark it superseded
        // so it can never be retried, and issue nothing. A stale
        // challenge must never complete a login for a new password.
        if (challenge.password_hash !== user.password_hash) {
            await client.query(
                `UPDATE mfa_challenges SET used_at = now(), consumed_reason = 'superseded' WHERE id = $1`,
                [challenge.id]);
            await client.query("COMMIT");
            return { ok: false, reason: "challenge" };
        }
        const mfa = await client.query(
            "SELECT secret_encrypted, key_version, enrolled FROM user_mfa WHERE user_id = $1",
            [user.id]);
        const row = mfa.rows[0];
        if (!row || !row.enrolled) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "code" };
        }
        let secret;
        try {
            secret = decryptRowSecret(row);
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
            // TOTP replay protection: the code's time step is burned
            // atomically in this same transaction (burnTotpStep's
            // UPDATE takes the user_mfa row lock and its WHERE only
            // matches a step strictly after the last accepted one).
            // A step at or below the last accepted step was already
            // used — with this challenge, a fresh one, or on another
            // endpoint — and is rejected, so a valid code cannot be
            // replayed within its 30-second window. The burn commits
            // or rolls back with the session issuance below.
            const step = await verifyTotpCodeStep(secret, code);
            if (step !== null) {
                codeOk = await burnTotpStep(client, user.id, step);
            }
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
        // password hash under the user lock, exactly like login —
        // here it is given the hash the challenge was bound to (the
        // one login verified), so a password change that landed
        // after the binding check above still blocks issuance.
        const session = await sessions.createSessionInTransaction(client, user.id, challenge.password_hash, true);
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

// Check the account password outside any transaction (password
// verification never runs under a lock), then verify the TOTP code.
// Shared by regenerate and disable; both require the password AND a
// valid code. Uses the shared passwordHash utility so Argon2id and
// legacy bcrypt hashes both verify (PR #96).
//
// Returns the verified password hash alongside the outcome, so the
// caller can atomically re-validate it inside its own transaction:
// the hash must still match the account's current credential under
// the user lock (a password reset that landed between this check and
// the update must abort it).
async function verifyPasswordAndTotp(db, userId, password, code) {
    // Fail closed early when no encryption key is configured; the
    // per-row decrypt below (decryptRowSecret) also fails closed.
    requireMfaKey();
    const userResult = await db.query(
        "SELECT id, password_hash FROM users WHERE id = $1", [userId]);
    const user = userResult.rows[0];
    if (!user) {
        return { ok: false, reason: "no-user" };
    }
    let passwordMatch;
    try {
        passwordMatch = await passwordHash.verifyPassword(password, user.password_hash);
    } catch {
        return { ok: false, reason: "password" };
    }
    if (!passwordMatch) {
        return { ok: false, reason: "password" };
    }
    const mfa = await db.query(
        "SELECT secret_encrypted, key_version, enrolled FROM user_mfa WHERE user_id = $1", [userId]);
    const row = mfa.rows[0];
    if (!row || !row.enrolled) {
        return { ok: false, reason: "code" };
    }
    let secret;
    try {
        secret = decryptRowSecret(row);
    } catch {
        throw new MfaUnavailableError();
    }
    const step = await verifyTotpCodeStep(secret, code);
    if (step === null) {
        return { ok: false, reason: "code" };
    }
    return { ok: true, passwordHash: user.password_hash, secretEncrypted: row.secret_encrypted, keyVersion: row.key_version, step };
}

// Regenerate recovery codes: password + valid TOTP required. All
// still-unused codes are marked used first, then ten fresh codes are
// issued (shown once). The old set stops working immediately.
//
// Atomic revalidation: the password hash verified outside the
// transaction is rechecked under the user lock inside it — a password
// reset that landed between the check and this update aborts the
// regeneration (the old password must not authorize it). The TOTP
// step is burned in the same transaction, so the code cannot be
// replayed for another action.
async function regenerateRecoveryCodes(db, userId, password, code) {
    const checked = await verifyPasswordAndTotp(db, userId, password, code);
    if (!checked.ok) {
        return checked;
    }
    const codes = generateRecoveryCodeSet();
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const userLocked = await client.query(
            "SELECT password_hash FROM users WHERE id = $1 FOR UPDATE", [userId]);
        if (!userLocked.rows[0] || userLocked.rows[0].password_hash !== checked.passwordHash) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "password" };
        }
        const locked = await client.query(
            "SELECT enrolled, secret_encrypted, key_version FROM user_mfa WHERE user_id = $1 FOR UPDATE", [userId]);
        if (!locked.rows[0] || !locked.rows[0].enrolled || locked.rows[0].secret_encrypted !== checked.secretEncrypted
            || locked.rows[0].key_version !== checked.keyVersion || !(await burnTotpStep(client, userId, checked.step))) {
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
//
// Atomic revalidation: the password hash verified outside the
// transaction is rechecked under the user lock inside it — a password
// reset that landed between the check and the update aborts the
// disable (the old password must not authorize it). A recovery code
// is rechecked (still unused, under its own lock) inside the
// transaction, so a code spent by a concurrent login cannot also
// authorize a disable. A TOTP step is burned in the same transaction,
// so the code cannot be replayed for another action.
//
// Admin-mandatory MFA (design §9): an admin account may never disable
// MFA — the check runs inside the transaction, after the password
// revalidation, so a policy change (ADMIN_EMAILS) that lands between
// the check and the update is still enforced.
async function disableMfa(db, userId, password, code, sessionId) {
    // Fail closed early when no encryption key is configured; the
    // per-row decrypt below (decryptRowSecret) also fails closed.
    requireMfaKey();
    const userResult = await db.query(
        "SELECT id, password_hash FROM users WHERE id = $1", [userId]);
    const user = userResult.rows[0];
    if (!user) {
        return { ok: false, reason: "no-user" };
    }
    let passwordMatch;
    try {
        passwordMatch = await passwordHash.verifyPassword(password, user.password_hash);
    } catch {
        return { ok: false, reason: "password" };
    }
    if (!passwordMatch) {
        return { ok: false, reason: "password" };
    }
    const mfa = await db.query(
        "SELECT secret_encrypted, key_version, enrolled FROM user_mfa WHERE user_id = $1", [userId]);
    const row = mfa.rows[0];
    if (!row || !row.enrolled) {
        return { ok: false, reason: "code" };
    }
    let secret;
    try {
        secret = decryptRowSecret(row);
    } catch {
        throw new MfaUnavailableError();
    }
    const bareRecovery = normalizeRecoveryCode(code);
    let codeOk = false;
    let usedRecoveryId = null;
    let totpStep = null;
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
        totpStep = await verifyTotpCodeStep(secret, code);
        codeOk = totpStep !== null;
    }
    if (!codeOk) {
        return { ok: false, reason: "code" };
    }
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const userLocked = await client.query(
            "SELECT email, password_hash FROM users WHERE id = $1 FOR UPDATE", [userId]);
        if (!userLocked.rows[0] || userLocked.rows[0].password_hash !== user.password_hash) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "password" };
        }
        // Admin-mandatory MFA: an admin may never disable MFA. The
        // check uses the email read under the lock above, so a policy
        // change that lands before this transaction is enforced, and
        // the lock serializes it against a concurrent disable.
        if (isAdminEmail(userLocked.rows[0].email)) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "admin-required" };
        }
        const locked = await client.query(
            "SELECT enrolled, secret_encrypted, key_version FROM user_mfa WHERE user_id = $1 FOR UPDATE", [userId]);
        if (!locked.rows[0] || !locked.rows[0].enrolled || locked.rows[0].secret_encrypted !== row.secret_encrypted
            || locked.rows[0].key_version !== row.key_version) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "code" };
        }
        if (usedRecoveryId !== null) {
            // The recovery code authorizing this disable is rechecked
            // under its own lock: if a concurrent login spent it
            // first, it is already used and cannot also authorize
            // a disable.
            const codeRow = await client.query(
                "SELECT used_at FROM mfa_recovery_codes WHERE id = $1 FOR UPDATE",
                [usedRecoveryId]);
            if (!codeRow.rows[0] || codeRow.rows[0].used_at !== null) {
                await client.query("ROLLBACK");
                return { ok: false, reason: "code" };
            }
        }
        if (totpStep !== null && !(await burnTotpStep(client, userId, totpStep))) {
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
        await client.query("UPDATE auth_sessions SET mfa_verified = FALSE, mfa_generation = NULL WHERE id = $1 AND user_id = $2", [sessionId, userId]);
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
