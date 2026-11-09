const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Client } = require('pg');
const { spawnSync } = require('node:child_process');
const { connectionFor, projectDir, baselineName, lockId, projects, baselineCatalogPath } = require('../../scripts/migrations/config');
const { execute } = require('../../scripts/migrations/runner');
const { catalog, differences } = require('../../scripts/migrations/catalog');

if (process.env.GNOSIS_MIGRATION_TEST_TARGET !== 'test') throw new Error('Use the explicit test-target launcher.');
// Validate before opening any connection or issuing destructive test setup.
const config = connectionFor('test', process.env, 'app');
const run = (project, command, extra = {}) => execute({ command, target: 'test', project, ...extra });
// The three histories share one database in tests (one tracking table per
// project). Bible first: in a shared database its baseline must run
// before the Commentary baseline creates the bible_books copy.
async function runAll(command, extra = {}) {
    const results = {};
    for (const project of ['bible', 'app', 'commentary']) {
        results[project] = await run(project, command, extra);
    }
    return results;
}
// Expected applied history per project, in file order.
const PROJECTS = {
    app: { applied: [baselineName, '20261103010729_add-auth-rate-limiting', '20261104021959_add-email-verification', '20261105231211_add-password-reset', '20261106144711_add-licensed-translations-cache', '20261106190359_add-user-reading-state', '20261106210000_add-sessions', '20261107005916_add-licensed-cache-verse-count-index', '20261107010016_add-licensed-ip-limits-window-index', '20261109215600_add-passkeys'] },
    bible: { applied: [baselineName, '20261106144711_add-licensed-translations', '20261106234443_add-original-language-analysis', '20261107051000_allow-verse-zero-in-original-language'] },
    commentary: { applied: [baselineName] },
};
let db;
let scratch;
let baselines = {};
async function reset() {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
}
async function fixtureDir(project, sql) {
    const dir = await fs.mkdtemp(path.join(scratch, 'case-'));
    // Copy every real migration, then a fixture that sorts after all of
    // them: history validation requires applied history to be a prefix of
    // the directory's files, so a fixture dated between real migrations
    // would break every test that applies real migrations first. The
    // far-future stamp keeps the fixture last by construction.
    for (const name of await fs.readdir(projectDir(project))) {
        if (name.endsWith('.sql')) {
            await fs.copyFile(path.join(projectDir(project), name), path.join(dir, name));
        }
    }
    await fs.writeFile(path.join(dir, '29990101000000_fixture.sql'), sql);
    return dir;
}

test.before(async () => {
    db = new Client({ ...config, connectionTimeoutMillis: 5000 });
    db.on('error', () => {});
    try { await db.connect(); } catch { throw new Error('Disposable test database connection failed; details suppressed.'); }
    scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'gnosis-migrations-'));
    for (const project of projects) {
        baselines[project] = (await fs.readFile(path.join(projectDir(project), `${baselineName}.sql`), 'utf8')).split('-- Down Migration')[0];
    }
});
test.after(async () => {
    if (db) await db.end();
    if (scratch) await fs.rm(scratch, { recursive: true, force: true });
});
test.beforeEach(reset);

