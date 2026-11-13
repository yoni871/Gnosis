const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend } = require('../helpers/backend-instance');
const { generateTotpCode } = require('../../src/utils/mfaTotp');
const mfaService = require('../../src/services/mfaService');

// Regression test for Codex finding F8 (PR #93): the key-rotation
// script must terminate when a row is undecryptable. Before the fix,
// a row that failed to decrypt kept its key_version, so the batch
// query re-fetched it on every iteration and the loop never ended.
// The fix excludes failed rows from later batches, reports them,
// and exits nonzero.
//
// This runs the real script as a subprocess against the disposable
// test database, with one valid enrolled row and one corrupt row.

const MFA_KEY = crypto.randomBytes(32).toString('hex');
process.env.MFA_ENCRYPTION_KEY = MFA_KEY;
const password = 'synthetic-rotation-password';
let userCounter = 0;

const context = contextFromEnvironment();
let database, worker;

test.before(async () => {
    database = await createTestPool(context);
    worker = await startBackend(context);
});
test.after(async () => { if (worker) await worker.stop(); if (database) await database.close(); });

async function freshUser() {
    userCounter += 1;
    const email = `mfa-rotate-${userCounter}@example.invalid`;
    const result = await database.pool.query(`INSERT INTO users(first_name,last_name,email,password_hash,email_verified_at)
        VALUES ('Mfa','Reader',$1,$2,now()) RETURNING id`, [email, await bcrypt.hash(password, 4)]);
    return { userId: result.rows[0].id, email };
}

function runRotation(env) {
    return new Promise((resolve, reject) => {
        const script = path.join(__dirname, '..', '..', 'scripts', 'db', 'rotate-mfa-key.js');
        const child = spawn(process.execPath, [script], {
            env: { ...process.env, ...env },
            timeout: 30000,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stdout, stderr }));
    });
}

test('rotation terminates on an undecryptable row, rotates the rest, and exits nonzero', async () => {
    const K1 = MFA_KEY;
    const K2 = crypto.randomBytes(32).toString('hex');
    // A valid enrolled user (secret encrypted under K1, version 1).
    const good = await freshUser();
    const started = await mfaService.startEnrollment(database.pool, good.userId, good.email);
    assert.equal(started.ok, true, JSON.stringify(started));
    const confirmed = await mfaService.confirmEnrollment(database.pool, good.userId, await generateTotpCode(started.secret));
    assert.equal(confirmed.ok, true);
    // A corrupt enrolled row: valid base64 shape but not a ciphertext
    // K1 can decrypt (garbage bytes). It must be skipped, not looped.
    const bad = await freshUser();
    await database.pool.query(
        `INSERT INTO user_mfa(user_id, secret_encrypted, key_version, enrolled, enrolled_at, updated_at)
         VALUES ($1, $2, 1, TRUE, now(), now())`,
        [bad.userId, Buffer.from(crypto.randomBytes(48)).toString('base64')]);
    const url = `postgresql://${encodeURIComponent(context.user)}:${encodeURIComponent(context.password)}@127.0.0.1:${context.port}/${context.database}`;
    const result = await runRotation({
        MFA_ENCRYPTION_KEY: K2,
        MFA_ENCRYPTION_KEY_PREVIOUS: K1,
        MFA_KEY_VERSION: '2',
        ROTATE_MFA_DATABASE_URL: url,
    });
    // The script must terminate (the 30 s spawn timeout would reject
    // on a loop) and report the failure with a nonzero exit.
    assert.notEqual(result.code, null, `rotation did not exit (stdout: ${result.stdout}, stderr: ${result.stderr})`);
    assert.notEqual(result.code, 0, `rotation must exit nonzero with a failed row (stdout: ${result.stdout})`);
    const summary = JSON.parse(result.stdout.trim().split('\n').pop());
    assert.equal(summary.enrolled, 2);
    assert.equal(summary.rotated, 1, 'the valid row must rotate');
    assert.equal(summary.failed, 1, 'the corrupt row must be reported as failed');
    assert.equal(summary.remaining, 1, 'the corrupt row is still un-rotated');
    // The valid row is now at version 2; the corrupt row is untouched.
    const goodRow = await database.pool.query('SELECT key_version FROM user_mfa WHERE user_id = $1', [good.userId]);
    assert.equal(goodRow.rows[0].key_version, 2);
    const badRow = await database.pool.query('SELECT key_version FROM user_mfa WHERE user_id = $1', [bad.userId]);
    assert.equal(badRow.rows[0].key_version, 1);
});
