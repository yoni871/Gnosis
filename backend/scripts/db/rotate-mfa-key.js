'use strict';
// Re-encrypt MFA TOTP secrets under a new encryption key (design §3.4).
//
// Operator-run, one-off, NOT an HTTP endpoint and NOT a migration:
// it reads key material from the operator's machine and must never
// run inside the app runtime. Run as the database OWNER (the app role
// holds no grant to re-encrypt secrets and must not read operator
// secrets).
//
// FORCE ROW LEVEL SECURITY (PR #95) constrains the owner too, so
// without treatment this script would read zero user_mfa rows and
// falsely report nothing to rotate. It therefore temporarily runs
// ALTER TABLE user_mfa NO FORCE ROW LEVEL SECURITY, rotates, then
// re-enables FORCE in a finally and verifies relforcerowsecurity — a
// failure mid-run never leaves FORCE off. If the connection cannot
// ALTER user_mfa (wrong role — not the owner), the script refuses to
// run at all rather than report a false zero. The NO FORCE window only
// affects owner-context access; the app role stays constrained by RLS
// with or without FORCE.
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

// Tables this script reads/writes that are under FORCE RLS: user_mfa
// only. (The full RLS set is seven tables — notes, bookmarks,
// highlights, user_reading_state, user_mfa, mfa_recovery_codes,
// known_login_devices; see verify-restore.js. This script touches just
// user_mfa, so only that table gets the NO FORCE treatment below.)
// Detection is dynamic, so a pre-RLS database — where user_mfa has no
// FORCE — needs no dance at all.
const RLS_TABLES = ['user_mfa'];

// FORCE RLS state for the RLS tables on this connection: whether FORCE
// is on, and whether the connected user can ALTER the table — the table
// owner, a member of the owning role, or a superuser (local test
// clusters). Same shape as verify-restore.js.
async function rlsTableStates(client) {
    const result = await client.query(
        `SELECT c.relname AS table_name, c.relforcerowsecurity AS forced,
                (pg_has_role(current_user, c.relowner, 'MEMBER')
                 OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)) AS can_alter
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)
         ORDER BY c.relname`,
        [RLS_TABLES]);
    return result.rows;
}

// Temporarily lift FORCE on user_mfa so the rotation below sees real
// rows. Unlike verify-restore.js this script has no read-only mode —
// it must run as the owner — so a FORCE'd table this connection cannot
// ALTER is a hard refusal, not a skip: running on would read zero
// enrolled users and falsely report nothing to rotate. Each lifted
// table is recorded on `lift` only after its ALTER succeeds, so a
// failure halfway still leaves an exact list to restore.
async function liftForce(client, lift) {
    lift.connected = true;
    const states = await rlsTableStates(client);
    const forced = states.filter((row) => row.forced);
    for (const row of forced) {
        if (!row.can_alter) {
            throw new Error(
                `${row.table_name} has FORCE ROW LEVEL SECURITY but this connection is not the table owner, ` +
                'so it cannot lift FORCE and would read zero enrolled users. ' +
                'Re-run with the database OWNER URL (ROTATE_MFA_DATABASE_URL must be an owner URL). ' +
                'Refusing to run rather than falsely reporting nothing to rotate.');
        }
    }
    for (const row of forced) {
        await client.query(`ALTER TABLE "${row.table_name}" NO FORCE ROW LEVEL SECURITY`);
        lift.lifted.push(row.table_name);
    }
    return lift;
}

// Re-enable FORCE on every table liftForce lifted, then verify the
// flags in pg_class. Throws (loudly) if any flag is not back on — the
// caller runs this in a finally, so a failure here must never be
// swallowed: leaving FORCE off is worse than a failed rotation. Each
// table is attempted even if another fails, so one bad ALTER cannot
// strand the rest.
async function restoreForce(client, lifted, label) {
    const errors = [];
    for (const table of lifted) {
        try {
            await client.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
        } catch (error) {
            errors.push(`${table}: ${error.message}`);
        }
    }
    try {
        const states = await rlsTableStates(client);
        const byName = new Map(states.map((row) => [row.table_name, row.forced]));
        const stillOff = lifted.filter((table) => byName.get(table) !== true);
        if (stillOff.length) {
            errors.push(`FORCE ROW LEVEL SECURITY still off on: ${stillOff.join(', ')}`);
        }
    } catch (error) {
        errors.push(`could not verify FORCE flags after re-enabling: ${error.message}`);
    }
    if (errors.length) {
        throw new Error(
            `${label}: FAILED to restore FORCE ROW LEVEL SECURITY — ${errors.join('; ')}. ` +
            'Re-enable it manually before relying on this database.');
    }
}

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
        // Lift FORCE on user_mfa for the duration of the rotation (see
        // liftForce); re-enabled in the finally below, verified.
        const lift = { connected: false, lifted: [] };
        try {
            await liftForce(client, lift);
            const totalResult = await client.query(
                'SELECT count(*)::int AS n FROM user_mfa WHERE enrolled = TRUE');
            const total = totalResult.rows[0].n;
            let rotated = 0;
            let skipped = 0;
            let failed = 0;
            // User ids whose secret failed to decrypt under the previous
            // key. They are EXCLUDED from later batches: a failed row's
            // key_version never changes (it is skipped, not updated), so
            // without this exclusion the same rows would be fetched again
            // on every iteration and the loop would never terminate.
            // They are reported at the end (failed > 0 → exit 1) and
            // need the key-loss path (§4), not a retry.
            const failedIds = [];
            for (;;) {
                const batch = await client.query(
                    `SELECT user_id, secret_encrypted FROM user_mfa
                     WHERE enrolled = TRUE AND key_version = $1
                     AND NOT (user_id = ANY($3))
                     ORDER BY user_id LIMIT $2`,
                    [previous, BATCH_SIZE, failedIds]);
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
                        // The id is recorded so the row is excluded from
                        // later batches (see failedIds above) — otherwise
                        // it would be fetched and skipped forever.
                        console.error(`rotate-mfa-key: user ${row.user_id} failed to decrypt; skipped`);
                        failed += 1;
                        failedIds.push(row.user_id);
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
            // Re-enable FORCE even if rotation failed halfway — never
            // leave it off. A restore failure throws loudly (the outer
            // catch reports it and exits 1) instead of being swallowed.
            if (lift.connected && lift.lifted.length) {
                await restoreForce(client, lift.lifted, 'rotate-mfa-key');
            }
        }
    } finally {
        await client.end().catch(() => {});
    }
}

main().catch((error) => {
    console.error(`rotate-mfa-key failed: ${error.message}`);
    process.exitCode = 1;
});