test('empty database initializes, catalog matches fixture, and rerun is a no-op', async () => {
    // Baseline-only directory: this test pins baseline initialization
    // exactly, independent of later real migrations. Every project gets
    // its own run, on a reset database each time.
    for (const project of projects) {
        await reset();
        const dir = await fs.mkdtemp(path.join(scratch, 'baseline-only-'));
        await fs.copyFile(path.join(projectDir(project), `${baselineName}.sql`), path.join(dir, `${baselineName}.sql`));
        assert.deepEqual((await run(project, 'up', { dir })).migrations, [baselineName]);
        assert.deepEqual((await run(project, 'up', { dir })).migrations, []);
        const expected = JSON.parse(await fs.readFile(baselineCatalogPath(project), 'utf8'));
        assert.deepEqual(differences(await catalog(db), expected), []);
        const result = await run(project, 'check', { dir });
        assert.equal(result.baselineMatches, true);
        assert.deepEqual(result.pending, []);
    }
});
test('check validates schema after applied migrations, not only the baseline', async () => {
    // Baseline first, then the project's remaining migrations, exactly
    // as an operator applies them. Check must account for the applied
    // migrations: a correctly migrated database matches, with nothing
    // pending and no differences.
    for (const project of projects) {
        await reset();
        const dir = await fs.mkdtemp(path.join(scratch, 'baseline-only-'));
        await fs.copyFile(path.join(projectDir(project), `${baselineName}.sql`), path.join(dir, `${baselineName}.sql`));
        await run(project, 'up', { dir });
        await run(project, 'up');
        const result = await run(project, 'check');
        assert.deepEqual(result.applied, PROJECTS[project].applied);
        assert.deepEqual(result.pending, []);
        assert.equal(result.baselineMatches, true);
        assert.deepEqual(result.differences, []);
    }

});
test('post-baseline migration catalog deltas match regenerated schemas', async () => {
    // Each post-baseline migration ships a sibling delta generated by diffing
    // the catalog before and after applying it. Regenerate every delta from
    // the migration SQL and pin the committed files, so a migration can never
    // ship without a current delta: a missing or stale delta would make check
    // report that migration's objects as differences.
    for (const project of projects) {
        const files = (await fs.readdir(projectDir(project))).filter(name => name.endsWith('.sql')).sort();
        let previous = null;
        for (let i = 0; i < files.length; i++) {
            const dir = await fs.mkdtemp(path.join(scratch, 'prefix-'));
            for (const name of files.slice(0, i + 1)) {
                await fs.copyFile(path.join(projectDir(project), name), path.join(dir, name));
            }
            await reset();
            await run(project, 'up', { dir });
            const current = await catalog(db);
            if (i === 0) { previous = current; continue; }
            const migrationName = files[i].slice(0, -4);
            const committed = JSON.parse(await fs.readFile(path.resolve(projectDir(project), '../../migration-catalogs', `${migrationName}.catalog.json`), 'utf8'));
            const added = current.filter(row => {
                const before = previous.find(item => item.kind === row.kind && item.name === row.name);
                return !before || JSON.stringify(before.definition) !== JSON.stringify(row.definition);
            });
            const removed = previous.filter(row => !current.some(item => item.kind === row.kind && item.name === row.name))
                .map(row => `${row.kind}:${row.name}`);
            assert.deepEqual({ added, removed }, committed);
            previous = current;
        }
    }
});
test('reference schema matches the authoritative initial baseline', async () => {
    for (const project of projects) {
        const reference = await fs.readFile(path.resolve(projectDir(project), `../../schema.${project}.sql`), 'utf8');
        const withoutComments = sql => sql.replace(/^--.*$/gm, '').trim();
        assert.equal(withoutComments(reference), withoutComments(baselines[project]));
    }
});
test('NOT NULL comparison handles PostgreSQL 14 and 18 without hiding invalid constraints', async () => {
    await db.query(baselines.app);
    const expected = await catalog(db);
    const version = Number((await db.query('SHOW server_version_num')).rows[0].server_version_num);
    const notNullRows = (await db.query(`SELECT count(*)::int AS n FROM pg_constraint
        WHERE conrelid='users'::regclass AND contype='n'`)).rows[0].n;
    assert.equal(notNullRows > 0, version >= 180000);
    assert.ok(!expected.some(row => row.kind === 'constraint' && row.name === 'users.users_id_not_null'));
    await db.query('ALTER TABLE notes ALTER COLUMN content DROP NOT NULL');
    assert.ok(differences(await catalog(db), expected).includes('column:notes.content'));
    if (version >= 180000) {
        await db.query('ALTER TABLE users ADD CONSTRAINT pending_name NOT NULL first_name NOT VALID');
        const actual = await catalog(db);
        assert.ok(actual.some(row => row.kind === 'constraint' && row.name === 'users.pending_name'
            && row.definition.validated === false));
        assert.ok(differences(actual, expected).includes('constraint:users.pending_name'));
    }
});
test('existing schema refuses baseline DDL; adoption preserves data and sequences and marks only baseline', async () => {
    await db.query(baselines.app);
    await db.query("INSERT INTO users(email,password_hash) VALUES ('synthetic@example.invalid','synthetic')");
    const before = await catalog(db);
    const dir = await fixtureDir('app', '-- Up Migration\nCREATE TABLE fixture(id integer);\n-- Down Migration\nDROP TABLE fixture;');
    await assert.rejects(run('app', 'up', { dir }), /Existing schema/);
    await assert.rejects(db.query('SELECT * FROM public.pgmigrations_app'));
    assert.deepEqual((await run('app', 'baseline', { dir })).migrations, [baselineName]);
    assert.deepEqual(await catalog(db), before);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 1);
    assert.equal((await db.query("INSERT INTO users(email) VALUES ('second@example.invalid') RETURNING id")).rows[0].id, 2);
    assert.deepEqual((await db.query('SELECT name FROM pgmigrations_app')).rows, [{ name: baselineName }]);
    await assert.rejects(run('app', 'baseline', { dir }), /already has/);
    assert.deepEqual((await run('app', 'up', { dir })).migrations,
        ['20261103010729_add-auth-rate-limiting', '20261104021959_add-email-verification', '20261105231211_add-password-reset', '20261106144711_add-licensed-translations-cache', '20261106190359_add-user-reading-state', '20261106210000_add-sessions', '20261107005916_add-licensed-cache-verse-count-index', '20261107010016_add-licensed-ip-limits-window-index', '20261109215600_add-passkeys', '29990101000000_fixture']);

});
test('partial and drifted schemas refuse adoption without tracking or repairs', async () => {
    await db.query('CREATE TABLE users(id integer)');
    await assert.rejects(run('app', 'baseline'), /differs/);
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app') AS value")).rows[0].value, null);
    await reset();
    await db.query(baselines.app);
    await db.query('ALTER TABLE users ALTER COLUMN first_name TYPE text');
    const before = await catalog(db);
    assert.equal((await run('app', 'check')).baselineMatches, false);
    await assert.rejects(run('app', 'baseline'), /differs/);
    assert.deepEqual(await catalog(db), before);
});
test('failed migration rolls back schema and history and can safely retry', async () => {
    await run('app', 'up');
    const dir = await fixtureDir('app', '-- Up Migration\nCREATE TABLE fixture(id integer); SELECT 1/0;\n-- Down Migration\nDROP TABLE fixture;');
    await assert.rejects(run('app', 'up', { dir }), /stage \[migration runner\]/);
    assert.equal((await db.query("SELECT to_regclass('public.fixture') AS value")).rows[0].value, null);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM pgmigrations_app')).rows[0].n, 10);
    await fs.writeFile(path.join(dir, '29990101000000_fixture.sql'), '-- Up Migration\nCREATE TABLE fixture(id integer);\n-- Down Migration\nDROP TABLE fixture;');
    await run('app', 'up', { dir });
    assert.deepEqual((await run('app', 'down', { dir })).migrations, ['29990101000000_fixture']);
    assert.deepEqual((await run('app', 'down', { dir })).migrations, ['20261109215600_add-passkeys']);
    assert.deepEqual((await run('app', 'down', { dir })).migrations, ['20261107010016_add-licensed-ip-limits-window-index']);
    assert.deepEqual((await run('app', 'down', { dir })).migrations, ['20261107005916_add-licensed-cache-verse-count-index']);
    assert.deepEqual((await run('app', 'down', { dir })).migrations, ['20261106210000_add-sessions']);
    assert.deepEqual((await run('app', 'down', { dir })).migrations, ['20261106190359_add-user-reading-state']);
    assert.deepEqual((await run('app', 'down', { dir })).migrations, ['20261106144711_add-licensed-translations-cache']);
    assert.deepEqual((await run('app', 'down', { dir })).migrations, ['20261105231211_add-password-reset']);
    assert.deepEqual((await run('app', 'down', { dir })).migrations, ['20261104021959_add-email-verification']);
    assert.deepEqual((await run('app', 'down', { dir })).migrations, ['20261103010729_add-auth-rate-limiting']);
    await assert.rejects(run('app', 'down', { dir }), /irreversible/);

});
test('baseline SQL itself is irreversible, even outside the wrapper', async () => {
    for (const project of projects) {
        await reset();
        const sql = await fs.readFile(path.join(projectDir(project), `${baselineName}.sql`), 'utf8');
        await assert.rejects(db.query(sql.split('-- Down Migration')[1]), /irreversible/);
    }
});
test('failed initial batch rolls back baseline DDL and supports retry', async () => {
    const dir = await fixtureDir('app', '-- Up Migration\nSELECT 1/0;\n-- Down Migration\nSELECT 1;');
    await assert.rejects(run('app', 'up', { dir }), /stage \[migration runner\]/);
    assert.equal((await db.query("SELECT to_regclass('public.users') AS value")).rows[0].value, null);
    assert.deepEqual((await run('app', 'up')).migrations, PROJECTS.app.applied);

});
test('concurrent migration operation is refused while the shared advisory lock is held', async () => {
    await db.query('SELECT pg_advisory_lock($1::bigint)', [lockId]);
    try { await assert.rejects(run('app', 'up'), /Another migration/); }
    finally { await db.query('SELECT pg_advisory_unlock($1::bigint)', [lockId]); }
    await run('app', 'up');
});
test('unknown, missing and out-of-order history is refused', async () => {
    await run('app', 'up');
    const dir = await fixtureDir('app', '-- Up Migration\nCREATE TABLE fixture(id integer);\n-- Down Migration\nDROP TABLE fixture;');
    await run('app', 'up', { dir });
    await assert.rejects(run('app', 'up'), /history/);
    await db.query('UPDATE pgmigrations_app SET name=$1 WHERE name=$2', ['20261023000002_wrong', baselineName]);
    await assert.rejects(run('app', 'up', { dir }), /history/);
});
test('fresh schema supports registration/profile queries and optional names', async () => {
    await run('app', 'up');
    const registered = await db.query(`INSERT INTO users(first_name,last_name,email,password_hash)
        VALUES ($1,$2,$3,$4) RETURNING id,first_name,last_name,email`,
        ['Ada', 'Reader', 'ada@example.invalid', 'synthetic-hash']);
    const profile = await db.query('SELECT id,first_name,last_name,email FROM users WHERE id=$1',
        [registered.rows[0].id]);
    assert.deepEqual(profile.rows, registered.rows);
    const login = await db.query('SELECT * FROM users WHERE email=$1', ['ada@example.invalid']);
    assert.equal(login.rows[0].password_hash, 'synthetic-hash');
    assert.deepEqual((await db.query("INSERT INTO users(email) VALUES ('optional@example.invalid') RETURNING first_name,last_name")).rows,
        [{ first_name: null, last_name: null }]);
});

