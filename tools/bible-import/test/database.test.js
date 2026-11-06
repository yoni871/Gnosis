const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { importBible } = require('../src/importBible');
const context = JSON.parse(process.env.GNOSIS_IMPORT_TEST_CONTEXT || 'null');
assert.ok(context && context.host === '127.0.0.1' && /^gnosis_migration_test_[a-f0-9]{16}$/.test(context.database) &&
    /^gnosis_import_[a-f0-9]{16}$/.test(context.user) && /^synthetic-[a-f0-9]{32}$/.test(context.password),
    'Run through the disposable importer database launcher only.');
assert.deepEqual(Object.keys(context).sort(), ['database','host','password','port','user']);
assert.ok(Number.isInteger(context.port) && context.port > 0 && context.port <= 65535);
const config = { ...context, ssl: false, options: '', application_name: 'gnosis-import-tests', connectionTimeoutMillis: 3000 };

test('restricted importer role, committed persistence, existing guard, concurrent imports, and real rollback', async t => {
    const pool = new Pool(config); t.after(() => pool.end());
    const role = (await pool.query(`SELECT current_user,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
        FROM pg_roles WHERE rolname=current_user`)).rows[0];
    assert.equal(role.current_user, context.user);
    for (const flag of ['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls']) assert.equal(role[flag], false);
    const record = { book: 'Genesis', chapter: 1, verse: 1, text: 'Synthetic persistence — λόγος' };
    const input = { records: [record], translationId: 4, translationName: 'Synthetic Translation' };
    const results = await Promise.all([importBible(pool, input), importBible(pool, input)]);
    assert.deepEqual(results.map(r => r.status).sort(), ['imported', 'skipped-existing']);
    const second = new Pool(config);
    try { assert.equal((await second.query('SELECT text FROM bible_verses WHERE translation_id=4')).rows[0].text, record.text); }
    finally { await second.end(); }
    const rollback = { records: [{ ...record, chapter: 2 }, { ...record, chapter: 2 }],
        translationId: 5, translationName: 'Synthetic Rollback' };
    await assert.rejects(importBible(pool, rollback), e => e.code === '23505');
    assert.equal(Number((await pool.query('SELECT count(*) FROM bible_verses WHERE translation_id=5')).rows[0].count), 0);
    assert.equal(Number((await pool.query('SELECT count(*) FROM bible_chapters WHERE chapter_number=2')).rows[0].count), 0);
    assert.equal((await importBible(pool, { ...rollback, records: [rollback.records[0]] })).inserted, 1);
    // Exercise the real explicit-write CLI using only the generated restricted role.
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
    const { spawnSync } = require('node:child_process');
    const XLSX = require('xlsx');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnosis-import-cli-db-'));
    try {
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[], [], [], [1, 'Genesis 3:1', 'Synthetic CLI text']]));
        const file = path.join(dir, 'synthetic.xlsx'); XLSX.writeFile(book, file);
        const url = new URL('postgresql://127.0.0.1');
        url.port = String(context.port); url.username = context.user; url.password = context.password; url.pathname = '/' + context.database;
        const result = spawnSync(process.execPath, ['src/cli.js', 'write', file, '6', 'Synthetic CLI'], {
            env: { ...require('../scripts/test').testEnvironment(), GNOSIS_BIBLE_IMPORT_DATABASE_URL: url.href },
            encoding: 'utf8', timeout: 20000,
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout).inserted, 1);
        assert.equal((await pool.query('SELECT text FROM bible_verses WHERE translation_id=6')).rows[0].text, 'Synthetic CLI text');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
