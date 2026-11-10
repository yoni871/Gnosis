const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { withUser } = require('../../src/db/userContext');

// Row-level security, defence-in-depth (roadmap T2.5; docs/RowLevelSecurity.md).
// Everything here runs as the restricted app role created by the
// disposable runner — NOBYPASSRLS, with the clean grant set — never as
// the owner and never against a live database. The app role is the only
// role whose queries RLS can meaningfully constrain: the migration
// operator is a superuser and bypasses RLS entirely, so the migration
// suite cannot prove any of this.
//
// `users` has no RLS by design (registration runs unauthenticated), so
// the two seed accounts are plain inserts as the app role.
const context = contextFromEnvironment();
let database;
let userA;
let userB;

test.before(async () => {
    database = await createTestPool(context);
    userA = (await database.pool.query(
        "INSERT INTO users(email,password_hash) VALUES ('rls-a@example.invalid','synthetic-hash') RETURNING id")).rows[0].id;
    userB = (await database.pool.query(
        "INSERT INTO users(email,password_hash) VALUES ('rls-b@example.invalid','synthetic-hash') RETURNING id")).rows[0].id;
});

test.after(async () => { if (database) await database.close(); });

const RLS_TABLES = ['notes', 'bookmarks', 'highlights', 'user_reading_state'];
const UNPROTECTED = ['users', 'email_verification_tokens', 'password_reset_tokens',
    'auth_sessions', 'auth_refresh_tokens', 'rate_limit_attempts', 'rate_limit_sweep_state',
    'licensed_chapter_cache', 'licensed_api_usage', 'licensed_ip_limits'];

test('the app role cannot bypass RLS; exactly the four user tables are forced', async () => {
    const { pool } = database;
    const identity = await pool.query(
        'SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user');
    assert.equal(identity.rows[0].rolbypassrls, false);
    const states = await pool.query(
        `SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS forced
         FROM pg_class JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
         WHERE nspname = 'public' AND relname = ANY($1) ORDER BY relname`,
        [[...RLS_TABLES, ...UNPROTECTED]]);
    const byName = new Map(states.rows.map(row => [row.relname, row]));
    for (const table of RLS_TABLES) {
        assert.equal(byName.get(table).rls, true, `${table} must have RLS enabled`);
        assert.equal(byName.get(table).forced, true, `${table} must have FORCE RLS`);
    }
    for (const table of UNPROTECTED) {
        assert.equal(byName.get(table).rls, false, `${table} must not have RLS`);
        assert.equal(byName.get(table).forced, false, `${table} must not have FORCE RLS`);
    }
    const policies = await pool.query(
        "SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname");
    assert.deepEqual(
        policies.rows.map(row => `${row.tablename}.${row.policyname}`),
        ['bookmarks.user_isolation', 'highlights.user_isolation', 'notes.user_isolation',
            'user_reading_state.user_isolation_insert', 'user_reading_state.user_isolation_select',
            'user_reading_state.user_isolation_update']);
    // The policies mirror the grants: reading state has no DELETE grant,
    // so it must have no DELETE policy either.
    assert.equal((await pool.query(
        "SELECT has_table_privilege(current_user, 'public.user_reading_state', 'DELETE') AS allowed"
    )).rows[0].allowed, false);
});

async function seedNote(ownerId) {
    return (await withUser(database.pool, ownerId, client => client.query(
        `INSERT INTO notes(user_id, book_id, start_chapter, start_verse, end_chapter, end_verse, content)
         VALUES ($1, 1, 1, 1, 1, 2, 'seed note') RETURNING id`,
        [ownerId]))).rows[0].id;
}