test('Bible import upsert, verse uniqueness, reading and search work', async () => {
    await run('bible', 'up');
    const book = (await db.query("INSERT INTO bible_books(name) VALUES ('Genesis') RETURNING id")).rows[0].id;
    const translation = (await db.query("INSERT INTO bible_translations(abbreviation) VALUES ('TEST') RETURNING id")).rows[0].id;
    const otherTranslation = (await db.query("INSERT INTO bible_translations(abbreviation) VALUES ('OTHER') RETURNING id")).rows[0].id;
    const chapterSQL = `INSERT INTO bible_chapters(book_id,chapter_number) VALUES ($1,1)
        ON CONFLICT (book_id,chapter_number) DO UPDATE SET book_id=EXCLUDED.book_id RETURNING id`;
    const chapter = (await db.query(chapterSQL, [book])).rows[0].id;
    assert.equal((await db.query(chapterSQL, [book])).rows[0].id, chapter);
    await assert.rejects(db.query('INSERT INTO bible_chapters(book_id,chapter_number) VALUES ($1,1)', [book]),
        { code: '23505', constraint: 'unique_book_chapter' });
    const verseSQL = 'INSERT INTO bible_verses(chapter_id,translation_id,verse_number,text) VALUES ($1,$2,$3,$4)';
    await db.query(verseSQL, [chapter, translation, 1, 'Creation light']);
    await assert.rejects(db.query(verseSQL, [chapter, translation, 1, 'Duplicate']),
        { code: '23505', constraint: 'unique_chapter_translation_verse' });
    await db.query(verseSQL, [chapter, otherTranslation, 1, 'Other translation']);
    await db.query(verseSQL, [chapter, translation, 2, 'Second verse']);
    const read = await db.query(`SELECT v.verse_number,v.text,c.chapter_number,b.name AS book
        FROM bible_verses v JOIN bible_chapters c ON v.chapter_id=c.id
        JOIN bible_books b ON c.book_id=b.id JOIN bible_translations bt ON v.translation_id=bt.id
        WHERE b.name=$1 AND c.chapter_number=$2 AND bt.abbreviation=$3 ORDER BY v.verse_number`,
        ['Genesis', 1, 'TEST']);
    assert.deepEqual(read.rows.map(row => row.verse_number), [1, 2]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM bible_verses WHERE search_vector @@ plainto_tsquery('english','creation')")).rows[0].n, 1);
    await db.query("UPDATE bible_verses SET text='Changed wording' WHERE chapter_id=$1 AND translation_id=$2 AND verse_number=1", [chapter, translation]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM bible_verses WHERE search_vector @@ plainto_tsquery('english','changed')")).rows[0].n, 1);
});

test('commentary imports, search and personal study query shapes work', async () => {
    // All three histories share this database, so the one bible_books
    // table serves the Commentary entries and the App-side notes,
    // bookmarks and highlights alike.
    await runAll('up');
    const book = (await db.query("INSERT INTO bible_books(name) VALUES ('Genesis') RETURNING id")).rows[0].id;
    const user = (await db.query("INSERT INTO users(email) VALUES ('study@example.invalid') RETURNING id")).rows[0].id;
    const source = (await db.query("INSERT INTO sources(name) VALUES ('Test source') RETURNING id")).rows[0].id;
    const commentary = (await db.query("INSERT INTO commentaries(source_id,title) VALUES ($1,'Test commentary') RETURNING id", [source])).rows[0].id;
    const sql = `INSERT INTO commentary_entries(commentary_id,book_id,start_chapter,start_verse,end_chapter,end_verse,content,title)
        VALUES ($1,$2,1,1,1,2,'Creation commentary','Light')
        ON CONFLICT (commentary_id,book_id,start_chapter,start_verse,end_chapter,end_verse) DO NOTHING RETURNING id`;
    assert.equal((await db.query(sql, [commentary, book])).rowCount, 1);
    assert.equal((await db.query(sql, [commentary, book])).rowCount, 0);
    assert.equal((await db.query(`SELECT e.title FROM commentary_entries e
        JOIN commentaries c ON c.id=e.commentary_id JOIN sources s ON s.id=c.source_id
        WHERE e.book_id=$1 AND e.start_chapter<=1 AND e.end_chapter>=1
        AND e.search_vector @@ plainto_tsquery('english','creation')`, [book])).rowCount, 1);
    await db.query('INSERT INTO notes(user_id,book_id,start_chapter,start_verse,end_chapter,end_verse,content) VALUES ($1,$2,1,1,1,2,$3)', [user, book, 'My note']);
    await db.query('INSERT INTO bookmarks(user_id,book_id,start_chapter,start_verse,end_chapter,end_verse) VALUES ($1,$2,1,1,1,2)', [user, book]);
    const highlightSQL = `INSERT INTO highlights(user_id,book_id,chapter,verse,color) VALUES ($1,$2,1,1,$3)
        ON CONFLICT (user_id,book_id,chapter,verse) DO UPDATE SET color=EXCLUDED.color,updated_at=CURRENT_TIMESTAMP RETURNING color`;
    await db.query(highlightSQL, [user, book, '#FFD54F']);
    assert.equal((await db.query(highlightSQL, [user, book, '#112233'])).rows[0].color, '#112233');
    for (const table of ['notes', 'bookmarks', 'highlights']) {
        assert.equal((await db.query(`SELECT * FROM ${table} WHERE user_id=$1`, [user])).rowCount, 1);
    }
    await db.query('DELETE FROM users WHERE id=$1', [user]);
    for (const table of ['notes', 'bookmarks', 'highlights']) {
        assert.equal((await db.query(`SELECT * FROM ${table} WHERE user_id=$1`, [user])).rowCount, 0);
    }
});

test('catalog refuses meaningful drift in columns, constraints, indexes, functions and triggers', async () => {
    // The App and Bible baselines together: the drifted objects below
    // span both projects, and each project's check must catch its own.
    await db.query(baselines.bible);
    await db.query(baselines.app);
    const expected = await catalog(db);
    const changes = [
        'ALTER TABLE users ALTER COLUMN first_name TYPE text',
        "ALTER TABLE users ALTER COLUMN last_name SET DEFAULT 'Unknown'",
        'ALTER TABLE users ALTER COLUMN first_name SET NOT NULL',
        'ALTER TABLE bible_chapters DROP CONSTRAINT unique_book_chapter',
        'ALTER TABLE bible_verses DROP CONSTRAINT unique_chapter_translation_verse',
        'DROP INDEX bible_verses_search_idx',
        'ALTER TABLE bible_verses DISABLE TRIGGER bible_search_vector_trigger',
        "CREATE OR REPLACE FUNCTION update_bible_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$",
        'CREATE TABLE unexpected(id integer)',
    ];
    for (const sql of changes) {
        await db.query('BEGIN');
        try {
            await db.query(sql);
            assert.notDeepEqual(differences(await catalog(db), expected), [], sql);
        } finally { await db.query('ROLLBACK'); }
    }
});
test('CLI suppresses credentials in driver failures and requires explicit target', () => {
    const secret = 'synthetic-DO-NOT-PRINT';
    const result = spawnSync(process.execPath, ['scripts/migrate.js', 'up', '--target', 'test', '--project', 'app'], {
        cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', env: {
            ...process.env,
            MIGRATION_TEST_DATABASE_URL: `postgresql://${secret}:${secret}@127.0.0.1:1/gnosis_migration_test_0123456789abcdef`
        }
    });
    assert.equal(result.status, 1);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
    assert.match(result.stderr, /stage \[connection\]/);
});

// Exercise npm + argument parsing + local configuration + the actual CLI, while
// forcing all routing settings to the validated disposable test database.
function localCLI(command, extraEnv = {}, project = 'app') {
    const url = new URL(process.env.MIGRATION_TEST_DATABASE_URL);
    return spawnSync('npm', ['run', command, '--', '--target', 'local', '--project', project], {
        cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', env: {
            ...process.env,
            DB_HOST: 'synthetic-invalid-application-host', DB_PORT: '1',
            DB_NAME: 'synthetic-application-database', DB_USER: 'synthetic-application-role',
            DB_PASSWORD: 'synthetic-private-application-password',
            MIGRATION_DB_HOST: url.hostname.replace(/^\[|\]$/g, ''), MIGRATION_DB_PORT: url.port || '5432',
            MIGRATION_DB_NAME: url.pathname.slice(1), MIGRATION_DB_USER: decodeURIComponent(url.username),
            MIGRATION_DB_PASSWORD: decodeURIComponent(url.password) || 'synthetic-test-password', PGOPTIONS: '',
            ...extraEnv
        }
    });
}

