const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { contextFromEnvironment, createTestPool, installApplicationPool } = require('../helpers/application-database');
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

test.after(async () => { if (database) await database.close(); if (installedSingle) await installedSingle.end(); });

// A one-connection pool installed as the application pool
// (src/db/db), so code that borrows from the module pool —
// withUserBudget, saveHighlights, the DELETE /account handler — runs
// on this exact client, and a follow-up query on the same pool reuses
// it. Installed lazily: nothing in this file may require src/db/db
// before the first call. One install per process; later tests reuse it.
let installedSingle = null;
function installSinglePool() {
    if (installedSingle) return installedSingle;
    installedSingle = new Pool({ ...context, max: 1, connectionTimeoutMillis: 5000 });
    installApplicationPool(installedSingle);
    return installedSingle;
}

const RLS_TABLES = ['notes', 'bookmarks', 'highlights', 'user_reading_state',
    'user_mfa', 'mfa_recovery_codes', 'known_login_devices'];
const UNPROTECTED = ['users', 'email_verification_tokens', 'password_reset_tokens',
    'auth_sessions', 'auth_refresh_tokens', 'rate_limit_attempts', 'rate_limit_sweep_state',
    'licensed_chapter_cache', 'licensed_api_usage', 'licensed_ip_limits',
    // mfa_challenges is deliberately unprotected: its lookup is
    // token-derived before the user is known (docs/RowLevelSecurity.md).
    // user_passkeys and webauthn_challenges are the same: their lookups
    // (by credential_id, by challenge) discover the user before any
    // context exists, so RLS there would break login.
    'mfa_challenges', 'user_passkeys', 'webauthn_challenges'];