test('user A reads and writes only their own notes; B sees nothing', async () => {
    const { pool } = database;
    const noteId = await seedNote(userA);
    // Owner reads their own row; the other user reads zero rows.
    assert.equal((await withUser(pool, userA, client =>
        client.query('SELECT * FROM notes WHERE id = $1', [noteId]))).rows.length, 1);
    assert.equal((await withUser(pool, userB, client =>
        client.query('SELECT * FROM notes WHERE id = $1', [noteId]))).rows.length, 0);
    // No context at all: zero rows, no error, no permissive fallback.
    assert.equal((await pool.query('SELECT * FROM notes WHERE id = $1', [noteId])).rows.length, 0);
    // Cross-user writes affect zero rows and change nothing.
    assert.equal((await withUser(pool, userB, client =>
        client.query("UPDATE notes SET content = 'hijacked' WHERE id = $1 RETURNING *", [noteId]))).rows.length, 0);
    assert.equal((await withUser(pool, userB, client =>
        client.query('DELETE FROM notes WHERE id = $1 RETURNING *', [noteId]))).rows.length, 0);
    assert.equal((await pool.query("UPDATE notes SET content = 'hijacked' WHERE id = $1", [noteId])).rowCount, 0);
    assert.equal((await pool.query('DELETE FROM notes WHERE id = $1', [noteId])).rowCount, 0);
    assert.equal((await withUser(pool, userA, client =>
        client.query('SELECT content FROM notes WHERE id = $1', [noteId]))).rows[0].content, 'seed note');
    // Writes without a context, and writes for another user, fail.
    await assert.rejects(pool.query(
        `INSERT INTO notes(user_id, book_id, start_chapter, start_verse, end_chapter, end_verse, content)
         VALUES ($1, 1, 1, 1, 1, 2, 'no context')`, [userA]), { code: '42501' });
    await assert.rejects(withUser(pool, userB, client => client.query(
        `INSERT INTO notes(user_id, book_id, start_chapter, start_verse, end_chapter, end_verse, content)
         VALUES ($1, 1, 1, 1, 1, 2, 'wrong user')`, [userA])), { code: '42501' });
    // The owner can still update and delete their own row.
    assert.equal((await withUser(pool, userA, client =>
        client.query("UPDATE notes SET content = 'edited' WHERE id = $1 RETURNING *", [noteId]))).rows.length, 1);
    assert.equal((await withUser(pool, userA, client =>
        client.query('DELETE FROM notes WHERE id = $1 RETURNING *', [noteId]))).rows.length, 1);
});

test('bookmarks, highlights and reading state isolate the same way', async () => {
    const { pool } = database;
    const bookmarkId = (await withUser(pool, userA, client => client.query(
        `INSERT INTO bookmarks(user_id, book_id, start_chapter, start_verse, end_chapter, end_verse)
         VALUES ($1, 1, 1, 1, 1, 2) RETURNING id`, [userA]))).rows[0].id;
    const highlightId = (await withUser(pool, userA, client => client.query(
        `INSERT INTO highlights(user_id, book_id, chapter, verse, color)
         VALUES ($1, 1, 1, 1, '#FFD54F') RETURNING id`, [userA]))).rows[0].id;
    await withUser(pool, userA, client => client.query(
        `INSERT INTO user_reading_state(user_id, book_id, chapter_number, translation)
         VALUES ($1, 1, 1, 'KJV')`, [userA]));
    for (const [table, id] of [['bookmarks', bookmarkId], ['highlights', highlightId]]) {
        assert.equal((await withUser(pool, userA, client =>
            client.query(`SELECT * FROM ${table} WHERE id = $1`, [id]))).rows.length, 1, table);
        assert.equal((await withUser(pool, userB, client =>
            client.query(`SELECT * FROM ${table} WHERE id = $1`, [id]))).rows.length, 0, table);
        assert.equal((await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows.length, 0, table);
        // Cross-user DELETE affects zero rows and never errors.
        assert.equal((await withUser(pool, userB, client =>
            client.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [id]))).rows.length, 0, table);
    }
    assert.equal((await withUser(pool, userA, client =>
        client.query('SELECT * FROM user_reading_state WHERE user_id = $1', [userA]))).rows.length, 1);
    assert.equal((await withUser(pool, userB, client =>
        client.query('SELECT * FROM user_reading_state WHERE user_id = $1', [userA]))).rows.length, 0);
    assert.equal((await pool.query('SELECT * FROM user_reading_state WHERE user_id = $1', [userA])).rows.length, 0);
    // Reading state has no DELETE policy and no DELETE grant: the grant
    // check runs before RLS is consulted, so even the owner gets 42501
    // (not zero rows) — and the row survives.
    await assert.rejects(withUser(pool, userA, client =>
        client.query('DELETE FROM user_reading_state WHERE user_id = $1 RETURNING *', [userA])),
        { code: '42501' });
    assert.equal((await withUser(pool, userA, client =>
        client.query('SELECT * FROM user_reading_state WHERE user_id = $1', [userA]))).rows.length, 1);
});