test('public local CLI fails closed for each missing migration setting despite application credentials', () => {
    for (const name of ['MIGRATION_DB_HOST', 'MIGRATION_DB_PORT', 'MIGRATION_DB_NAME',
        'MIGRATION_DB_USER', 'MIGRATION_DB_PASSWORD']) {
        const result = localCLI('db:migrate:check', { [name]: '' });
        assert.equal(result.status, 1);
        assert.ok(result.stderr.includes(`Local target requires ${name}.`));
        assert.ok(!result.stderr.includes('stage [connection]'));
        assert.ok(!`${result.stdout}${result.stderr}`.includes('synthetic-private-application-password'));
        assert.ok(!`${result.stdout}${result.stderr}`.includes('synthetic-test-password'));
    }
});

test('public local CLI adopts an exact untracked baseline and preserves rows and sequences', async () => {
    await db.query(baselines.app);
    const user = (await db.query("INSERT INTO users(email) VALUES ('cli@example.invalid') RETURNING id")).rows[0].id;
    const checked = localCLI('db:migrate:check');
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /"baselineMatches": true/);
    const adopted = localCLI('db:migrate:baseline');
    assert.equal(adopted.status, 0, adopted.stderr);
    assert.deepEqual((await db.query('SELECT name FROM public.pgmigrations_app')).rows, [{ name: baselineName }]);
    assert.equal((await db.query("SELECT id FROM users WHERE email='cli@example.invalid'")).rows[0].id, user);
    assert.equal((await db.query("INSERT INTO users(email) VALUES ('next-cli@example.invalid') RETURNING id")).rows[0].id, user + 1);
});