test('the app role cannot bypass RLS; exactly the seven user tables are forced', async () => {
    const { pool } = database;
    const identity = await pool.query(
        'SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user');
    assert.equal(identity.rows[0].rolbypassrls, false);
    const ownership = await pool.query("SELECT DISTINCT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relname = ANY($1)", [RLS_TABLES]);
    assert.ok(ownership.rows.every(row => row.owner !== context.user), "app role must not own RLS tables");
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
        ['bookmarks.user_isolation', 'highlights.user_isolation',
            'known_login_devices.user_isolation_insert', 'known_login_devices.user_isolation_select',
            'known_login_devices.user_isolation_update',
            'mfa_recovery_codes.user_isolation_insert', 'mfa_recovery_codes.user_isolation_select',
            'mfa_recovery_codes.user_isolation_update',
            'notes.user_isolation',
            'user_mfa.user_isolation_insert', 'user_mfa.user_isolation_select',
            'user_mfa.user_isolation_update',
            'user_reading_state.user_isolation_insert', 'user_reading_state.user_isolation_select',
            'user_reading_state.user_isolation_update']);
    // The policies mirror the grants: reading state, MFA and device
    // tables have no DELETE grant, so they must have no DELETE policy
    // either.
    for (const table of ['user_reading_state', 'user_mfa', 'mfa_recovery_codes', 'known_login_devices']) {
        assert.equal((await pool.query(
            `SELECT has_table_privilege(current_user, 'public.${table}', 'DELETE') AS allowed`
        )).rows[0].allowed, false, `${table} must have no DELETE grant`);
    }
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

test('user B reads and writes only their own data; A sees nothing', async () => {
    // The mirror image of the test above, with the roles swapped: user
    // B's rows are seeded here, so isolation is proven in both
    // directions instead of only A→B.
    const { pool } = database;
    const noteId = await seedNote(userB);
    const bookmarkId = (await withUser(pool, userB, client => client.query(
        `INSERT INTO bookmarks(user_id, book_id, start_chapter, start_verse, end_chapter, end_verse)
         VALUES ($1, 1, 1, 1, 1, 2) RETURNING id`, [userB]))).rows[0].id;
    const highlightId = (await withUser(pool, userB, client => client.query(
        `INSERT INTO highlights(user_id, book_id, chapter, verse, color)
         VALUES ($1, 1, 1, 1, '#FFD54F') RETURNING id`, [userB]))).rows[0].id;
    await withUser(pool, userB, client => client.query(
        `INSERT INTO user_reading_state(user_id, book_id, chapter_number, translation)
         VALUES ($1, 1, 1, 'KJV')`, [userB]));
    // B's rows are invisible to A and to a context-free read.
    for (const [table, id] of [['notes', noteId], ['bookmarks', bookmarkId], ['highlights', highlightId]]) {
        assert.equal((await withUser(pool, userB, client =>
            client.query(`SELECT * FROM ${table} WHERE id = $1`, [id]))).rows.length, 1, table);
        assert.equal((await withUser(pool, userA, client =>
            client.query(`SELECT * FROM ${table} WHERE id = $1`, [id]))).rows.length, 0, table);
        assert.equal((await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows.length, 0, table);
        // A's DELETE cannot touch B's rows.
        assert.equal((await withUser(pool, userA, client =>
            client.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [id]))).rows.length, 0, table);
    }
    assert.equal((await withUser(pool, userB, client =>
        client.query('SELECT * FROM user_reading_state WHERE user_id = $1', [userB]))).rows.length, 1);
    assert.equal((await withUser(pool, userA, client =>
        client.query('SELECT * FROM user_reading_state WHERE user_id = $1', [userB]))).rows.length, 0);
    assert.equal((await pool.query('SELECT * FROM user_reading_state WHERE user_id = $1', [userB])).rows.length, 0);
    // A's writes for B fail, and A's UPDATE cannot change B's note.
    await assert.rejects(withUser(pool, userA, client => client.query(
        `INSERT INTO notes(user_id, book_id, start_chapter, start_verse, end_chapter, end_verse, content)
         VALUES ($1, 1, 1, 1, 1, 2, 'wrong user')`, [userB])), { code: '42501' });
    assert.equal((await withUser(pool, userA, client =>
        client.query("UPDATE notes SET content = 'hijacked' WHERE id = $1 RETURNING *", [noteId]))).rows.length, 0);
    assert.equal((await withUser(pool, userB, client =>
        client.query('SELECT content FROM notes WHERE id = $1', [noteId]))).rows[0].content, 'seed note');
    // The owner can still update and delete their own row.
    assert.equal((await withUser(pool, userB, client =>
        client.query("UPDATE notes SET content = 'edited' WHERE id = $1 RETURNING *", [noteId]))).rows.length, 1);
    assert.equal((await withUser(pool, userB, client =>
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
    // One updatable column per table, for the write-isolation checks.
    const updateColumn = { bookmarks: 'end_verse = 3', highlights: "color = '#000000'" };
    const updateCheck = { bookmarks: ['end_verse', 3], highlights: ['color', '#000000'] };
    for (const [table, id] of [['bookmarks', bookmarkId], ['highlights', highlightId]]) {
        assert.equal((await withUser(pool, userA, client =>
            client.query(`SELECT * FROM ${table} WHERE id = $1`, [id]))).rows.length, 1, table);
        assert.equal((await withUser(pool, userB, client =>
            client.query(`SELECT * FROM ${table} WHERE id = $1`, [id]))).rows.length, 0, table);
        assert.equal((await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows.length, 0, table);
        // Cross-user and context-free UPDATE affect zero rows.
        assert.equal((await withUser(pool, userB, client =>
            client.query(`UPDATE ${table} SET ${updateColumn[table]} WHERE id = $1 RETURNING *`, [id]))).rows.length, 0, table);
        assert.equal((await pool.query(`UPDATE ${table} SET ${updateColumn[table]} WHERE id = $1`, [id])).rowCount, 0, table);
        // The owner can still update their own row, and the change lands.
        assert.equal((await withUser(pool, userA, client =>
            client.query(`UPDATE ${table} SET ${updateColumn[table]} WHERE id = $1 RETURNING *`, [id]))).rows.length, 1, table);
        assert.equal((await withUser(pool, userA, client =>
            client.query(`SELECT ${updateCheck[table][0]} FROM ${table} WHERE id = $1`, [id]))).rows[0][updateCheck[table][0]], updateCheck[table][1], table);
        // Cross-user DELETE affects zero rows and never errors.
        assert.equal((await withUser(pool, userB, client =>
            client.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [id]))).rows.length, 0, table);
    }
    // Writes without a context, and writes for another user, fail.
    await assert.rejects(withUser(pool, userB, client => client.query(
        `INSERT INTO bookmarks(user_id, book_id, start_chapter, start_verse, end_chapter, end_verse)
         VALUES ($1, 1, 1, 1, 1, 2)`, [userA])), { code: '42501' });
    await assert.rejects(pool.query(
        `INSERT INTO bookmarks(user_id, book_id, start_chapter, start_verse, end_chapter, end_verse)
         VALUES ($1, 1, 1, 1, 1, 2)`, [userA]), { code: '42501' });
    await assert.rejects(withUser(pool, userB, client => client.query(
        `INSERT INTO highlights(user_id, book_id, chapter, verse, color)
         VALUES ($1, 1, 1, 1, '#FFD54F')`, [userA])), { code: '42501' });
    await assert.rejects(pool.query(
        `INSERT INTO highlights(user_id, book_id, chapter, verse, color)
         VALUES ($1, 1, 1, 1, '#FFD54F')`, [userA]), { code: '42501' });
    assert.equal((await withUser(pool, userA, client =>
        client.query('SELECT * FROM user_reading_state WHERE user_id = $1', [userA]))).rows.length, 1);
    assert.equal((await withUser(pool, userB, client =>
        client.query('SELECT * FROM user_reading_state WHERE user_id = $1', [userA]))).rows.length, 0);
    assert.equal((await pool.query('SELECT * FROM user_reading_state WHERE user_id = $1', [userA])).rows.length, 0);
    // UPDATE isolation: cross-user and context-free updates affect zero
    // rows; the owner can still update their own row.
    assert.equal((await withUser(pool, userB, client =>
        client.query('UPDATE user_reading_state SET chapter_number = 2 WHERE user_id = $1 RETURNING *', [userA]))).rows.length, 0);
    assert.equal((await pool.query('UPDATE user_reading_state SET chapter_number = 2 WHERE user_id = $1', [userA])).rowCount, 0);
    assert.equal((await withUser(pool, userA, client =>
        client.query('UPDATE user_reading_state SET chapter_number = 2 WHERE user_id = $1 RETURNING *', [userA]))).rows.length, 1);
    assert.equal((await withUser(pool, userA, client =>
        client.query('SELECT chapter_number FROM user_reading_state WHERE user_id = $1', [userA]))).rows[0].chapter_number, 2);
    assert.equal((await withUser(pool, userA, client =>
        client.query('UPDATE user_reading_state SET chapter_number = 1 WHERE user_id = $1 RETURNING *', [userA]))).rows.length, 1);
    // Cross-user and context-free INSERT fail.
    await assert.rejects(withUser(pool, userB, client => client.query(
        `INSERT INTO user_reading_state(user_id, book_id, chapter_number, translation)
         VALUES ($1, 1, 2, 'KJV')`, [userA])), { code: '42501' });
    await assert.rejects(pool.query(
        `INSERT INTO user_reading_state(user_id, book_id, chapter_number, translation)
         VALUES ($1, 1, 2, 'KJV')`, [userA]), { code: '42501' });
    // Reading state has no DELETE policy and no DELETE grant: the grant
    // check runs before RLS is consulted, so even the owner gets 42501
    // (not zero rows) — and the row survives.
    await assert.rejects(withUser(pool, userA, client =>
        client.query('DELETE FROM user_reading_state WHERE user_id = $1 RETURNING *', [userA])),
        { code: '42501' });
    assert.equal((await withUser(pool, userA, client =>
        client.query('SELECT * FROM user_reading_state WHERE user_id = $1', [userA]))).rows.length, 1);
});

test('MFA and device tables isolate the same way', async () => {
    const { pool } = database;
    // user_mfa: enrolled defaults false, key_version/mfa_generation have
    // defaults, so user_id + secret_encrypted is a complete row.
    await withUser(pool, userA, client => client.query(
        "INSERT INTO user_mfa(user_id, secret_encrypted) VALUES ($1, 'synthetic-secret')", [userA]));
    await withUser(pool, userA, client => client.query(
        "INSERT INTO mfa_recovery_codes(user_id, code_hash, code_salt) VALUES ($1, 'synthetic-hash', 'synthetic-salt')", [userA]));
    await withUser(pool, userA, client => client.query(
        "INSERT INTO known_login_devices(user_id, device_key) VALUES ($1, $2)", [userA, Buffer.from([1])]));
    // Each table's per-user UPDATE column, for the cross-user UPDATE check.
    const updateColumn = {
        user_mfa: 'enrolled = true',
        mfa_recovery_codes: 'used_at = now()',
        known_login_devices: 'last_seen_at = now()',
    };
    for (const table of ['user_mfa', 'mfa_recovery_codes', 'known_login_devices']) {
        // Owner reads their own row; the other user reads zero rows.
        assert.equal((await withUser(pool, userA, client =>
            client.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userA]))).rows.length, 1, table);
        assert.equal((await withUser(pool, userB, client =>
            client.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userA]))).rows.length, 0, table);
        assert.equal((await pool.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userA])).rows.length, 0, table);
        // Cross-user UPDATE affects zero rows and changes nothing.
        assert.equal((await withUser(pool, userB, client =>
            client.query(`UPDATE ${table} SET ${updateColumn[table]} WHERE user_id = $1 RETURNING *`, [userA]))).rows.length, 0, table);
        assert.equal((await pool.query(`UPDATE ${table} SET ${updateColumn[table]} WHERE user_id = $1`, [userA])).rowCount, 0, table);
        // The owner can still update their own row.
        assert.equal((await withUser(pool, userA, client =>
            client.query(`UPDATE ${table} SET ${updateColumn[table]} WHERE user_id = $1 RETURNING *`, [userA]))).rows.length, 1, table);
        // These tables have no DELETE policy and no DELETE grant: the
        // grant check runs before RLS is consulted, so even the owner
        // gets 42501 (not zero rows) — and the row survives.
        await assert.rejects(withUser(pool, userA, client =>
            client.query(`DELETE FROM ${table} WHERE user_id = $1 RETURNING *`, [userA])),
            { code: '42501' });
        assert.equal((await withUser(pool, userA, client =>
            client.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userA]))).rows.length, 1, table);
    }
    // Writes without a context, and writes for another user, fail.
    await assert.rejects(pool.query(
        "INSERT INTO user_mfa(user_id, secret_encrypted) VALUES ($1, 'no context')", [userA]), { code: '42501' });
    await assert.rejects(withUser(pool, userB, client => client.query(
        "INSERT INTO user_mfa(user_id, secret_encrypted) VALUES ($1, 'wrong user')", [userA])), { code: '42501' });
    await assert.rejects(pool.query(
        "INSERT INTO mfa_recovery_codes(user_id, code_hash, code_salt) VALUES ($1, 'no context', 'salt')", [userA]), { code: '42501' });
    await assert.rejects(withUser(pool, userB, client => client.query(
        "INSERT INTO mfa_recovery_codes(user_id, code_hash, code_salt) VALUES ($1, 'wrong user', 'salt')", [userA])), { code: '42501' });
    await assert.rejects(pool.query(
        "INSERT INTO known_login_devices(user_id, device_key) VALUES ($1, $2)", [userA, Buffer.from([2])]), { code: '42501' });
    await assert.rejects(withUser(pool, userB, client => client.query(
        "INSERT INTO known_login_devices(user_id, device_key) VALUES ($1, $2)", [userA, Buffer.from([2])])), { code: '42501' });
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

