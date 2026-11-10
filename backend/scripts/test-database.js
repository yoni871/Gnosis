// Only disposable infrastructure is accepted. Never accept a connection URL.
const { spawnSync, spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { testEnvironment } = require('./test');
const { connectionFor } = require('./migrations/config');
const { withApplicationDatabase } = require('./testing/application-database');
const { workerEnvironment } = require('../test/helpers/backend-instance');

const backend = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const version = args[0];
const ci = args[1] === '--ci';
const native = args[1] === '--native';
let nativeService;
const allowed = ['14', '18'];
let container;
let activeChild;
let interrupted;

function stopApplicationProcess(child, signal) {
    if (!child?.pid) return;
    try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
    } catch (error) {
        if (error.code !== 'ESRCH') console.error('Application process cleanup encountered an error.');
    }
}

function applicationSuite(context, intentionalFailure = false) {
    if (interrupted) throw new Error('Disposable run interrupted.');
    // Never pass the migration environment or operator configuration here.
    const env = { ...workerEnvironment(), GNOSIS_APPLICATION_TEST_CONTEXT: JSON.stringify(context) };
    if (intentionalFailure) env.GNOSIS_APPLICATION_EXPECT_FAILURE = '1';
    const files = intentionalFailure ? ['test/application/safety.test.js'] : [
        'test/application/privatePages.test.js',
        'test/application/harness.test.js', 'test/application/safety.test.js',
        'test/application/refreshRateLimit.test.js',
        'test/application/sessions.test.js', 'test/application/rateLimit.test.js', 'test/application/emailVerification.test.js',
        'test/application/passwordReset.test.js', 'test/application/queryBudgets.test.js', 'test/application/rowLevelSecurity.test.js',
    ];
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], {
            cwd: backend, env, stdio: intentionalFailure ? ['ignore', 'pipe', 'pipe'] : 'inherit',
            detached: process.platform !== 'win32',
        });
        activeChild = child;
        let output = '';
        if (intentionalFailure) {
            child.stdout.on('data', chunk => { output = (output + chunk).slice(-65536); });
            child.stderr.on('data', () => {});
        }
        const timer = setTimeout(() => stopApplicationProcess(child, 'SIGTERM'), 90000);
        const killTimer = setTimeout(() => stopApplicationProcess(child, 'SIGKILL'), 95000);
        child.once('error', () => {
            clearTimeout(timer); clearTimeout(killTimer);
            activeChild = undefined;
            reject(new Error('Application test process could not start.'));
        });
        child.once('close', (status, signal) => {
            clearTimeout(timer); clearTimeout(killTimer);
            // A test-file crash must not leave its backend grandchildren running.
            stopApplicationProcess(child, 'SIGKILL');
            activeChild = undefined;
            resolve({ status, signal, output });
        });
    });
}

function docker(args) {
    const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 300000 });
    if (result.status !== 0) throw new Error('Disposable Docker operation failed; check Docker availability.');
    return result.stdout.trim();
}

function cli(command, env, project = 'app') {
    const result = spawnSync(process.execPath, ['scripts/migrate.js', command, '--target', 'test', '--project', project], {
        cwd: backend, env, encoding: 'utf8', timeout: 90000,
    });
    if (result.status !== 0) throw new Error('Disposable migration CLI check failed; details suppressed.');
    return JSON.parse(result.stdout);
}

