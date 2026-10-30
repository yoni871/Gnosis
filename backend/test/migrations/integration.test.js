const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Client } = require('pg');
const { spawnSync } = require('node:child_process');
const { connectionFor, migrationsDir, baselineName, lockId } = require('../../scripts/migrations/config');
const { execute } = require('../../scripts/migrations/runner');
const { catalog, differences } = require('../../scripts/migrations/catalog');

if (process.env.GNOSIS_MIGRATION_TEST_TARGET !== 'test') throw new Error('Use the explicit test-target launcher.');
// Validate before opening any connection or issuing destructive test setup.
const config = connectionFor('test');
const run = (command, extra={}) => execute({command,target:'test',...extra});
let db;
let scratch;
let baseline;
async function reset() {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
}
async function fixtureDir(sql) {
    const dir = await fs.mkdtemp(path.join(scratch,'case-'));
    await fs.copyFile(path.join(migrationsDir,`${baselineName}.sql`),path.join(dir,`${baselineName}.sql`));
    await fs.writeFile(path.join(dir,'20261023000001_fixture.sql'),sql);
    return dir;
}

test.before(async () => {
    db = new Client({...config, connectionTimeoutMillis:5000});
    db.on('error',()=>{});
    try { await db.connect(); } catch { throw new Error('Disposable test database connection failed; details suppressed.'); }
    scratch=await fs.mkdtemp(path.join(os.tmpdir(),'gnosis-migrations-'));
    baseline=(await fs.readFile(path.join(migrationsDir,`${baselineName}.sql`),'utf8')).split('-- Down Migration')[0];
});
test.after(async () => {
    if (db) await db.end();
    if (scratch) await fs.rm(scratch,{recursive:true,force:true});
});
test.beforeEach(reset);