// The other transaction owners must clear the context exactly like
// withUser: withUserBudget, saveHighlights, and DELETE /account each
// set app.user_id after BEGIN on a client they own. Each test below
// runs the real path on the installed one-connection pool, then reads
// context-free on that same client: a leaked context would make the
// read see the user's rows.
async function assertContextCleared(single) {
    const ctx = (await single.query(
        "SELECT current_setting('app.user_id', true) AS ctx")).rows[0].ctx;
    assert.ok(ctx === '' || ctx === null, `context must clear, got: ${JSON.stringify(ctx)}`);
    assert.equal((await single.query('SELECT count(*)::int AS n FROM notes')).rows[0].n, 0);
}

test('withUserBudget clears the context on commit', async () => {
    const single = installSinglePool();
    // Lazy require: src/db/db must resolve to the installed pool.
    const { withUserBudget } = require('../../src/utils/storageBudget');
    const noteId = await seedNote(userA);
    let sawContext = false;
    await withUserBudget(userA, async client => {
        assert.equal((await client.query(
            "SELECT current_setting('app.user_id', true) AS ctx")).rows[0].ctx, String(userA));
        sawContext = true;
        assert.equal((await client.query(
            'SELECT count(*)::int AS n FROM notes WHERE user_id = $1 AND id = $2', [userA, noteId])).rows[0].n, 1);
    });
    assert.equal(sawContext, true, 'the budget callback must run with the context set');
    await assertContextCleared(single);
});