async function main() {
    if (!allowed.includes(version) || args.length !== (native ? 3 : ci ? 2 : 1)) {
        throw new Error('Use npm run test:database -- 14 (or 18). --ci is reserved for GitHub service containers.');
    }
    if (ci && (process.env.GITHUB_ACTIONS !== 'true' || !/^\d+$/.test(process.env.GNOSIS_TEST_SERVICE_PORT || ''))) {
        throw new Error('CI mode requires a GitHub Actions disposable PostgreSQL service.');
    }
    let port;
    if (ci) {
        port = Number(process.env.GNOSIS_TEST_SERVICE_PORT);
    } else if (native) {
        nativeService = await require('./testing/native-postgres').start(args[2], version);
        port = nativeService.port;
    } else {
        container = docker(['run', '--detach', '--rm', '--publish', '127.0.0.1::5432',
            '--env', 'POSTGRES_HOST_AUTH_METHOD=trust',
            '--env', 'POSTGRES_PASSWORD=synthetic-test-password',
            '--env', 'POSTGRES_USER=gnosis_test', '--env', 'POSTGRES_DB=postgres', `postgres:${version}`]);
        port = Number(docker(['port', container, '5432/tcp']).split(':').pop());
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid disposable service port.');
    const adminConfig = { host: '127.0.0.1', port, user: 'gnosis_test',
        password: 'synthetic-test-password', database: 'postgres', connectionTimeoutMillis: 1000,
        ssl: false, options: '', application_name: 'gnosis-test-operator', statement_timeout: 10000 };
    let admin;
    for (let attempt = 0; attempt < 60; attempt++) {
        const candidate = new Client(adminConfig);
        candidate.on('error', () => {});
        try { await candidate.connect(); admin = candidate; break; }
        catch { await candidate.end().catch(() => {}); await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    if (!admin) throw new Error('Disposable PostgreSQL did not become ready.');
    const name = `gnosis_migration_test_${randomBytes(8).toString('hex')}`;
    let primaryFailure;
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
        connectionFor('test', env, 'app'); // Retain all existing target protections.
        const suite = spawnSync(process.execPath, ['scripts/test-migrations.js', '--target', 'test'], {
            cwd: backend, env, stdio: 'inherit', timeout: 300000,
        });
        if (suite.status !== 0) throw new Error('Migration suite failed.');
        // Suite fixtures intentionally leave varied state: initialize a fresh DB for CLI smoke checks.
        await admin.query(`DROP DATABASE "${name}"`);
        await admin.query(`CREATE DATABASE "${name}"`);
        // Bible first: in a shared database its baseline must run before
        // the Commentary baseline creates the bible_books copy.
        for (const project of ['bible', 'app', 'commentary']) {
            assert.ok(cli('check', env, project).pending.length > 0);
            assert.ok(cli('up', env, project).migrations.length > 0);
            assert.deepEqual(cli('check', env, project).pending, []);
            assert.deepEqual(cli('up', env, project).migrations, []);
        }
        console.log(`PostgreSQL ${version}: migration suite and public CLI smoke checks passed.`);
        await withApplicationDatabase(admin, adminConfig, name, async context => {
            assert.notEqual(context.database, name);
            const result = await applicationSuite(context);
            assert.equal(result.status, 0, 'Application integration suite failed.');
        });
        console.log(`PostgreSQL ${version}: application tests passed; generated database and role removal verified.`);
        const marker = new Error('Expected application test process failure.');
        try {
            await withApplicationDatabase(admin, adminConfig, name, async context => {
                const result = await applicationSuite(context, true);
                assert.equal(result.status, 1);
                assert.equal(result.signal, null);
                assert.ok(result.output.includes('intentional harness failure marker'));
                assert.match(result.output, /# pass 3\b/);
                assert.match(result.output, /# fail 1\b/);
                throw marker;
            });
            assert.fail('Intentional failure was not propagated.');
        } catch (error) {
            assert.equal(error, marker, 'Cleanup must preserve the original failure.');
            assert.ok(!error.cleanupFailed, 'Intentional failure cleanup must succeed.');
        }
        console.log(`PostgreSQL ${version}: intentional failure preserved; generated database and role removal verified.`);
    } catch (error) { primaryFailure = error; }
    try {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM pg_database WHERE datname=$1', [name])).rows[0].n, 0);
    } catch (error) {
        if (!primaryFailure) primaryFailure = error;
        else console.error('Migration database cleanup also failed; preserving the primary failure.');
    }
    try { await admin.end(); }
    catch (error) {
        if (!primaryFailure) primaryFailure = error;
        else console.error('Operator connection cleanup also failed; preserving the primary failure.');
    }
    if (primaryFailure) throw primaryFailure;
}

// Let application-process interruption unwind provisioning/role cleanup first.
// The Docker container remains the ultimate local cleanup boundary.
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        interrupted = signal;
        if (activeChild) stopApplicationProcess(activeChild, 'SIGTERM');
        process.exitCode = signal === 'SIGINT' ? 130 : 143;
    });
}
main().catch(() => {
    console.error('Disposable database checks failed. No application database settings were used.');
    process.exitCode = 1;
}).finally(async () => {
    if (nativeService) await nativeService.stop();
    if (container) {
        const cleanup = spawnSync('docker', ['rm', '--force', container], { stdio: 'ignore', timeout: 30000 });
        if (cleanup.status !== 0) {
            console.error('Disposable container cleanup failed; inspect Docker and remove the test container.');
            process.exitCode = 1;
        }
    }
});