test('public CLI distinguishes an exact schema from missing SHARE-lock privileges', async () => {
    await db.query(baselines.app);
    const suffix = new URL(process.env.MIGRATION_TEST_DATABASE_URL).pathname.slice(-16);
    const role = `gnosis_lock_test_${suffix}`;
    await db.query(`CREATE ROLE ${role} LOGIN`);
    try {
        await db.query(`GRANT USAGE,CREATE ON SCHEMA public TO ${role};
            GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role};
            GRANT UPDATE ON bookmarks,highlights,notes TO ${role}`);
        const env = { MIGRATION_DB_USER: role, MIGRATION_DB_PASSWORD: 'synthetic-test-password' };
        const checked = localCLI('db:migrate:check', env);
        assert.equal(checked.status, 0, checked.stderr);
        assert.match(checked.stdout, /"baselineMatches": true/);
        assert.match(checked.stdout, /"adoptionLockPrivileges": false/);
        const adopted = localCLI('db:migrate:baseline', env);
        assert.equal(adopted.status, 1);
        assert.match(adopted.stderr, /stage \[table locking\]/);
        assert.match(adopted.stderr, /SHARE-lock privileges/);
        assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app') AS value")).rows[0].value, null);
        assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app_id_seq') AS value")).rows[0].value, null);
        // The same public CLI succeeds with the operator role; no weaker lock or
        // privilege escalation is introduced to accommodate the application role.
        const operator = localCLI('db:migrate:baseline');
        assert.equal(operator.status, 0, operator.stderr);
        assert.deepEqual((await db.query('SELECT name FROM pgmigrations_app')).rows, [{ name: baselineName }]);
    } finally {
        await reset();
        await db.query(`DROP ROLE ${role}`);
    }
});

