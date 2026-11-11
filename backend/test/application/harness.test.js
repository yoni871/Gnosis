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
    for (const table of ['auth_sessions', 'auth_refresh_tokens']) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) expected.push(`${table}:${privilege}`);
    }
    for (const table of ['bible_translations', 'bible_books', 'bible_chapters', 'bible_verses',
        'sources', 'commentaries', 'commentary_entries']) expected.push(`${table}:SELECT`);
    // Original Language Analysis (Phase 1): the reader only reads the
    // imported STEPBible data; the importer runs as the operator.
    for (const table of ['ol_sources', 'ol_lexical_entries', 'ol_word_occurrences', 'ol_morphology_codes']) {
        expected.push(`${table}:SELECT`);
    }
    for (const privilege of ['SELECT', 'INSERT']) expected.push(`users:${privilege}`);
    for (const table of ['notes', 'bookmarks', 'highlights']) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) expected.push(`${table}:${privilege}`);
    }
    // Issue #4: only the permissions the limiter itself needs. Attempts
    // are never updated in place (counted rows stay, released rows are
    // deleted), and the sweep-state row is created by the migration, so
    // the application role gets no UPDATE on attempts and no INSERT or
    // DELETE on the sweep state.
    for (const privilege of ['SELECT', 'INSERT', 'DELETE']) expected.push(`rate_limit_attempts:${privilege}`);
    for (const privilege of ['SELECT', 'UPDATE']) expected.push(`rate_limit_sweep_state:${privilege}`);
    // Issue #9: the runtime role reads and inserts verification tokens
    // but updates only the two consumption columns; the users column
    // grant is column-level too, so neither table gains a table-level
    // UPDATE row here (see the column-grant test below).
    for (const privilege of ['SELECT', 'INSERT']) expected.push(`email_verification_tokens:${privilege}`);
    // Issue #10: the same shape for password-reset tokens.
    for (const privilege of ['SELECT', 'INSERT']) expected.push(`password_reset_tokens:${privilege}`);
    // T1.16 audit logging: the runtime role writes audit rows and
    // monitoring reads them; nothing updates or deletes them (the
    // forbidden statements below pin the append-only shape).
    for (const privilege of ['SELECT', 'INSERT']) expected.push(`security_events:${privilege}`);
    assert.deepEqual(grants.rows.map(row => `${row.table_name}:${row.privilege_type}`).sort(), expected.sort());
    assert.ok(grants.rows.every(row => row.is_grantable === 'NO'));
    const sequences = await pool.query(`SELECT c.relname,has_sequence_privilege(current_user,c.oid,'USAGE') AS usage,
        has_sequence_privilege(current_user,c.oid,'SELECT') AS select_allowed,
        has_sequence_privilege(current_user,c.oid,'UPDATE') AS update_allowed
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='S' ORDER BY c.relname`);
    const allowed = ['users_id_seq', 'notes_id_seq', 'bookmarks_id_seq', 'highlights_id_seq', 'security_events_id_seq'];
    for (const row of sequences.rows) {
        assert.equal(row.usage, allowed.includes(row.relname));
        assert.equal(row.select_allowed, false);
        assert.equal(row.update_allowed, false);
    }
    for (const sql of ['SELECT * FROM pgmigrations_app', 'SELECT * FROM pgmigrations_bible', 'SELECT * FROM pgmigrations_commentary',
        'INSERT INTO pgmigrations_app(name) VALUES (\'forbidden\')',
        "SELECT nextval('pgmigrations_app_id_seq')", 'CREATE TABLE forbidden(id integer)',
        'CREATE SCHEMA forbidden', 'CREATE TEMP TABLE forbidden(id integer)',
        "INSERT INTO bible_books(name) VALUES ('forbidden')", "UPDATE bible_books SET name='forbidden'",
        'DELETE FROM bible_books', 'TRUNCATE users', 'UPDATE users SET first_name=\'forbidden\'',
        'UPDATE rate_limit_attempts SET policy=\'forbidden\'',
        "INSERT INTO rate_limit_sweep_state(id) VALUES (2)",
        'DELETE FROM rate_limit_sweep_state',
        "UPDATE users SET email='forbidden@harness.invalid'",
        'UPDATE users SET id=999999',
        "UPDATE email_verification_tokens SET token_hash='\\x00'",
        'UPDATE email_verification_tokens SET user_id=999999',
        "UPDATE email_verification_tokens SET expires_at=now()",
        "UPDATE email_verification_tokens SET created_at=now()",
        "UPDATE password_reset_tokens SET token_hash='\\x00'",
        'UPDATE password_reset_tokens SET user_id=999999',
        "UPDATE password_reset_tokens SET expires_at=now()",
        "UPDATE password_reset_tokens SET created_at=now()",
        "UPDATE security_events SET kind='forbidden'",
        'DELETE FROM security_events']) {
        await assert.rejects(pool.query(sql), { code: '42501' });
    }
});

