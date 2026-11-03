const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { contextFromEnvironment, validateContext, createTestPool,
    withClient } = require('../helpers/application-database');
const { workerEnvironment, startBackend } = require('../helpers/backend-instance');

const context = contextFromEnvironment();

test('missing/unsafe contexts and extra pg options fail closed', () => {
    for (const value of [undefined, {}, { ...context, host: 'localhost' },
        { ...context, host: 'example.neon.tech' }, { ...context, database: 'application' },
        { ...context, port: 0 }, { ...context, user: 'gnosis_test' },
        { ...context, password: '' }, { ...context, connectionString: 'synthetic-poison' }]) {
        assert.throws(() => validateContext(value), /Invalid disposable/);
    }
    assert.equal(workerEnvironment().JWT_SECRET, 'synthetic-application-test-jwt');
    assert.deepEqual(Object.keys(workerEnvironment()).filter(key => /^(DB_|PG|MIGRATION_|DATABASE_URL|NODE_OPTIONS)/.test(key)), []);
});

test('synthetic dotenv/database poison cannot redirect the injected application pool', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnosis-app-poison-'));
    try {
        fs.writeFileSync(path.join(dir, '.env'), 'DATABASE_URL=synthetic-poison\nJWT_SECRET=synthetic-poison\n');
        const helper = require.resolve('../helpers/application-database');
        const dbModule = require.resolve('../../src/db/db');
        const script = `
            const h=require(${JSON.stringify(helper)});
            (async()=>{
                const db=await h.createTestPool(h.contextFromEnvironment());
                try {
                    h.installApplicationPool(db.pool);
                    if(require(${JSON.stringify(dbModule)})!==db.pool) throw new Error('Pool injection failed');
                    process.stdout.write('restricted-pool-ok');
                } finally { await db.close(); }
            })().catch(()=>process.exitCode=1);`;
        const child = spawnSync(process.execPath, ['-e', script], {
            cwd: dir, timeout: 15000, encoding: 'utf8', env: {
                ...workerEnvironment(), GNOSIS_APPLICATION_TEST_CONTEXT: JSON.stringify(context),
                DATABASE_URL: 'synthetic-poison', DB_HOST: 'example.invalid',
                DB_NAME: 'application', PGHOST: 'example.invalid', PGDATABASE: 'application',
            },
        });
        assert.equal(child.status, 0);
        assert.equal(child.stdout, 'restricted-pool-ok');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('pool close destroys an unreleased transactional connection and is idempotent', async () => {
    const db = await createTestPool(context);
    const client = await db.pool.connect();
    await client.query('BEGIN');
    await client.query("INSERT INTO users(email) VALUES ('cleanup-rollback@harness.invalid')");
    await db.close();
    await db.close();
    const observer = await createTestPool(context);
    try {
        await withClient(observer.pool, async other => {
            assert.equal((await other.query("SELECT count(*)::int AS n FROM users WHERE email='cleanup-rollback@harness.invalid'")).rows[0].n, 0);
        });
    } finally { await observer.close(); }
});

if (process.env.GNOSIS_APPLICATION_EXPECT_FAILURE === '1') {
    test('intentional harness failure exercises worker and database teardown', async t => {
        const worker = await startBackend(context);
        t.after(() => worker.stop());
        throw new Error('intentional harness failure marker');
    });
}