test('public CLI reports read-only history creation failure and rolls back all tracking', async () => {
    await db.query(baselines.app);
    const env = { PGOPTIONS: '-c default_transaction_read_only=on' };
    const checked = localCLI('db:migrate:check', env);
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /"baselineMatches": true/);
    const adopted = localCLI('db:migrate:baseline', env);
    assert.equal(adopted.status, 1);
    assert.match(adopted.stderr, /stage \[history creation\] \(read-only transaction\)/);
    assert.ok(!adopted.stderr.includes('CREATE TABLE'));
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app') AS value")).rows[0].value, null);
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app_id_seq') AS value")).rows[0].value, null);
    assert.deepEqual((await run('app', 'baseline')).migrations, [baselineName]);
});

test('public CLI reports table lock contention even for the operator and leaves no history', async () => {
    await db.query(baselines.app);
    await db.query('BEGIN');
    try {
        await db.query('LOCK TABLE users IN ROW EXCLUSIVE MODE');
        const adopted = localCLI('db:migrate:baseline');
        assert.equal(adopted.status, 1);
        assert.match(adopted.stderr, /stage \[table locking\] \(lock unavailable or timed out\)/);
    } finally { await db.query('ROLLBACK'); }
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app') AS value")).rows[0].value, null);
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app_id_seq') AS value")).rows[0].value, null);
    await assertLocksReleased();
});

test('adoption diagnostics distinguish failure stages without leaking driver details', async () => {
    const secret = 'synthetic-private-driver-details';
    for (const [stage, match] of [
        ['connection', null],
        ['locking', sql => sql.startsWith('SELECT pg_try_advisory_lock')],
        ['table locking', sql => sql.startsWith('LOCK TABLE')],
        ['revalidation', sql => sql.includes('WITH objects AS')],
        ['history creation', sql => sql.startsWith('CREATE TABLE "public"."pgmigrations_app"')],
        ['fake-runner', sql => sql.startsWith('INSERT INTO "public"."pgmigrations_app"')],
        ['commit', sql => sql === 'COMMIT']
    ]) {
        await reset();
        await db.query(baselines.app);
        let catalogs = 0;
        const clientFactory = settings => {
            const client = new Client(settings);
            if (stage === 'connection') client.connect = async () => { throw new Error(secret); };
            const query = client.query.bind(client);
            client.query = async (...args) => {
                const sql = typeof args[0] === 'string' ? args[0] : args[0].text;
                if (sql.includes('WITH objects AS')) catalogs++;
                if (match?.(sql) && (stage !== 'revalidation' || catalogs === 2)) throw new Error(secret);
                return query(...args);
            };
            return client;
        };
        await assert.rejects(run('app', 'baseline', { clientFactory }), error => {
            assert.ok(error.safe);
            assert.ok(error.message.includes(`stage [${stage}]`), error.message);
            assert.ok(!error.message.includes(secret));
            return true;
        });
        assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app') AS value")).rows[0].value, null);
        assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app_id_seq') AS value")).rows[0].value, null);
    }
});

test('cleanup failure after commit is reported without suggesting a second adoption', async () => {
    await db.query(baselines.app);
    const clientFactory = settings => {
        const client = new Client(settings);
        const end = client.end.bind(client);
        client.end = async () => { await end(); throw new Error('synthetic-private-close-error'); };
        return client;
    };
    await assert.rejects(run('app', 'baseline', { clientFactory }), error => {
        assert.match(error.message, /Cleanup failed at stage \[connection close\]/);
        assert.match(error.message, /Operation completed/);
        assert.ok(!error.message.includes('synthetic-private-close-error'));
        return true;
    });
    assert.deepEqual((await db.query('SELECT name FROM public.pgmigrations_app')).rows, [{ name: baselineName }]);
    await assertLocksReleased();
});

