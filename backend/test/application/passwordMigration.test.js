const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend } = require('../helpers/backend-instance');
const { verifyPassword } = require('../../src/utils/passwordHash');

const context = contextFromEnvironment();
let database, worker;
const PASSWORD = 'synthetic-migration-password';

test.before(async () => {
    database = await createTestPool(context);
    worker = await startBackend(context);
});
test.beforeEach(async () => { await database.pool.query('DELETE FROM rate_limit_attempts'); });
test.after(async () => { if (worker) await worker.stop(); if (database) await database.close(); });

async function createUser(email, passwordHash) {
    const result = await database.pool.query(
        `INSERT INTO users(first_name,last_name,email,password_hash,email_verified_at)
        VALUES ('Migration','Reader',$1,$2,now()) RETURNING id`,
        [email, passwordHash]);
    return result.rows[0].id;
}

async function storedHash(userId) {
    const result = await database.pool.query(
        'SELECT password_hash FROM users WHERE id = $1', [userId]);
    return result.rows[0].password_hash;
}

async function login(email, password) {
    const response = await fetch(`${worker.url}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
}

test('a bcrypt cost-10 login migrates the stored hash to Argon2id on real PostgreSQL', async () => {
    const userId = await createUser(
        'migrate-10@example.invalid', await bcrypt.hash(PASSWORD, 10));
    assert.match(await storedHash(userId), /^\$2b\$10\$/);
    const result = await login('migrate-10@example.invalid', PASSWORD);
    assert.equal(result.status, 200);
    assert.equal(typeof result.data.token, 'string');
    const migrated = await storedHash(userId);
    assert.match(migrated, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    assert.equal(await verifyPassword(PASSWORD, migrated), true);
    // The migrated hash keeps working: a second login verifies Argon2id
    // and leaves the hash untouched (no re-migration).
    const second = await login('migrate-10@example.invalid', PASSWORD);
    assert.equal(second.status, 200);
    assert.equal(await storedHash(userId), migrated);
});

test('a bcrypt cost-12 login migrates too', async () => {
    const userId = await createUser(
        'migrate-12@example.invalid', await bcrypt.hash(PASSWORD, 12));
    const result = await login('migrate-12@example.invalid', PASSWORD);
    assert.equal(result.status, 200);
    assert.match(await storedHash(userId), /^\$argon2id\$/);
});

test('a failed login migrates nothing', async () => {
    const userId = await createUser(
        'migrate-fail@example.invalid', await bcrypt.hash(PASSWORD, 10));
    const before = await storedHash(userId);
    const result = await login('migrate-fail@example.invalid', 'wrong-password');
    assert.equal(result.status, 401);
    assert.equal(await storedHash(userId), before);
});

test('an unknown-email login does not create or migrate anything', async () => {
    const result = await login('nobody-here@example.invalid', PASSWORD);
    assert.equal(result.status, 401);
    assert.deepEqual(result.data, { error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
});
