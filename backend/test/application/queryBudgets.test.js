const test = require('node:test');
const assert = require('node:assert/strict');
const { contextFromEnvironment } = require('../helpers/application-database');
const context = contextFromEnvironment();
const { createPools } = require('../../src/db/db');
function budgetPool(extra = {}) {
    return createPools({ DB_HOST: context.host, DB_PORT: String(context.port), DB_NAME: context.database,
        DB_USER: context.user, DB_PASSWORD: context.password, DB_STATEMENT_TIMEOUT_MS: '100',
        DB_LOCK_TIMEOUT_MS: '50', DB_IDLE_TRANSACTION_TIMEOUT_MS: '2000', ...extra }).app;
}
test('server cancels slow statements and the connection remains usable', async t => {
    const pool = budgetPool(); t.after(() => pool.end());
    await assert.rejects(pool.query('SELECT pg_sleep(0.5)'), { code: '57014' });
    assert.equal((await pool.query('SELECT 1 AS value')).rows[0].value, 1);
});
test('lock wait is bounded and a failed transaction is rolled back', async t => {
    const pool = budgetPool({ DB_STATEMENT_TIMEOUT_MS: '2000' }); t.after(() => pool.end());
    const user = (await pool.query("INSERT INTO users(email) VALUES ('query-budget@fixture.invalid') RETURNING id")).rows[0];
    const first = await pool.connect();
    try {
        await first.query('BEGIN');
        await first.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
        await assert.rejects(pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', ['synthetic', user.id]), { code: '55P03' });
    } finally { await first.query('ROLLBACK'); first.release(); }
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', ['synthetic', user.id]);
});
test('abandoned idle transactions terminate rather than retaining locks', async t => {
    const pool = budgetPool({ DB_IDLE_TRANSACTION_TIMEOUT_MS: '100' }); t.after(() => pool.end());
    const client = await pool.connect();
    const failure = new Promise(resolve => client.once('error', resolve));
    await client.query('BEGIN');
    const timer = setTimeout(() => client.end(), 3000);
    try {
        const error = await failure;
        assert.equal(error.code, '25P03');
    } finally { clearTimeout(timer); client.release(true); }
    assert.equal((await pool.query('SELECT 1 AS value')).rows[0].value, 1);
});
