'use strict';
// Accept a PostgreSQL major, never a database URL. Only generated fixtures are modified.
const { spawnSync, spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { testEnvironment } = require('./test');
const root = path.resolve(__dirname, '../../..');
const tool = path.resolve(__dirname, '..');
let container, child, interrupted = false;
const adminClients = new Set();
function docker(args) {
    const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 300000 });
    if (r.status !== 0) throw new Error('Disposable Docker operation failed.');
    return r.stdout.trim();
}
function stopChild(signal = 'SIGTERM') {
    if (!child?.pid) return;
    try { if (process.platform === 'win32') child.kill(signal); else process.kill(-child.pid, signal); }
    catch (e) { if (e.code !== 'ESRCH') throw e; }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; stopChild(); });
async function runTests(context) {
    return new Promise((resolve, reject) => {
        child = spawn(process.execPath, ['--test', '--test-concurrency=1', 'test/database.test.js'], {
            cwd: tool, env: { ...testEnvironment(), GNOSIS_IMPORT_TEST_CONTEXT: JSON.stringify(context) },
            stdio: 'inherit', detached: process.platform !== 'win32',
        });
        const timeout = setTimeout(() => stopChild(), 90000);
        const hardTimeout = setTimeout(() => stopChild('SIGKILL'), 95000);
        child.once('error', reject);
        child.once('close', status => {
            clearTimeout(timeout); clearTimeout(hardTimeout); stopChild('SIGKILL'); child = undefined;
            if (status !== 0 || interrupted) reject(new Error('Importer database tests failed.')); else resolve();
        });
    });
}
async function main() {
    const [version, mode, ...extra] = process.argv.slice(2);
    const ci = mode === '--ci';
    if (!['14', '18'].includes(version) || extra.length || (mode && !ci)) throw new Error('Use test:database -- 14 or 18.');
    if (ci && (process.env.GITHUB_ACTIONS !== 'true' || !/^\d+$/.test(process.env.GNOSIS_TEST_SERVICE_PORT || ''))) throw new Error('CI service context required.');
    let port;
    if (ci) port = Number(process.env.GNOSIS_TEST_SERVICE_PORT);
    else {
        container = docker(['run', '--detach', '--rm', '--publish', '127.0.0.1::5432',
            '--env', 'POSTGRES_USER=gnosis_test', '--env', 'POSTGRES_PASSWORD=synthetic-test-password',
            '--env', 'POSTGRES_DB=postgres', `postgres:${version}`]);
        port = Number(docker(['port', container, '5432/tcp']).split(':').pop());
    }
    assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
    const operator = { host: '127.0.0.1', port, user: 'gnosis_test', password: 'synthetic-test-password',
        database: 'postgres', ssl: false, options: '', application_name: 'gnosis-import-test', connectionTimeoutMillis: 1000 };
    let admin;
    for (let i = 0; i < 60 && !interrupted; i++) {
        const c = new Client(operator); c.on('error', () => {});
        try { await c.connect(); admin = c; adminClients.add(c); break; }
        catch { await c.end().catch(() => {}); await new Promise(r => setTimeout(r, 500)); }
    }
    if (!admin) throw new Error('Disposable PostgreSQL unavailable.');
    const actual = Number((await admin.query('SHOW server_version_num')).rows[0].server_version_num);
    assert.equal(Math.floor(actual / 10000), Number(version));
    const name = `gnosis_migration_test_${randomBytes(8).toString('hex')}`;
    const role = `gnosis_import_${randomBytes(8).toString('hex')}`;
    const password = `synthetic-${randomBytes(16).toString('hex')}`;
    let primary, fixture;
    try {
        if (interrupted) throw new Error('Interrupted.');
        await admin.query(`CREATE DATABASE "${name}"`);
        const url = new URL(`postgresql://gnosis_test:synthetic-test-password@127.0.0.1:${port}/${name}`);
        const migrate = spawnSync(process.execPath, ['scripts/migrate.js', 'up', '--target', 'test'], {
            cwd: path.join(root, 'backend'), env: { ...testEnvironment(), MIGRATION_TEST_DATABASE_URL: url.href },
            encoding: 'utf8', timeout: 90000,
        });
        assert.equal(migrate.status, 0, 'Official fixture migrations must succeed.');
        fixture = new Client({ ...operator, database: name }); adminClients.add(fixture);
        await fixture.connect();
        await admin.query(`CREATE ROLE "${role}" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
        await fixture.query(`REVOKE ALL ON DATABASE "${name}" FROM PUBLIC;
            REVOKE ALL ON SCHEMA public FROM PUBLIC;
            REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
            REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
            GRANT CONNECT ON DATABASE "${name}" TO "${role}";
            GRANT USAGE ON SCHEMA public TO "${role}";
            GRANT SELECT ON bible_books TO "${role}";
            GRANT SELECT,UPDATE ON bible_translations TO "${role}";
            GRANT SELECT,INSERT,UPDATE ON bible_chapters TO "${role}";
            GRANT SELECT,INSERT ON bible_verses TO "${role}";
            GRANT USAGE ON SEQUENCE bible_chapters_id_seq,bible_verses_id_seq TO "${role}";
            INSERT INTO bible_books(id,name) VALUES(1,'Genesis');
            INSERT INTO bible_translations(id,name) VALUES(4,'Synthetic Translation'),(5,'Synthetic Rollback'),(6,'Synthetic CLI');`);
        await runTests({ host: '127.0.0.1', port, database: name, user: role, password });
    } catch (error) { primary = error; }
    try {
        if (fixture) { await fixture.end(); adminClients.delete(fixture); }
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await admin.query(`DROP ROLE IF EXISTS "${role}"`);
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM pg_database WHERE datname=$1', [name])).rows[0].n, 0);
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM pg_roles WHERE rolname=$1', [role])).rows[0].n, 0);
    } catch (error) { if (!primary) primary = error; else console.error('Fixture cleanup also failed.'); }
    if (primary) throw primary;
    console.log(`PostgreSQL ${version}: importer persistence and rollback passed; database and role removal verified.`);
}
main().catch(() => { console.error('Disposable importer checks failed; no application database configuration was used.'); process.exitCode = 1; })
.finally(async () => {
    for (const c of adminClients) await c.end().catch(() => { process.exitCode = 1; });
    if (container) {
        const r = spawnSync('docker', ['rm', '--force', container], { stdio: 'ignore', timeout: 30000 });
        if (r.status !== 0) { console.error('Remove the disposable importer container manually.'); process.exitCode = 1; }
    }
});
