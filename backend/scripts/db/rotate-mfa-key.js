'use strict';
// Re-encrypt MFA TOTP secrets under a new encryption key (design §3.4).
//
// Operator-run, one-off, NOT an HTTP endpoint and NOT a migration:
// it reads key material from the operator's machine and must never
// run inside the app runtime. Run as the database OWNER (the app role
// holds no grant to re-encrypt secrets and must not read operator
// secrets).
//
// Usage (operator machine; keys come from the secret manager, never
// from a file, chat, or the repo):
//   MFA_ENCRYPTION_KEY=<new key K2, 64 hex or 44 base64> \
//   MFA_ENCRYPTION_KEY_PREVIOUS=<old key K1> \
//   MFA_KEY_VERSION=2 \
//   ROTATE_MFA_DATABASE_URL=<direct owner URL, sslmode=verify-full> \
//   node backend/scripts/db/rotate-mfa-key.js
//
// What it does: for every enrolled user whose user_mfa.key_version is
// the previous version (MFA_KEY_VERSION - 1), decrypt the secret with
// the previous key, re-encrypt it with the current key, and set
// key_version to the current version. Rows already at the current
// version are skipped, so the script is idempotent and resumable: a
// re-run after a failure picks up where it stopped. It processes in
// small batches, one transaction per batch, and exits non-zero on the
// first failure so the operator investigates before re-running (design
// §3.5). A row that fails to decrypt under the previous key is logged
// by user id only (never a secret or a key) and SKIPPED, not retried —
// it needs the key-loss path for that user (§4), not a retry loop.
//
// It logs only counts (total, re-encrypted, skipped, failed). It never
// prints a key, a secret, a ciphertext, or a connection string.
// Exit 0 when every enrolled row is at the current version; exit 1 on
// any failure or when the run ends with rows still un-rotated.

const { Client } = require('pg');
const { encryptTotpSecret, decryptTotpSecret } = require('../../src/utils/mfaCrypto');

const BATCH_SIZE = 50;

function parseMfaKey(value, label) {
    if (typeof value !== 'string' || value === '') {
        throw new Error(`${label} is required.`);
    }
    if (/^[a-fA-F0-9]{64}$/.test(value)) {
        return Buffer.from(value, 'hex');
    }
    if (/^[A-Za-z0-9+/]{43}=$/.test(value)) {
        const decoded = Buffer.from(value, 'base64');
        if (decoded.length === 32) {
            return decoded;
        }
    }
    throw new Error(`${label} must be 64 hex characters or 44 base64 characters (32 bytes).`);
}

function targetVersion() {
    const raw = process.env.MFA_KEY_VERSION;
    if (typeof raw !== 'string' || raw === '') {
        return 2;
    }
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed < 2) {
        throw new Error('MFA_KEY_VERSION must be an integer >= 2 for a rotation.');
    }
    return parsed;
}

function connectionConfig(value, label) {
    if (!value) throw new Error(`${label} is required.`);
    let url;
    try { url = new URL(value); } catch { throw new Error(`${label} is not a valid URL.`); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
        throw new Error(`${label} must be a PostgreSQL URL.`);
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!host || !url.pathname.slice(1) || !url.username || !url.password) {
        throw new Error(`${label} requires an explicit host, database, user, and password.`);
    }
    if (host.includes('-pooler')) {
        throw new Error(`${label} must be a direct endpoint, not a -pooler host.`);
    }
    const config = {
        host, port: Number(url.port) || 5432,
        database: decodeURIComponent(url.pathname.slice(1)),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        connectionTimeoutMillis: 60000, statement_timeout: 60000,
    };
    if (['127.0.0.1', '::1', 'localhost'].includes(host)) {
        config.ssl = false;
    } else {
        if (url.searchParams.get('sslmode') !== 'verify-full') {
            throw new Error(`${label} requires sslmode=verify-full.`);
        }
        config.ssl = { rejectUnauthorized: true };
    }
    return config;
}

async function main() {
    const currentKey = parseMfaKey(process.env.MFA_ENCRYPTION_KEY, 'MFA_ENCRYPTION_KEY');
    const previousKey = parseMfaKey(process.env.MFA_ENCRYPTION_KEY_PREVIOUS, 'MFA_ENCRYPTION_KEY_PREVIOUS');
    const target = targetVersion();
    const previous = target - 1;
    const client = new Client(connectionConfig(process.env.ROTATE_MFA_DATABASE_URL, 'ROTATE_MFA_DATABASE_URL'));
    await client.connect();
    try {
        // Neon Free computes scale to zero; warm once so the run does
        // not time out on first use.
        await client.query('SELECT 1');
        const totalResult = await client.query(
            'SELECT count(*)::int AS n FROM user_mfa WHERE enrolled = TRUE');
        const total = totalResult.rows[0].n;
        let rotated = 0;
        let skipped = 0;
        let failed = 0;
        for (;;) {
            const batch = await client.query(
                `SELECT user_id, secret_encrypted FROM user_mfa
                 WHERE enrolled = TRUE AND key_version = $1
                 ORDER BY user_id LIMIT $2`,
                [previous, BATCH_SIZE]);
            if (batch.rows.length === 0) {
                break;
            }
            for (const row of batch.rows) {
                let secret;
                try {
                    secret = decryptTotpSecret(row.secret_encrypted, previousKey);
                } catch {
                    // Undecryptable under the previous key: corrupt or
                    // encrypted under an unknown key. Log the user id
                    // only and skip; the key-loss path (§4) handles it.
                    console.error(`rotate-mfa-key: user ${row.user_id} failed to decrypt; skipped`);
                    failed += 1;
                    continue;
                }
                const encrypted = encryptTotpSecret(secret, currentKey);
                await client.query('BEGIN');
                try {
                    await client.query(
                        `UPDATE user_mfa SET secret_encrypted = $1, key_version = $2,
                         updated_at = now() WHERE user_id = $3 AND key_version = $4`,
                        [encrypted, target, row.user_id, previous]);
                    await client.query('COMMIT');
                    rotated += 1;
                } catch (error) {
                    await client.query('ROLLBACK').catch(() => {});
                    throw error;
                }
            }
        }
        const remainingResult = await client.query(
            'SELECT count(*)::int AS n FROM user_mfa WHERE enrolled = TRUE AND key_version <> $1',
            [target]);
        const remaining = remainingResult.rows[0].n;
        console.log(JSON.stringify({
            enrolled: total, rotated, skipped, failed, remaining,
            targetVersion: target,
        }));
        if (failed > 0 || remaining > 0) {
            process.exitCode = 1;
        }
    } finally {
        await client.end().catch(() => {});
    }
}

main().catch((error) => {
    console.error(`rotate-mfa-key failed: ${error.message}`);
    process.exitCode = 1;
});