test('rollback and unlock failures retain the primary stage and still close the connection', async () => {
    await db.query(baselines.app);
    let closed = false;
    const clientFactory = settings => {
        const client = new Client(settings);
        const query = client.query.bind(client);
        const end = client.end.bind(client);
        client.query = async (...args) => {
            const sql = typeof args[0] === 'string' ? args[0] : args[0].text;
            if (sql.startsWith('INSERT INTO "public"."pgmigrations_app"')) throw new Error('synthetic-private-insert');
            const result = await query(...args);
            if (sql === 'ROLLBACK' || sql.startsWith('SELECT pg_advisory_unlock')) throw new Error('synthetic-private-cleanup');
            return result;
        };
        client.end = async () => { await end(); closed = true; };
        return client;
    };
    await assert.rejects(run('app', 'baseline', { clientFactory }), error => {
        assert.match(error.message, /stage \[fake-runner\]/);
        assert.match(error.message, /stage \[rollback\]/);
        assert.match(error.message, /stage \[advisory unlock\]/);
        assert.ok(!error.message.includes('synthetic-private'));
        return true;
    });
    assert.equal(closed, true);
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app') AS value")).rows[0].value, null);
    await assertLocksReleased();
});
test('check on untracked schema is read-only and tracking-like extra objects refuse adoption', async () => {
    assert.equal((await run('app', 'check')).applied.length, 0);
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app') AS value")).rows[0].value, null);
    await db.query(baselines.app);
    await db.query('CREATE TABLE pgmigrations_extra(id integer)');
    await assert.rejects(run('app', 'baseline'), /differs/);
});
test('malformed tracking tables refuse automatic repair', async () => {
    await db.query(baselines.app);
    await db.query('CREATE TABLE pgmigrations_app(id integer,name varchar(255) NOT NULL,run_on timestamp NOT NULL)');
    const before = await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid='pgmigrations_app'::regclass");
    await assert.rejects(run('app', 'baseline'), /tracking schema/);
    assert.deepEqual((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid='pgmigrations_app'::regclass")).rows, before.rows);
});

// Observe the real client, including the pinned runner's queries. No fake database
// or production connection is used. Query strings are kept in memory, not logged.
function adoptionProbe({ beforeCommit, beforeBegin } = {}) {
    const statements = [];
    const notices = [];
    const transactions = [];
    let catalogs = 0;
    return {
        statements, notices, transactions, clientFactory(settings) {
            const client = new Client(settings);
            const rawQuery = client.query.bind(client);
            client.on('notice', notice => notices.push(notice.code));
            client.query = async (...args) => {
                const sql = typeof args[0] === 'string' ? args[0] : args[0].text;
                if (sql === 'BEGIN' && beforeBegin) await beforeBegin();
                if (sql === 'COMMIT' && beforeCommit) await beforeCommit({ client, rawQuery });
                const result = await rawQuery(...args);
                statements.push(sql.trim());
                if (sql.includes('WITH objects AS')) {
                    catalogs += 1;
                    if (catalogs === 2) transactions.push((await rawQuery('SELECT txid_current() AS id')).rows[0].id);
                }
                if (/INSERT INTO.*pgmigrations/i.test(sql)) {
                    transactions.push((await rawQuery('SELECT txid_current() AS id')).rows[0].id);
                }
                return result;
            };
            return client;
        }
    };
}

async function assertUncommittedAndLocked({ client, rawQuery }) {
    // History exists inside adoption's transaction, but not in another session.
    assert.deepEqual((await rawQuery('SELECT name FROM public.pgmigrations_app')).rows, [{ name: baselineName }]);
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app') AS value")).rows[0].value, null);
    assert.equal((await db.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [lockId])).rows[0].acquired, false);
    const locks = (await db.query("SELECT mode FROM pg_locks WHERE pid=$1 AND relation='public.users'::regclass AND granted", [client.processID])).rows;
    assert.ok(locks.some(row => row.mode === 'ShareLock'));
    await db.query('BEGIN');
    try {
        await assert.rejects(db.query('LOCK TABLE public.users IN ROW EXCLUSIVE MODE NOWAIT'), { code: '55P03' });
    } finally {
        await db.query('ROLLBACK');
    }
}

async function assertLocksReleased() {
    assert.equal((await db.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [lockId])).rows[0].acquired, true);
    await db.query('SELECT pg_advisory_unlock($1::bigint)', [lockId]);
    await db.query('BEGIN');
    try { await db.query('LOCK TABLE public.users IN ROW EXCLUSIVE MODE NOWAIT'); }
    finally { await db.query('ROLLBACK'); }
}