test('issue #9 and #10 column grants allow exactly the approved column updates', async () => {
    const { pool } = database;
    const columns = await pool.query(`SELECT table_name,column_name,privilege_type FROM information_schema.role_column_grants
        WHERE grantee=current_user AND table_schema='public' AND privilege_type='UPDATE'
        AND table_name IN ('users','email_verification_tokens','password_reset_tokens') ORDER BY table_name,column_name`);
    assert.deepEqual(
        columns.rows.map(row => `${row.table_name}.${row.column_name}:${row.privilege_type}`),
        ['email_verification_tokens.consumed_reason:UPDATE', 'email_verification_tokens.used_at:UPDATE',
            'password_reset_tokens.consumed_reason:UPDATE', 'password_reset_tokens.used_at:UPDATE',
            'users.email_verified_at:UPDATE', 'users.password_hash:UPDATE']);
    for (const [table, column] of [['users', 'id'], ['users', 'email'],
        ['users', 'first_name'], ['users', 'last_name'],
        ['email_verification_tokens', 'token_hash'], ['email_verification_tokens', 'user_id'],
        ['email_verification_tokens', 'expires_at'], ['email_verification_tokens', 'created_at'],
        ['password_reset_tokens', 'token_hash'], ['password_reset_tokens', 'user_id'],
        ['password_reset_tokens', 'expires_at'], ['password_reset_tokens', 'created_at']]) {
        const check = await pool.query('SELECT has_column_privilege(current_user,$1,$2,$3) AS allowed',
            [`public.${table}`, column, 'UPDATE']);
        assert.equal(check.rows[0].allowed, false, `${table}.${column} must not be updatable`);
    }
    // Positive control: the approved column updates actually succeed.
    const user = await pool.query(
        "INSERT INTO users(email,password_hash) VALUES ('column-grant@harness.invalid','synthetic-hash') RETURNING id");
    const token = await pool.query(
        "INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES ($1,'\\x01',now() + interval '1 hour') RETURNING id",
        [user.rows[0].id]);
    await pool.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [user.rows[0].id]);
    await pool.query("UPDATE email_verification_tokens SET used_at=now(),consumed_reason='verified' WHERE id=$1",
        [token.rows[0].id]);
    const row = await pool.query('SELECT email_verified_at,used_at,consumed_reason FROM users u JOIN email_verification_tokens t ON t.user_id=u.id WHERE u.id=$1',
        [user.rows[0].id]);
    assert.ok(row.rows[0].email_verified_at);
    assert.equal(row.rows[0].consumed_reason, 'verified');
    // Issue #10 positive control: password_hash and reset-token
    // consumption use the same approved columns.
    const resetToken = await pool.query(
        "INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES ($1,'\\x02',now() + interval '1 hour') RETURNING id",
        [user.rows[0].id]);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', ['synthetic-hash-2', user.rows[0].id]);
    await pool.query("UPDATE password_reset_tokens SET used_at=now(),consumed_reason='used' WHERE id=$1",
        [resetToken.rows[0].id]);
    const resetRow = await pool.query('SELECT password_hash,used_at,consumed_reason FROM users u JOIN password_reset_tokens t ON t.user_id=u.id WHERE u.id=$1',
        [user.rows[0].id]);
    assert.equal(resetRow.rows[0].password_hash, 'synthetic-hash-2');
    assert.equal(resetRow.rows[0].consumed_reason, 'used');
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
