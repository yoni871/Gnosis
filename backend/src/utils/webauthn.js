// WebAuthn relying-party configuration and ceremony challenge
// bookkeeping for passkeys.
//
// The relying-party ID is derived at runtime from the hostname of
// FRONTEND_URL — never hardcoded — so preview and production each
// derive their own RP ID, and a passkey registered on one origin
// cannot be replayed on another. In local development FRONTEND_URL
// is http://localhost:5173, so the RP ID is "localhost", which
// browsers accept for localhost origins.
//
// Challenges are single-use, 10-minute nonces stored in PostgreSQL
// (never in process memory, so every backend instance shares them).
// One live challenge exists per user and ceremony type: starting a
// new ceremony supersedes the previous one, the same supersede
// pattern as the verification and reset token flows. A challenge
// value is a random nonce, not a secret: it is only useful inside
// its one ceremony, inside its TTL, and only once.

const crypto = require("node:crypto");
const pool = require("../db/db");
const simpleWebAuthn = require("@simplewebauthn/server");

const RP_NAME = "Gnosis";
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_PASSKEYS_PER_USER = 10;

function relyingParty() {
    const frontend = new URL(process.env.FRONTEND_URL);
    return { rpName: RP_NAME, rpId: frontend.hostname, origin: frontend.origin };
}

// The user handle is the internal user id as bytes: opaque, stable
// across registrations, and never personal data.
function userHandle(userId) {
    return Buffer.from(String(userId), "utf8");
}

// The browser echoes the user handle back in the assertion response.
// It must decode to the user the challenge was issued for.
function userHandleMatches(handle, userId) {
    if (typeof handle !== "string" || handle.length === 0) return false;
    let decoded;
    try {
        decoded = Buffer.from(handle, "base64url").toString("utf8");
    } catch {
        return false;
    }
    return decoded === String(userId);
}

async function createChallenge(userId, type) {
    const challenge = crypto.randomBytes(32).toString("base64url");
    // Supersede any live challenge for this user and ceremony, then
    // drop expired rows for the account (bounded, so a flood of
    // abandoned ceremonies cannot grow this table without bound).
    await pool.query(
        "DELETE FROM webauthn_challenges WHERE user_id = $1 AND type = $2 AND used_at IS NULL",
        [userId, type],
    );
    await pool.query(
        `DELETE FROM webauthn_challenges WHERE id IN (
            SELECT id FROM webauthn_challenges
            WHERE user_id = $1 AND expires_at < now() LIMIT 100
        )`,
        [userId],
    );
    await pool.query(
        `INSERT INTO webauthn_challenges(user_id, type, challenge, expires_at)
         VALUES ($1, $2, $3, now() + ($4 * INTERVAL '1 millisecond'))`,
        [userId, type, challenge, CHALLENGE_TTL_MS],
    );
    return challenge;
}

// Claim a challenge exactly once. The UPDATE ... RETURNING makes a
// concurrent second use lose: only the first claim returns a row.
async function consumeChallenge(userId, type, challenge) {
    if (typeof challenge !== "string" || challenge.length === 0) return false;
    const result = await pool.query(
        `UPDATE webauthn_challenges SET used_at = now()
         WHERE user_id = $1 AND type = $2 AND challenge = $3
           AND used_at IS NULL AND expires_at > now()
         RETURNING id`,
        [userId, type, challenge],
    );
    return result.rows.length === 1;
}

// Find the live challenge a login ceremony was started with, without
// consuming it: the finish step consumes it only after deciding the
// ceremony is well-formed, so a malformed finish cannot burn a
// challenge the user may still complete.
async function findLoginChallenge(challenge) {
    if (typeof challenge !== "string" || challenge.length === 0) return null;
    const result = await pool.query(
        `SELECT user_id FROM webauthn_challenges
         WHERE type = 'authentication' AND challenge = $1
           AND used_at IS NULL AND expires_at > now()`,
        [challenge],
    );
    return result.rows[0] || null;
}

// The SimpleWebAuthn calls go through these thin wrappers (plain
// data properties on this module's exports) so unit tests can
// substitute the verify functions. The library's own exports are
// getter-only properties, which node:test cannot mock.
async function registrationOptions(options) {
    return simpleWebAuthn.generateRegistrationOptions(options);
}
async function verifyRegistration(options) {
    return simpleWebAuthn.verifyRegistrationResponse(options);
}
async function authenticationOptions(options) {
    return simpleWebAuthn.generateAuthenticationOptions(options);
}
async function verifyAuthentication(options) {
    return simpleWebAuthn.verifyAuthenticationResponse(options);
}

module.exports = {
    RP_NAME,
    CHALLENGE_TTL_MS,
    MAX_PASSKEYS_PER_USER,
    relyingParty,
    userHandle,
    userHandleMatches,
    createChallenge,
    consumeChallenge,
    findLoginChallenge,
    registrationOptions,
    verifyRegistration,
    authenticationOptions,
    verifyAuthentication,
};