test('adoption has one transaction, atomic revalidation/history, and locks through commit', async () => {
    await db.query(baselines.app);
    const probe = adoptionProbe({ beforeCommit: assertUncommittedAndLocked });
    await run('app', 'baseline', { clientFactory: probe.clientFactory });
    assert.equal(probe.statements.filter(sql => sql === 'BEGIN').length, 1);
    assert.equal(probe.statements.filter(sql => sql === 'COMMIT').length, 1);
    assert.equal(probe.statements.filter(sql => sql === 'ROLLBACK').length, 0);
    assert.ok(!probe.notices.includes('25001'), 'No nested transaction warning');
    assert.equal(probe.transactions.length, 2);
    assert.equal(probe.transactions[0], probe.transactions[1]);
    const begin = probe.statements.indexOf('BEGIN');
    const revalidation = probe.statements.findIndex((sql, i) => i > begin && sql.includes('WITH objects AS'));
    const insertion = probe.statements.findIndex(sql => /INSERT INTO.*pgmigrations/i.test(sql));
    assert.ok(begin < revalidation && revalidation < insertion && insertion < probe.statements.indexOf('COMMIT'));
    assert.deepEqual((await db.query('SELECT name FROM public.pgmigrations_app')).rows, [{ name: baselineName }]);
    await assertLocksReleased();
});

test('failure after baseline insertion but before commit rolls back history and releases locks', async () => {
    await db.query(baselines.app);
    const probe = adoptionProbe({
        beforeCommit: async context => {
            await assertUncommittedAndLocked(context);
            throw new Error('Synthetic pre-commit failure');
        }
    });
    await assert.rejects(run('app', 'baseline', { clientFactory: probe.clientFactory }), /stage \[commit\]/);
    assert.equal(probe.statements.filter(sql => sql === 'BEGIN').length, 1);
    assert.equal(probe.statements.filter(sql => sql === 'COMMIT').length, 0);
    assert.equal(probe.statements.filter(sql => sql === 'ROLLBACK').length, 1);
    assert.ok(!probe.notices.includes('25001'));
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app') AS value")).rows[0].value, null);
    await assertLocksReleased();
    assert.deepEqual((await run('app', 'baseline')).migrations, [baselineName]);
});

test('schema change after preflight is caught by transactional revalidation without history', async () => {
    await db.query(baselines.app);
    const probe = adoptionProbe({ beforeBegin: () => db.query('ALTER TABLE users ALTER COLUMN first_name TYPE text') });
    await assert.rejects(run('app', 'baseline', { clientFactory: probe.clientFactory }), /Schema changed/);
    assert.ok(!probe.statements.some(sql => /INSERT INTO.*pgmigrations/i.test(sql)));
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations_app') AS value")).rows[0].value, null);
    await assertLocksReleased();
});


test('explicit local index compatibility upgrades prior-main history without rewriting history or user data', async () => {
    const late = ['20261107005916_add-licensed-cache-verse-count-index', '20261107010016_add-licensed-ip-limits-window-index'];
    const previous = await fs.mkdtemp(path.join(scratch, 'prior-main-'));
    for (const name of await fs.readdir(projectDir('app'))) {
        if (name.endsWith('.sql') && !late.includes(name.slice(0, -4))) await fs.copyFile(path.join(projectDir('app'), name), path.join(previous, name));
    }
    await run('app', 'up', { dir: previous });
    const user = (await db.query("INSERT INTO users(email) VALUES('local-upgrade@example.invalid') RETURNING id")).rows[0].id;
    const oldHistory = (await db.query('SELECT id,name,run_on FROM pgmigrations_app ORDER BY id')).rows;
    // Normal ordering remains strict: a directory whose unapplied
    // migration sorts before an applied one is not a prefix of the
    // applied history, so plain up refuses it. (In the split App
    // history the two late indexes are the only unapplied files, and
    // they sort after everything applied, so the rejection needs a
    // mid-history fixture to demonstrate it.)
    const strictDir = await fs.mkdtemp(path.join(scratch, 'strict-order-'));
    for (const name of await fs.readdir(projectDir('app'))) {
        if (name.endsWith('.sql') && !late.includes(name.slice(0, -4))) await fs.copyFile(path.join(projectDir('app'), name), path.join(strictDir, name));
    }
    await fs.writeFile(path.join(strictDir, '20261106100000_mid-fixture.sql'), '-- Up Migration\nCREATE TABLE mid_fixture(id integer);\n-- Down Migration\nDROP TABLE mid_fixture;');
    await assert.rejects(run('app', 'up', { dir: strictDir }), /history/);
    const result = await run('app', 'up', { allowLateIndexes: true });
    assert.deepEqual(result.migrations, late);
    assert.equal((await db.query("SELECT id FROM users WHERE email='local-upgrade@example.invalid'")).rows[0].id, user);
    const retained = (await db.query('SELECT id,name,run_on FROM pgmigrations_app WHERE name<>ALL($1) ORDER BY id', [late])).rows;
    assert.deepEqual(retained, oldHistory);
    const checked = await run('app', 'check', { allowLateIndexes: true });
    assert.deepEqual(checked.pending, []);
    assert.equal(checked.baselineMatches, true);
    assert.deepEqual((await run('app', 'up', { allowLateIndexes: true })).migrations, []);
    await assert.rejects(run('app', 'down', { allowLateIndexes: true }), /forbidden/);
});