test('saveHighlights clears the context on commit', async () => {
    const single = installSinglePool();
    const { saveHighlights } = require('../../src/services/highlightsService');
    // The disposable runner seeds one fixture book (chapter 1, verses
    // 1–3); look it up by name rather than assuming its id.
    const bookId = (await database.pool.query(
        "SELECT id FROM bible_books WHERE name = 'Synthetic harness book'")).rows[0].id;
    const rows = await saveHighlights(userA, bookId, [{ chapter: 1, verse: 1 }], '#FFD54F');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, userA);
    assert.equal(rows[0].chapter, 1);
    assert.equal(rows[0].verse, 1);
    await assertContextCleared(single);
    // The row itself landed, for its owner only.
    assert.equal((await withUser(database.pool, userA, client => client.query(
        'SELECT count(*)::int AS n FROM highlights WHERE user_id = $1 AND book_id = $2 AND chapter = 1 AND verse = 1',
        [userA, bookId]))).rows[0].n, 1);
});

test('DELETE /account clears the context on commit', async () => {
    const single = installSinglePool();
    // In-process app on the installed one-connection pool: the handler
    // borrows the pool's only client, so the follow-up query below
    // reuses the exact client the deletion committed on. Env mirrors
    // the values test/helpers/backend-instance.js gives workers.
    process.env.GNOSIS_TEST_ISOLATION = '1';
    process.env.JWT_SECRET = 'synthetic-rls-test-jwt-secret-synthetic-test-jwt-secret';
    process.env.RATE_LIMIT_KEY_SECRET = 'synthetic-rls-test-rate-limit-secret';
    process.env.RESEND_API_KEY = 'synthetic-test-resend-key';
    process.env.EMAIL_FROM = 'Gnosis Test <test@example.invalid>';
    process.env.FRONTEND_URL = 'https://frontend.example.invalid';
    const app = require('../../src/app');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
        const password = 'synthetic-delete-password';
        const email = 'rls-delete@example.invalid';
        const id = (await database.pool.query(
            `INSERT INTO users(first_name, last_name, email, password_hash, email_verified_at)
             VALUES ('Rls', 'Delete', $1, $2, now()) RETURNING id`,
            [email, await bcrypt.hash(password, 4)])).rows[0].id;
        await seedNote(id);
        const login = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Connection: 'close' },
            body: JSON.stringify({ email, password }),
            signal: AbortSignal.timeout(10000),
        });
        const loginText = await login.text();
        assert.equal(login.status, 200, loginText);
        const token = JSON.parse(loginText).token;
        assert.equal(typeof token, 'string');
        const deleted = await fetch(`${baseUrl}/api/auth/account`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', Connection: 'close', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ password }),
            signal: AbortSignal.timeout(10000),
        });
        assert.equal(deleted.status, 200, await deleted.text());
        // The deletion committed, and the client it committed on carries
        // no context into its next use.
        assert.equal((await database.pool.query(
            'SELECT count(*)::int AS n FROM users WHERE id = $1', [id])).rows[0].n, 0);
        await assertContextCleared(single);
    } finally {
        if (server.closeAllConnections) server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('withUser rolls back on COMMIT failure and clears the context', async () => {
    // COMMIT is forced to fail by patching the borrowed client's query
    // — a genuine server-side COMMIT failure (e.g. a deferred
    // constraint) is not available in this harness. What this proves is
    // the error path itself: the original error propagates, the
    // ROLLBACK that follows succeeds, the row never lands, the client
    // is released whole (not destroyed), and the context is cleared on
    // the reused client. It does NOT prove a real COMMIT failure
    // behaves identically at the server level.
    const real = new Pool({ ...context, max: 1, connectionTimeoutMillis: 5000 });
    try {
        const client = await real.connect();
        const origQuery = client.query.bind(client);
        const origRelease = client.release.bind(client);
        let releasedWith = 'not-called';
        client.query = async (...args) => {
            if (args[0] === 'COMMIT') throw new Error('synthetic COMMIT failure');
            return origQuery(...args);
        };
        client.release = error => { releasedWith = error; origRelease(error); };
        const marker = new Error('synthetic COMMIT failure');
        await assert.rejects(
            withUser({ connect: async () => client }, userA, async inner => {
                await inner.query(
                    `INSERT INTO notes(user_id, book_id, start_chapter, start_verse, end_chapter, end_verse, content)
                     VALUES ($1, 1, 1, 1, 1, 2, 'commit-failure probe')`, [userA]);
            }),
            error => error.message === marker.message);
        assert.equal(releasedWith, false, 'a successful ROLLBACK must release the client whole');
        client.query = origQuery;
        client.release = origRelease;
        // The probe row was rolled back, and the context is gone on the
        // reused client.
        assert.equal((await withUser(database.pool, userA, inner => inner.query(
            "SELECT count(*)::int AS n FROM notes WHERE user_id = $1 AND content = 'commit-failure probe'",
            [userA]))).rows[0].n, 0);
        const ctx = (await real.query(
            "SELECT current_setting('app.user_id', true) AS ctx")).rows[0].ctx;
        assert.ok(ctx === '' || ctx === null, `context must clear, got: ${JSON.stringify(ctx)}`);
        assert.equal((await real.query('SELECT count(*)::int AS n FROM notes')).rows[0].n, 0);
    } finally {
        await real.end();
    }
});

test('withUser destroys the client when ROLLBACK fails', async () => {
    // ROLLBACK is forced to fail by patching the borrowed client's
    // query — the same failure mode a dead connection produces, without
    // killing a real backend. What this proves: withUser releases with
    // the broken flag (release(true)), pg destroys that client instead
    // of returning it to the pool, and the next checkout is a fresh
    // client carrying no context. It does NOT prove pg destroys the
    // client for any other reason — release(true) destroying the
    // client is pg's documented contract, exercised here through the
    // real pool.
    const real = new Pool({ ...context, max: 1, connectionTimeoutMillis: 5000 });
    try {
        const client = await real.connect();
        const origQuery = client.query.bind(client);
        const origRelease = client.release.bind(client);
        let releasedWith = 'not-called';
        client.query = async (...args) => {
            if (args[0] === 'ROLLBACK') throw new Error('synthetic ROLLBACK failure');
            return origQuery(...args);
        };
        client.release = error => { releasedWith = error; origRelease(error); };
        const marker = new Error('synthetic withUser failure');
        await assert.rejects(
            withUser({ connect: async () => client }, userA, async () => { throw marker; }),
            error => error === marker);
        assert.equal(releasedWith, true, 'a failed ROLLBACK must release the client as broken');
        client.query = origQuery;
        client.release = origRelease;
        // The destroyed client is never handed out again: the next
        // checkout is a different client object, with no context.
        const next = await real.connect();
        assert.notEqual(next, client, 'a destroyed client must not be reused');
        next.release();
        assert.equal((await real.query('SELECT count(*)::int AS n FROM notes')).rows[0].n, 0);
    } finally {
        await real.end();
    }
});
