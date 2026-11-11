const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { Client } = require('pg');
const { connectionFor } = require('../../scripts/migrations/config');
const { execute } = require('../../scripts/migrations/runner');
const { purgeExpired } = require('../../scripts/purge-expired');

if (process.env.GNOSIS_MIGRATION_TEST_TARGET !== 'test') throw new Error('Use the explicit test-target launcher.');
// Validate before opening any connection or issuing destructive test setup.
const config = connectionFor('test', process.env, 'app');

// The purge runs as the database owner, never as the application role
// (the runtime role deliberately holds no DELETE grant on the auth
// tables), so this test lives in the migration suite, not the
// application suite. It uses its own scratch database, so the
// integration tests' public-schema resets in the shared test database
// cannot interfere with it.
let admin;
let db;
let scratchName;
let purgeUserId;

function sha(text) {
    return crypto.createHash('sha256').update(text).digest();
}

test.before(async () => {
    admin = new Client({ ...config, connectionTimeoutMillis: 5000 });
    admin.on('error', () => {});
    await admin.connect();
    scratchName = `gnosis_migration_test_${crypto.randomBytes(8).toString('hex')}`;
    await admin.query(`CREATE DATABASE "${scratchName}"`);
    const url = new URL(process.env.MIGRATION_TEST_DATABASE_URL);
    url.pathname = `/${scratchName}`;
    const env = { ...process.env, MIGRATION_TEST_DATABASE_URL: url.toString() };
    await execute({ command: 'up', target: 'test', project: 'app', env });
    db = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
    db.on('error', () => {});
    await db.connect();

    const user = await db.query(
        `INSERT INTO users(first_name, last_name, email, password_hash, email_verified_at)
         VALUES ('Purge', 'Test', 'purge@example.invalid', $1, now()) RETURNING id`,
        [await bcrypt.hash('synthetic-purge-password', 4)]
    );
    const userId = user.rows[0].id;

    // Verification tokens: expired, live, live-but-consumed, expired-and-consumed.
    await db.query(
        `INSERT INTO email_verification_tokens(user_id, token_hash, expires_at)
         VALUES ($1, $2, now() - interval '1 hour')`,
        [userId, sha('verify-expired')]
    );
    await db.query(
        `INSERT INTO email_verification_tokens(user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '1 hour')`,
        [userId, sha('verify-live')]
    );
    await db.query(
        `INSERT INTO email_verification_tokens(user_id, token_hash, expires_at, used_at, consumed_reason)
         VALUES ($1, $2, now() + interval '1 hour', now(), 'verified')`,
        [userId, sha('verify-live-consumed')]
    );
    await db.query(
        `INSERT INTO email_verification_tokens(user_id, token_hash, expires_at, used_at, consumed_reason)
         VALUES ($1, $2, now() - interval '1 hour', now(), 'superseded')`,
        [userId, sha('verify-expired-consumed')]
    );

    // Reset tokens: expired, live, live-but-used, live-but-superseded, expired-and-used.
    await db.query(
        `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at)
         VALUES ($1, $2, now() - interval '1 hour')`,
        [userId, sha('reset-expired')]
    );
    await db.query(
        `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '1 hour')`,
        [userId, sha('reset-live')]
    );
    await db.query(
        `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at, used_at, consumed_reason)
         VALUES ($1, $2, now() + interval '1 hour', now(), 'used')`,
        [userId, sha('reset-live-used')]
    );
    await db.query(
        `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at, used_at, consumed_reason)
         VALUES ($1, $2, now() + interval '1 hour', now(), 'superseded')`,
        [userId, sha('reset-live-superseded')]
    );
    await db.query(
        `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at, used_at, consumed_reason)
         VALUES ($1, $2, now() - interval '1 hour', now(), 'used')`,
        [userId, sha('reset-expired-used')]
    );

    // Sessions: live, expired, revoked — each with a refresh token. The
    // live session also carries a used refresh token (a completed
    // rotation), which must survive so replay detection still works.
    for (const [name, expires, revoked] of [
        ['live', 'now() + interval \'7 days\'', null],
        ['expired', 'now() - interval \'1 second\'', null],
        ['revoked', 'now() + interval \'7 days\'', 'now()'],
    ]) {
        const sessionId = crypto.randomUUID();
        await db.query(
            `INSERT INTO auth_sessions(id, user_id, expires_at, revoked_at)
             VALUES ($1, $2, ${expires}, ${revoked === null ? 'NULL' : revoked})`,
            [sessionId, userId]
        );
        await db.query(
            'INSERT INTO auth_refresh_tokens(token_hash, session_id) VALUES ($1, $2)',
            [`synthetic-${name}-refresh`, sessionId]
        );
    }
    const liveSession = await db.query(
        `SELECT id FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL
         AND expires_at > now()`,
        [userId]
    );
    await db.query(
        `INSERT INTO auth_refresh_tokens(token_hash, session_id, used_at)
         VALUES ('synthetic-live-refresh-used', $1, now())`,
        [liveSession.rows[0].id]
    );
    purgeUserId = userId;
});

test.after(async () => {
    if (db) await db.end();
    if (admin) {
        await admin.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
        await admin.end();
    }
});

test('purge deletes only expired and consumed rows, and is idempotent', async () => {
    const userId = purgeUserId;
    const counts = await purgeExpired(db);
    assert.deepEqual(counts, {
        email_verification_tokens: 2,
        password_reset_tokens: 4,
        auth_refresh_tokens: 2,
        auth_sessions: 2,
    });

    // What survives: the live verification token (used or not, while
    // unexpired), the live reset token, the live session and both of
    // its refresh tokens (unused and used).
    const remaining = await db.query(
        `SELECT
            (SELECT count(*)::int FROM email_verification_tokens WHERE user_id = $1) AS verification,
            (SELECT count(*)::int FROM password_reset_tokens WHERE user_id = $1) AS reset,
            (SELECT count(*)::int FROM auth_sessions WHERE user_id = $1) AS sessions,
            (SELECT count(*)::int FROM auth_refresh_tokens) AS refresh`,
        [userId]
    );
    assert.deepEqual(remaining.rows[0], {
        verification: 2, reset: 1, sessions: 1, refresh: 2,
    });

    // A second run finds nothing left to delete.
    assert.deepEqual(await purgeExpired(db), {
        email_verification_tokens: 0,
        password_reset_tokens: 0,
        auth_refresh_tokens: 0,
        auth_sessions: 0,
    });
});