test('empty database initializes, catalog matches fixture, and rerun is a no-op', async () => {
    assert.deepEqual((await run('up')).migrations,[baselineName]);
    assert.deepEqual((await run('up')).migrations,[]);
    const expected=JSON.parse(await fs.readFile(path.resolve(migrationsDir,'../baseline.catalog.json'),'utf8'));
    assert.deepEqual(differences(await catalog(db),expected),[]);
    const result=await run('check');
    assert.equal(result.baselineMatches,true);
    assert.deepEqual(result.pending,[]);
});
test('reference schema matches the authoritative initial baseline', async () => {
    const reference = await fs.readFile(path.resolve(migrationsDir,'../schema.sql'),'utf8');
    const withoutComments = sql => sql.replace(/^--.*$/gm,'').trim();
    assert.equal(withoutComments(reference),withoutComments(baseline));
});
test('NOT NULL comparison handles PostgreSQL 14 and 18 without hiding invalid constraints', async () => {
    await db.query(baseline);
    const expected = await catalog(db);
    const version = Number((await db.query('SHOW server_version_num')).rows[0].server_version_num);
    const notNullRows = (await db.query(`SELECT count(*)::int AS n FROM pg_constraint
        WHERE conrelid='users'::regclass AND contype='n'`)).rows[0].n;
    assert.equal(notNullRows > 0,version >= 180000);
    assert.ok(!expected.some(row => row.kind === 'constraint' && row.name === 'users.users_id_not_null'));
    await db.query('ALTER TABLE notes ALTER COLUMN content DROP NOT NULL');
    assert.ok(differences(await catalog(db),expected).includes('column:notes.content'));
    if (version >= 180000) {
        await db.query('ALTER TABLE users ADD CONSTRAINT pending_name NOT NULL first_name NOT VALID');
        const actual = await catalog(db);
        assert.ok(actual.some(row => row.kind === 'constraint' && row.name === 'users.pending_name'
            && row.definition.validated === false));
        assert.ok(differences(actual,expected).includes('constraint:users.pending_name'));
    }
});
test('existing schema refuses baseline DDL; adoption preserves data and sequences and marks only baseline', async () => {
    await db.query(baseline);
    await db.query("INSERT INTO users(email,password_hash) VALUES ('synthetic@example.invalid','synthetic')");
    const before=await catalog(db);
    const dir=await fixtureDir('-- Up Migration\nCREATE TABLE fixture(id integer);\n-- Down Migration\nDROP TABLE fixture;');
    await assert.rejects(run('up',{dir}),/Existing schema/);
    await assert.rejects(db.query('SELECT * FROM public.pgmigrations'));
    assert.deepEqual((await run('baseline',{dir})).migrations,[baselineName]);
    assert.deepEqual(await catalog(db),before);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n,1);
    assert.equal((await db.query("INSERT INTO users(email) VALUES ('second@example.invalid') RETURNING id")).rows[0].id,2);
    assert.deepEqual((await db.query('SELECT name FROM pgmigrations')).rows,[{name:baselineName}]);
    await assert.rejects(run('baseline',{dir}),/already has/);
    assert.deepEqual((await run('up',{dir})).migrations,['20261023000001_fixture']);
});
test('partial and drifted schemas refuse adoption without tracking or repairs', async () => {
    await db.query('CREATE TABLE users(id integer)');
    await assert.rejects(run('baseline'),/differs/);
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations') AS value")).rows[0].value,null);
    await reset();
    await db.query(baseline);
    await db.query('ALTER TABLE users ALTER COLUMN first_name TYPE text');
    const before=await catalog(db);
    assert.equal((await run('check')).baselineMatches,false);
    await assert.rejects(run('baseline'),/differs/);
    assert.deepEqual(await catalog(db),before);
});
test('failed migration rolls back schema and history and can safely retry', async () => {
    await run('up');
    const dir=await fixtureDir('-- Up Migration\nCREATE TABLE fixture(id integer); SELECT 1/0;\n-- Down Migration\nDROP TABLE fixture;');
    await assert.rejects(run('up',{dir}),/operation failed/);
    assert.equal((await db.query("SELECT to_regclass('public.fixture') AS value")).rows[0].value,null);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM pgmigrations')).rows[0].n,1);
    await fs.writeFile(path.join(dir,'20261023000001_fixture.sql'),'-- Up Migration\nCREATE TABLE fixture(id integer);\n-- Down Migration\nDROP TABLE fixture;');
    await run('up',{dir});
    assert.deepEqual((await run('down',{dir})).migrations,['20261023000001_fixture']);
    await assert.rejects(run('down',{dir}),/irreversible/);
});
test('baseline SQL itself is irreversible, even outside the wrapper', async () => {
    const sql=await fs.readFile(path.join(migrationsDir,`${baselineName}.sql`),'utf8');
    await assert.rejects(db.query(sql.split('-- Down Migration')[1]),/irreversible/);
});
test('failed initial batch rolls back baseline DDL and supports retry', async () => {
    const dir=await fixtureDir('-- Up Migration\nSELECT 1/0;\n-- Down Migration\nSELECT 1;');
    await assert.rejects(run('up',{dir}),/operation failed/);
    assert.equal((await db.query("SELECT to_regclass('public.users') AS value")).rows[0].value,null);
    assert.deepEqual((await run('up')).migrations,[baselineName]);
});
test('concurrent migration operation is refused while the shared advisory lock is held', async () => {
    await db.query('SELECT pg_advisory_lock($1::bigint)',[lockId]);
    try { await assert.rejects(run('up'),/Another migration/); }
    finally { await db.query('SELECT pg_advisory_unlock($1::bigint)',[lockId]); }
    await run('up');
});
test('unknown, missing and out-of-order history is refused', async () => {
    await run('up');
    const dir=await fixtureDir('-- Up Migration\nCREATE TABLE fixture(id integer);\n-- Down Migration\nDROP TABLE fixture;');
    await run('up',{dir});
    await assert.rejects(run('up'),/history/);
    await db.query('UPDATE pgmigrations SET name=$1 WHERE name=$2',['20261023000002_wrong',baselineName]);
    await assert.rejects(run('up',{dir}),/history/);
});
test('fresh schema supports registration/profile queries and optional names', async () => {
    await run('up');
    const registered = await db.query(`INSERT INTO users(first_name,last_name,email,password_hash)
        VALUES ($1,$2,$3,$4) RETURNING id,first_name,last_name,email`,
        ['Ada','Reader','ada@example.invalid','synthetic-hash']);
    const profile = await db.query('SELECT id,first_name,last_name,email FROM users WHERE id=$1',
        [registered.rows[0].id]);
    assert.deepEqual(profile.rows,registered.rows);
    const login = await db.query('SELECT * FROM users WHERE email=$1',['ada@example.invalid']);
    assert.equal(login.rows[0].password_hash,'synthetic-hash');
    assert.deepEqual((await db.query("INSERT INTO users(email) VALUES ('optional@example.invalid') RETURNING first_name,last_name")).rows,
        [{first_name:null,last_name:null}]);
});

