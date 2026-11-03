const test = require('node:test');
const assert = require('node:assert/strict');
const { contextFromEnvironment, createTestPool, withClient,
    withTransaction, installApplicationPool } = require('../helpers/application-database');
const { startBackend } = require('../helpers/backend-instance');

const context = contextFromEnvironment(); // Fail before any connection if run directly.
let database;
test.before(async () => { database = await createTestPool(context); });
test.after(async () => { if (database) await database.close(); });

test('migrated application schema permits only the approved runtime grants', async () => {
    const { pool } = database;
    const grants = await pool.query(`SELECT table_name,privilege_type,is_grantable FROM information_schema.role_table_grants
        WHERE grantee=current_user AND table_schema='public' ORDER BY table_name,privilege_type`);
    const expected = [];
    for (const table of ['bible_translations', 'bible_books', 'bible_chapters', 'bible_verses',
        'sources', 'commentaries', 'commentary_entries']) expected.push(`${table}:SELECT`);
    for (const privilege of ['SELECT', 'INSERT']) expected.push(`users:${privilege}`);
    for (const table of ['notes', 'bookmarks', 'highlights']) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) expected.push(`${table}:${privilege}`);
    }
    assert.deepEqual(grants.rows.map(row => `${row.table_name}:${row.privilege_type}`).sort(), expected.sort());
    assert.ok(grants.rows.every(row => row.is_grantable === 'NO'));
    const sequences = await pool.query(`SELECT c.relname,has_sequence_privilege(current_user,c.oid,'USAGE') AS usage,
        has_sequence_privilege(current_user,c.oid,'SELECT') AS select_allowed,
        has_sequence_privilege(current_user,c.oid,'UPDATE') AS update_allowed
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='S' ORDER BY c.relname`);
    const allowed = ['users_id_seq', 'notes_id_seq', 'bookmarks_id_seq', 'highlights_id_seq'];
    for (const row of sequences.rows) {
        assert.equal(row.usage, allowed.includes(row.relname));
        assert.equal(row.select_allowed, false);
        assert.equal(row.update_allowed, false);
    }
    for (const sql of ['SELECT * FROM pgmigrations', 'INSERT INTO pgmigrations(name) VALUES (\'forbidden\')',
        "SELECT nextval('pgmigrations_id_seq')", 'CREATE TABLE forbidden(id integer)',
        'CREATE SCHEMA forbidden', 'CREATE TEMP TABLE forbidden(id integer)',
        "INSERT INTO bible_books(name) VALUES ('forbidden')", "UPDATE bible_books SET name='forbidden'",
        'DELETE FROM bible_books', 'TRUNCATE users', 'UPDATE users SET first_name=\'forbidden\'']) {
        await assert.rejects(pool.query(sql), { code: '42501' });
    }
});

test('restricted writes persist across pools and rollback uses one independent client', async () => {
    const other = await createTestPool(context);
    try {
        const email = 'persisted@harness.invalid';
        await withTransaction(database.pool, async client => {
            await client.query('INSERT INTO users(email,password_hash) VALUES ($1,$2)', [email, 'synthetic-hash']);
        });
        assert.equal((await other.pool.query('SELECT email FROM users WHERE email=$1', [email])).rows[0].email, email);
        const failure = new Error('synthetic rollback marker');
        await assert.rejects(withClient(other.pool, async observer => {
            await withTransaction(database.pool, async client => {
                const [a, b] = await Promise.all([client.query('SELECT pg_backend_pid() AS pid'),
                    observer.query('SELECT pg_backend_pid() AS pid')]);
                assert.notEqual(a.rows[0].pid, b.rows[0].pid);
                await client.query("INSERT INTO users(email) VALUES ('rolled-back@harness.invalid')");
                assert.equal((await observer.query("SELECT count(*)::int AS n FROM users WHERE email='rolled-back@harness.invalid'")).rows[0].n, 0);
                throw failure;
            });
        }), error => error === failure);
        assert.equal((await other.pool.query("SELECT count(*)::int AS n FROM users WHERE email='rolled-back@harness.invalid'")).rows[0].n, 0);
    } finally { await other.close(); await other.close(); }
});

test('real services and two independent backends read the same migrated database', async () => {
    installApplicationPool(database.pool);
    const service = require('../../src/services/bibleService');
    assert.equal((await service.getAllBooks()).rows[0].name, 'Synthetic harness book');
    const workers = [];
    try {
        workers.push(await startBackend(context));
        workers.push(await startBackend(context));
        assert.notEqual(workers[0].pid, workers[1].pid);
        const responses = await Promise.all(workers.map(async worker => {
            const response = await fetch(`${worker.url}/api/books`, { signal: AbortSignal.timeout(5000) });
            assert.equal(response.status, 200);
            return response.json();
        }));
        assert.deepEqual(responses[0], responses[1]);
        assert.equal(responses[0][0].name, 'Synthetic harness book');
    } finally { for (const worker of workers) { await worker.stop(); await worker.stop(); } }
});
