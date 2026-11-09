// Stored passkey records. Only the credential ID and the public key
// ever leave this module toward the WebAuthn library; the list
// response omits key material entirely (there is no reason to send it
// to the client), and no credential ID, public key, challenge, or
// ceremony payload is ever logged anywhere in this module.
//
// Counter policy (WebAuthn §6.1, "signature counter" guidance):
// the authenticator's counter must only move forward. Authenticators
// that do not support counters report 0, so a 0 on either side is an
// unsupported counter, not a regression. A real regression — the
// stored counter is positive, the new counter is positive, and the
// new one is not greater — means the credential may have been cloned:
// the credential is flagged, the login is rejected, and the flagged
// credential can never log in again until the user removes it and
// re-registers.

const pool = require("../db/db");

function mapStoredPasskey(row) {
    return {
        id: row.id,
        userId: row.user_id,
        credentialId: row.credential_id,
        // node-pg returns BIGINT as a string; the counter is a
        // 32-bit authenticator value, so Number() is exact here.
        counter: Number(row.counter),
        transports: row.transports || [],
        backedUp: row.backed_up,
        label: row.label,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        flaggedAt: row.flagged_at,
    };
}

function mapPublicKey(row) {
    return Buffer.from(row.public_key, "base64url");
}

// 'ok' — accept and store the new counter. 'ignore' — the
// authenticator reports no usable counter; accept without storing
// one. 'regression' — reject and flag the credential.
function counterOutcome(storedCounter, newCounter) {
    if (storedCounter > 0 && newCounter > 0 && newCounter <= storedCounter) {
        return "regression";
    }
    if (newCounter > 0) return "ok";
    return "ignore";
}

async function listPasskeys(userId) {
    const result = await pool.query(
        `SELECT id, user_id, credential_id, counter, transports, backed_up,
                label, created_at, last_used_at, flagged_at
         FROM user_passkeys WHERE user_id = $1 ORDER BY created_at`,
        [userId],
    );
    return result.rows.map(mapStoredPasskey);
}

async function countPasskeys(userId) {
    const result = await pool.query(
        "SELECT COUNT(*)::int AS count FROM user_passkeys WHERE user_id = $1",
        [userId],
    );
    return result.rows[0].count;
}

async function getPasskeyById(userId, id) {
    const result = await pool.query(
        `SELECT id, user_id, credential_id, counter, transports, backed_up,
                label, created_at, last_used_at, flagged_at
         FROM user_passkeys WHERE id = $1 AND user_id = $2`,
        [id, userId],
    );
    return result.rows[0] ? mapStoredPasskey(result.rows[0]) : null;
}

async function getPasskeyByCredentialId(credentialId) {
    const result = await pool.query(
        `SELECT id, user_id, credential_id, public_key, counter, transports,
                backed_up, label, created_at, last_used_at, flagged_at
         FROM user_passkeys WHERE credential_id = $1`,
        [credentialId],
    );
    if (!result.rows[0]) return null;
    const stored = mapStoredPasskey(result.rows[0]);
    stored.publicKey = mapPublicKey(result.rows[0]);
    return stored;
}

async function insertPasskey(userId, credential) {
    const result = await pool.query(
        `INSERT INTO user_passkeys
            (user_id, credential_id, public_key, counter, transports, backed_up, label)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, user_id, credential_id, counter, transports, backed_up,
                   label, created_at, last_used_at, flagged_at`,
        [
            userId,
            credential.id,
            Buffer.from(credential.publicKey).toString("base64url"),
            credential.counter,
            credential.transports || [],
            credential.backedUp,
            credential.label,
        ],
    );
    return mapStoredPasskey(result.rows[0]);
}

async function updateCounterAndLastUsed(credentialId, newCounter) {
    await pool.query(
        `UPDATE user_passkeys SET counter = $2, last_used_at = now()
         WHERE credential_id = $1`,
        [credentialId, newCounter],
    );
}

async function updateLastUsed(credentialId) {
    await pool.query(
        "UPDATE user_passkeys SET last_used_at = now() WHERE credential_id = $1",
        [credentialId],
    );
}

async function flagPasskey(credentialId) {
    await pool.query(
        "UPDATE user_passkeys SET flagged_at = now() WHERE credential_id = $1",
        [credentialId],
    );
}

async function renamePasskey(userId, id, label) {
    const result = await pool.query(
        `UPDATE user_passkeys SET label = $3 WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, credential_id, counter, transports, backed_up,
                   label, created_at, last_used_at, flagged_at`,
        [id, userId, label],
    );
    return result.rows[0] ? mapStoredPasskey(result.rows[0]) : null;
}

async function removePasskey(userId, id) {
    const result = await pool.query(
        "DELETE FROM user_passkeys WHERE id = $1 AND user_id = $2",
        [id, userId],
    );
    return result.rowCount === 1;
}

module.exports = {
    counterOutcome,
    listPasskeys,
    countPasskeys,
    getPasskeyById,
    getPasskeyByCredentialId,
    insertPasskey,
    updateCounterAndLastUsed,
    updateLastUsed,
    flagPasskey,
    renamePasskey,
    removePasskey,
};