test('withUser clears the context on commit and on rollback, and rejects bad ids', async () => {
    // A one-connection pool guarantees the follow-up query reuses the
    // exact client that ran withUser.
    const single = new Pool({ ...context, max: 1, connectionTimeoutMillis: 5000 });
    try {
        await withUser(single, userA, async client => {
            assert.equal((await client.query(
                "SELECT current_setting('app.user_id', true) AS ctx")).rows[0].ctx, String(userA));
        });
        // The context must be gone: PostgreSQL keeps the variable's
        // entry after a transaction-local set, so it reverts to an empty
        // string rather than NULL — either way it must not be user A's
        // id, and a context-free read on this same client must see zero
        // rows (the policies NULLIF the empty string back to NULL).
        const cleared = async () => (await single.query(
            "SELECT current_setting('app.user_id', true) AS ctx")).rows[0].ctx;
        let ctx = await cleared();
        assert.ok(ctx === '' || ctx === null, `context must clear, got: ${JSON.stringify(ctx)}`);
        assert.equal((await single.query('SELECT count(*)::int AS n FROM notes')).rows[0].n, 0);
        const marker = new Error('synthetic withUser failure');
        await assert.rejects(withUser(single, userA, async () => { throw marker; }),
            error => error === marker);
        ctx = await cleared();
        assert.ok(ctx === '' || ctx === null, `context must clear after rollback, got: ${JSON.stringify(ctx)}`);
        assert.equal((await single.query('SELECT count(*)::int AS n FROM notes')).rows[0].n, 0);
    } finally {
        await single.end();
    }
    for (const badId of [0, -1, 1.5, '1', null, undefined, NaN]) {
        await assert.rejects(withUser(database.pool, badId, async () => {}),
            /positive integer user id/);
    }
});

// #91 (storage budget, PR #85) composes with #95 (RLS) — integration
// fold, security/hardening-integration. Both helpers own a transaction,
// so they must never nest as two owners: withUser opens the one
// transaction and withUserBudget runs inside it on the same client
// (its optional third argument). This proves, as the app role on a
// real database, that the quota check + insert share that transaction
// with the RLS context: the insert lands under user A's context, user
// B still sees nothing, an over-budget write is refused before any
// insert, and a cross-user insert under A's context fails the policy
// WITH CHECK (42501) instead of landing.
test('withUserBudget composes inside withUser: quota and RLS share one transaction', async () => {
    const { installApplicationPool } = require('../helpers/application-database');
    installApplicationPool(database.pool);
    const { withUserBudget, ensureCapacity } = require('../../src/utils/storageBudget');
    const { pool } = database;
    const createComposed = (ownerId, content) => withUser(pool, ownerId, client =>
        withUserBudget(ownerId, async budgetClient => {
            await ensureCapacity(budgetClient, ownerId, 'notes', { add: 1, bytes: Buffer.byteLength(content, 'utf8') });
            return budgetClient.query(
                `INSERT INTO notes(user_id, book_id, start_chapter, start_verse, end_chapter, end_verse, content)
                 VALUES ($1, 1, 1, 1, 1, 2, $2) RETURNING id`,
                [ownerId, content]);
        }, client));
    const noteId = (await createComposed(userA, 'composed note')).rows[0].id;
    assert.equal((await withUser(pool, userA, client =>
        client.query('SELECT * FROM notes WHERE id = $1', [noteId]))).rows.length, 1);
    assert.equal((await withUser(pool, userB, client =>
        client.query('SELECT * FROM notes WHERE id = $1', [noteId]))).rows.length, 0);
    assert.equal((await pool.query('SELECT * FROM notes WHERE id = $1', [noteId])).rows.length, 0);
    // Over the 2 MiB note-bytes budget: refused before any insert.
    await assert.rejects(createComposed(userA, 'x'.repeat(2 * 1024 * 1024 + 1)),
        error => error.code === 'RESOURCE_LIMIT');
    assert.equal((await withUser(pool, userA, client =>
        client.query('SELECT count(*)::int AS n FROM notes WHERE user_id = $1', [userA]))).rows[0].n, 1);
    // Cross-user insert under A's context: the policy WITH CHECK fails it.
    await assert.rejects(withUser(pool, userA, client =>
        withUserBudget(userA, async budgetClient => {
            await ensureCapacity(budgetClient, userA, 'notes', { add: 1, bytes: 9 });
            return budgetClient.query(
                `INSERT INTO notes(user_id, book_id, start_chapter, start_verse, end_chapter, end_verse, content)
                 VALUES ($1, 1, 1, 1, 1, 2, 'wrong user')`, [userB]);
        }, client)), { code: '42501' });
});
