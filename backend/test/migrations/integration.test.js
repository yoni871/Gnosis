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
    await db.query('ALTER TABLE users ADD COLUMN first_name text');
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
test('full-text search triggers work and known schema discrepancies remain unrepaired', async () => {
    await run('up');
    const inserted=await db.query("INSERT INTO bible_verses(text) VALUES ('Creation light') RETURNING search_vector @@ plainto_tsquery('english','creation') AS found");
    assert.equal(inserted.rows[0].found,true);
    await assert.rejects(db.query('SELECT first_name,last_name FROM users'),/does not exist/);
    await assert.rejects(db.query('INSERT INTO bible_chapters(book_id,chapter_number) VALUES (NULL,1) ON CONFLICT (book_id,chapter_number) DO NOTHING'),/no unique/);
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
    const probe=adoptionProbe({beforeBegin:() => db.query('ALTER TABLE users ADD COLUMN first_name text')});
    await assert.rejects(run('baseline',{clientFactory:probe.clientFactory}),/Schema changed/);
    assert.ok(!probe.statements.some(sql => /INSERT INTO.*pgmigrations/i.test(sql)));
    assert.equal((await db.query("SELECT to_regclass('public.pgmigrations') AS value")).rows[0].value,null);
    await assertLocksReleased();
});