test('Bible import upsert, verse uniqueness, reading and search work', async () => {
    await run('up');
    const book = (await db.query("INSERT INTO bible_books(name) VALUES ('Genesis') RETURNING id")).rows[0].id;
    const translation = (await db.query("INSERT INTO bible_translations(abbreviation) VALUES ('TEST') RETURNING id")).rows[0].id;
    const otherTranslation = (await db.query("INSERT INTO bible_translations(abbreviation) VALUES ('OTHER') RETURNING id")).rows[0].id;
    const chapterSQL = `INSERT INTO bible_chapters(book_id,chapter_number) VALUES ($1,1)
        ON CONFLICT (book_id,chapter_number) DO UPDATE SET book_id=EXCLUDED.book_id RETURNING id`;
    const chapter = (await db.query(chapterSQL,[book])).rows[0].id;
    assert.equal((await db.query(chapterSQL,[book])).rows[0].id,chapter);
    await assert.rejects(db.query('INSERT INTO bible_chapters(book_id,chapter_number) VALUES ($1,1)',[book]),
        {code:'23505',constraint:'unique_book_chapter'});
    const verseSQL = 'INSERT INTO bible_verses(chapter_id,translation_id,verse_number,text) VALUES ($1,$2,$3,$4)';
    await db.query(verseSQL,[chapter,translation,1,'Creation light']);
    await assert.rejects(db.query(verseSQL,[chapter,translation,1,'Duplicate']),
        {code:'23505',constraint:'unique_chapter_translation_verse'});
    await db.query(verseSQL,[chapter,otherTranslation,1,'Other translation']);
    await db.query(verseSQL,[chapter,translation,2,'Second verse']);
    const read = await db.query(`SELECT v.verse_number,v.text,c.chapter_number,b.name AS book
        FROM bible_verses v JOIN bible_chapters c ON v.chapter_id=c.id
        JOIN bible_books b ON c.book_id=b.id JOIN bible_translations bt ON v.translation_id=bt.id
        WHERE b.name=$1 AND c.chapter_number=$2 AND bt.abbreviation=$3 ORDER BY v.verse_number`,
        ['Genesis',1,'TEST']);
    assert.deepEqual(read.rows.map(row => row.verse_number),[1,2]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM bible_verses WHERE search_vector @@ plainto_tsquery('english','creation')")).rows[0].n,1);
    await db.query("UPDATE bible_verses SET text='Changed wording' WHERE chapter_id=$1 AND translation_id=$2 AND verse_number=1",[chapter,translation]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM bible_verses WHERE search_vector @@ plainto_tsquery('english','changed')")).rows[0].n,1);
});

test('commentary imports, search and personal study query shapes work', async () => {
    await run('up');
    const book = (await db.query("INSERT INTO bible_books(name) VALUES ('Genesis') RETURNING id")).rows[0].id;
    const user = (await db.query("INSERT INTO users(email) VALUES ('study@example.invalid') RETURNING id")).rows[0].id;
    const source = (await db.query("INSERT INTO sources(name) VALUES ('Test source') RETURNING id")).rows[0].id;
    const commentary = (await db.query("INSERT INTO commentaries(source_id,title) VALUES ($1,'Test commentary') RETURNING id",[source])).rows[0].id;
    const sql = `INSERT INTO commentary_entries(commentary_id,book_id,start_chapter,start_verse,end_chapter,end_verse,content,title)
        VALUES ($1,$2,1,1,1,2,'Creation commentary','Light')
        ON CONFLICT (commentary_id,book_id,start_chapter,start_verse,end_chapter,end_verse) DO NOTHING RETURNING id`;
    assert.equal((await db.query(sql,[commentary,book])).rowCount,1);
    assert.equal((await db.query(sql,[commentary,book])).rowCount,0);
    assert.equal((await db.query(`SELECT e.title FROM commentary_entries e
        JOIN commentaries c ON c.id=e.commentary_id JOIN sources s ON s.id=c.source_id
        WHERE e.book_id=$1 AND e.start_chapter<=1 AND e.end_chapter>=1
        AND e.search_vector @@ plainto_tsquery('english','creation')`,[book])).rowCount,1);
    await db.query('INSERT INTO notes(user_id,book_id,start_chapter,start_verse,end_chapter,end_verse,content) VALUES ($1,$2,1,1,1,2,$3)',[user,book,'My note']);
    await db.query('INSERT INTO bookmarks(user_id,book_id,start_chapter,start_verse,end_chapter,end_verse) VALUES ($1,$2,1,1,1,2)',[user,book]);
    const highlightSQL = `INSERT INTO highlights(user_id,book_id,chapter,verse,color) VALUES ($1,$2,1,1,$3)
        ON CONFLICT (user_id,book_id,chapter,verse) DO UPDATE SET color=EXCLUDED.color,updated_at=CURRENT_TIMESTAMP RETURNING color`;
    await db.query(highlightSQL,[user,book,'#FFD54F']);
    assert.equal((await db.query(highlightSQL,[user,book,'#112233'])).rows[0].color,'#112233');
    for (const table of ['notes','bookmarks','highlights']) {
        assert.equal((await db.query(`SELECT * FROM ${table} WHERE user_id=$1`,[user])).rowCount,1);
    }
    await db.query('DELETE FROM users WHERE id=$1',[user]);
    for (const table of ['notes','bookmarks','highlights']) {
        assert.equal((await db.query(`SELECT * FROM ${table} WHERE user_id=$1`,[user])).rowCount,0);
    }
});

test('catalog refuses meaningful drift in columns, constraints, indexes, functions and triggers', async () => {
    await db.query(baseline);
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
            assert.notDeepEqual(differences(await catalog(db),expected),[],sql);
        } finally { await db.query('ROLLBACK'); }
    }
});
test('CLI suppresses credentials in driver failures and requires explicit target', () => {
    const secret='synthetic-DO-NOT-PRINT';
    const result=spawnSync(process.execPath,['scripts/migrate.js','up','--target','test'],{
        cwd:path.resolve(__dirname,'../..'),encoding:'utf8',env:{...process.env,
            MIGRATION_TEST_DATABASE_URL:`postgresql://${secret}:${secret}@127.0.0.1:1/gnosis_migration_test_0123456789abcdef`}});
    assert.equal(result.status,1);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
    assert.match(result.stderr,/details/);
});
test('check on untracked schema is read-only and tracking-like extra objects refuse adoption', async () => {
    assert.equal((await run('check')).applied.length,0);
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations') AS value")).rows[0].value,null);
    await db.query(baseline);
    await db.query('CREATE TABLE pgmigrations_extra(id integer)');
    await assert.rejects(run('baseline'),/differs/);
});
test('malformed tracking tables refuse automatic repair', async () => {
    await db.query(baseline);
    await db.query('CREATE TABLE pgmigrations(id integer,name varchar(255) NOT NULL,run_on timestamp NOT NULL)');
    const before=await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid='pgmigrations'::regclass");
    await assert.rejects(run('baseline'),/tracking schema/);
    assert.deepEqual((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid='pgmigrations'::regclass")).rows,before.rows);
});

// Observe the real client, including the pinned runner's queries. No fake database
// or production connection is used. Query strings are kept in memory, not logged.
function adoptionProbe({beforeCommit, beforeBegin} = {}) {
    const statements = [];
    const notices = [];
    const transactions = [];
    let catalogs = 0;
    return {statements, notices, transactions, clientFactory(settings) {
        const client = new Client(settings);
        const rawQuery = client.query.bind(client);
        client.on('notice', notice => notices.push(notice.code));
        client.query = async (...args) => {
            const sql = typeof args[0] === 'string' ? args[0] : args[0].text;
            if (sql === 'BEGIN' && beforeBegin) await beforeBegin();
            if (sql === 'COMMIT' && beforeCommit) await beforeCommit({client,rawQuery});
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
    }};
}

async function assertUncommittedAndLocked({client,rawQuery}) {
    // History exists inside adoption's transaction, but not in another session.
    assert.deepEqual((await rawQuery('SELECT name FROM public.pgmigrations')).rows,[{name:baselineName}]);
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations') AS value")).rows[0].value,null);
    assert.equal((await db.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired',[lockId])).rows[0].acquired,false);
    const locks=(await db.query("SELECT mode FROM pg_locks WHERE pid=$1 AND relation='public.users'::regclass AND granted",[client.processID])).rows;
    assert.ok(locks.some(row => row.mode === 'ShareLock'));
    await db.query('BEGIN');
    try {
        await assert.rejects(db.query('LOCK TABLE public.users IN ROW EXCLUSIVE MODE NOWAIT'), {code:'55P03'});
    } finally {
        await db.query('ROLLBACK');
    }
}

async function assertLocksReleased() {
    assert.equal((await db.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired',[lockId])).rows[0].acquired,true);
    await db.query('SELECT pg_advisory_unlock($1::bigint)',[lockId]);
    await db.query('BEGIN');
    try { await db.query('LOCK TABLE public.users IN ROW EXCLUSIVE MODE NOWAIT'); }
    finally { await db.query('ROLLBACK'); }
}

test('adoption has one transaction, atomic revalidation/history, and locks through commit', async () => {
    await db.query(baseline);
    const probe=adoptionProbe({beforeCommit:assertUncommittedAndLocked});
    await run('baseline',{clientFactory:probe.clientFactory});
    assert.equal(probe.statements.filter(sql => sql === 'BEGIN').length,1);
    assert.equal(probe.statements.filter(sql => sql === 'COMMIT').length,1);
    assert.equal(probe.statements.filter(sql => sql === 'ROLLBACK').length,0);
    assert.ok(!probe.notices.includes('25001'), 'No nested transaction warning');
    assert.equal(probe.transactions.length,2);
    assert.equal(probe.transactions[0],probe.transactions[1]);
    const begin=probe.statements.indexOf('BEGIN');
    const revalidation=probe.statements.findIndex((sql,i) => i>begin && sql.includes('WITH objects AS'));
    const insertion=probe.statements.findIndex(sql => /INSERT INTO.*pgmigrations/i.test(sql));
    assert.ok(begin < revalidation && revalidation < insertion && insertion < probe.statements.indexOf('COMMIT'));
    assert.deepEqual((await db.query('SELECT name FROM public.pgmigrations')).rows,[{name:baselineName}]);
    await assertLocksReleased();
});

test('failure after baseline insertion but before commit rolls back history and releases locks', async () => {
    await db.query(baseline);
    const probe=adoptionProbe({beforeCommit:async context => {
        await assertUncommittedAndLocked(context);
        throw new Error('Synthetic pre-commit failure');
    }});
    await assert.rejects(run('baseline',{clientFactory:probe.clientFactory}),/operation failed/);
    assert.equal(probe.statements.filter(sql => sql === 'BEGIN').length,1);
    assert.equal(probe.statements.filter(sql => sql === 'COMMIT').length,0);
    assert.equal(probe.statements.filter(sql => sql === 'ROLLBACK').length,1);
    assert.ok(!probe.notices.includes('25001'));
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations') AS value")).rows[0].value,null);
    await assertLocksReleased();
    assert.deepEqual((await run('baseline')).migrations,[baselineName]);
});

test('schema change after preflight is caught by transactional revalidation without history', async () => {
    await db.query(baseline);
    const probe=adoptionProbe({beforeBegin:() => db.query('ALTER TABLE users ALTER COLUMN first_name TYPE text')});
    await assert.rejects(run('baseline',{clientFactory:probe.clientFactory}),/Schema changed/);
    assert.ok(!probe.statements.some(sql => /INSERT INTO.*pgmigrations/i.test(sql)));
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations') AS value")).rows[0].value,null);
    await assertLocksReleased();
});
