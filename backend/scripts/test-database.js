// Only disposable infrastructure is accepted. Never accept a connection URL.
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { testEnvironment } = require('./test');
const { connectionFor } = require('./migrations/config');

const backend = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const version = args[0];
const ci = args[1] === '--ci';
const allowed = ['14', '18'];
let container;

function docker(args) {
    const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 300000 });
    if (result.status !== 0) throw new Error('Disposable Docker operation failed; check Docker availability.');
    return result.stdout.trim();
}

function cli(command, env) {
    const result = spawnSync(process.execPath, ['scripts/migrate.js', command, '--target', 'test'], {
        cwd: backend, env, encoding: 'utf8', timeout: 90000,
    });
    if (result.status !== 0) throw new Error('Disposable migration CLI check failed; details suppressed.');
    return JSON.parse(result.stdout);
}

async function main() {
    if (!allowed.includes(version) || args.length !== (ci ? 2 : 1)) {
        throw new Error('Use npm run test:database -- 14 (or 18). --ci is reserved for GitHub service containers.');
    }
    if (ci && (process.env.GITHUB_ACTIONS !== 'true' || !/^\d+$/.test(process.env.GNOSIS_TEST_SERVICE_PORT || ''))) {
        throw new Error('CI mode requires a GitHub Actions disposable PostgreSQL service.');
    }
    let port;
    if (ci) {
        port = Number(process.env.GNOSIS_TEST_SERVICE_PORT);
    } else {
        container = docker(['run', '--detach', '--rm', '--publish', '127.0.0.1::5432',
            '--env', 'POSTGRES_HOST_AUTH_METHOD=trust',
            '--env', 'POSTGRES_PASSWORD=synthetic-test-password',
            '--env', 'POSTGRES_USER=gnosis_test', '--env', 'POSTGRES_DB=postgres', `postgres:${version}`]);
        port = Number(docker(['port', container, '5432/tcp']).split(':').pop());
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid disposable service port.');
    const adminConfig = { host: '127.0.0.1', port, user: 'gnosis_test',
        password: 'synthetic-test-password', database: 'postgres', connectionTimeoutMillis: 1000 };
    let admin;
    for (let attempt = 0; attempt < 60; attempt++) {
        const candidate = new Client(adminConfig);
        candidate.on('error', () => {});
        try { await candidate.connect(); admin = candidate; break; }
        catch { await candidate.end().catch(() => {}); await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    if (!admin) throw new Error('Disposable PostgreSQL did not become ready.');
    const name = `gnosis_migration_test_${randomBytes(8).toString('hex')}`;
    try {
        const actualVersion = Number((await admin.query('SHOW server_version_num')).rows[0].server_version_num);
        assert.equal(Math.floor(actualVersion / 10000), Number(version));
        await admin.query(`CREATE DATABASE "${name}"`);
        const url = new URL('postgresql://127.0.0.1');
        url.port = String(port); url.username = 'gnosis_test';
        url.password = 'synthetic-test-password'; url.pathname = `/${name}`;
        const env = { ...testEnvironment(), MIGRATION_TEST_DATABASE_URL: url.href,
            GNOSIS_TEST_DATABASE_PRELOAD: '1',
            NODE_OPTIONS: `--require=${JSON.stringify(path.join(__dirname, 'test.js'))}` };
        connectionFor('test', env); // Retain all existing target protections.
        const suite = spawnSync(process.execPath, ['scripts/test-migrations.js', '--target', 'test'], {
            cwd: backend, env, stdio: 'inherit', timeout: 300000,
        });
        if (suite.status !== 0) throw new Error('Migration suite failed.');
        // Suite fixtures intentionally leave varied state: initialize a fresh DB for CLI smoke checks.
        await admin.query(`DROP DATABASE "${name}"`);
        await admin.query(`CREATE DATABASE "${name}"`);
        assert.ok(cli('check', env).pending.length > 0);
        assert.ok(cli('up', env).migrations.length > 0);
        assert.deepEqual(cli('check', env).pending, []);
        assert.deepEqual(cli('up', env).migrations, []);
        console.log(`PostgreSQL ${version}: migration suite and public CLI smoke checks passed.`);
    } finally {
        try { await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); }
        finally { await admin.end(); }
    }
}

// The Docker container is the ultimate cleanup boundary even on interruption.
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        if (container) spawnSync('docker', ['rm', '--force', container], { stdio: 'ignore', timeout: 30000 });
        process.exit(signal === 'SIGINT' ? 130 : 143);
    });
}
main().catch(() => {
    console.error('Disposable database checks failed. No application database settings were used.');
    process.exitCode = 1;
}).finally(() => {
    if (container) {
        const cleanup = spawnSync('docker', ['rm', '--force', container], { stdio: 'ignore', timeout: 30000 });
        if (cleanup.status !== 0) {
            console.error('Disposable container cleanup failed; inspect Docker and remove the test container.');
            process.exitCode = 1;
        }
    }
});
