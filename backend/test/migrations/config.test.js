const test = require('node:test');
const assert = require('node:assert/strict');
const { connectionFor, parseArgs } = require('../../scripts/migrations/config');

test('every command requires an explicit target and project and rejects extra arguments', () => {
    for (const command of ['up', 'check', 'baseline', 'down', 'create']) {
        assert.throws(() => parseArgs([command]), /explicit/);
        assert.throws(() => parseArgs([command, '--target', 'local']), /explicit/);
    }
    assert.throws(() => parseArgs(['up', '--target', 'local', '--project', 'unknown']), /explicit/);
    assert.throws(() => parseArgs(['up', '--target', 'local', '--project', 'app', '--fake']), /Unexpected/);
    assert.deepEqual(parseArgs(['up', '--target', 'local', '--project', 'app']), { command: 'up', target: 'local', project: 'app', description: undefined });
    assert.deepEqual(parseArgs(['create', '--target', 'local', '--project', 'bible', 'add-verse-zero']), { command: 'create', target: 'local', project: 'bible', description: 'add-verse-zero' });
});
const local = {MIGRATION_DB_HOST:'127.0.0.1',MIGRATION_DB_PORT:'5432',
    MIGRATION_DB_NAME:'gnosis_local',MIGRATION_DB_USER:'operator',MIGRATION_DB_PASSWORD:'synthetic-password'};
const application = {DB_HOST:'127.0.0.1',DB_PORT:'5432',DB_NAME:'application',
    DB_USER:'application_role',DB_PASSWORD:'synthetic-application-password',DATABASE_URL:'synthetic-url'};
test('local migration settings are exclusive and every missing value fails closed', () => {
    assert.throws(() => connectionFor('local', application, 'app'), /requires MIGRATION_DB_HOST/);
    for (const name of Object.keys(local)) {
        for (const absent of [undefined, '']) {
            assert.throws(() => connectionFor('local', { ...application, ...local, [name]: absent }, 'app'), error => {
                assert.ok(error.safe);
                assert.ok(error.message.includes(name));
                assert.ok(!error.message.includes(application.DB_PASSWORD));
                assert.ok(!error.message.includes(local.MIGRATION_DB_PASSWORD));
                return true;
            });
        }
    }
    assert.deepEqual(connectionFor('local', { ...application, ...local }, 'app'), {
        host: '127.0.0.1', port: 5432, database: 'gnosis_local', user: 'operator', password: 'synthetic-password' });
});
test('local migration settings retain loopback, database-name and port safeguards', () => {
    for (const host of ['localhost', '127.0.0.1', '::1']) {
        assert.equal(connectionFor('local', { ...local, MIGRATION_DB_HOST: host }, 'app').host, host);
    }
    assert.throws(() => connectionFor('local', { ...local, MIGRATION_DB_HOST: 'remote' }, 'app'), /loopback/);
    for (const name of ['production', 'neon_branch', 'live_database']) {
        assert.throws(() => connectionFor('local', { ...local, MIGRATION_DB_NAME: name }, 'app'), /Unsafe/);
    }
    for (const port of ['0', '65536', '5432suffix']) {
        assert.throws(() => connectionFor('local', { ...local, MIGRATION_DB_PORT: port }, 'app'), /MIGRATION_DB_PORT/);
    }
});
test('test targets reject remote hosts, suspicious names and URL overrides', () => {
    for (const value of [
        'postgresql://role@example.neon.tech/gnosis_migration_test_0123456789abcdef',
        'postgresql://role@localhost/gnosis_migration_test_0123456789abcdef',
        'postgresql://role@127.0.0.1/production',
        'postgresql://role@127.0.0.1/gnosis_migration_test_0123456789abcdef?host=remote',
        'postgresql://role@127.0.0.1/gnosis_migration_test_0123456789abcdef#secret']) {
        assert.throws(() => connectionFor('test', { MIGRATION_TEST_DATABASE_URL: value }, 'app'), /isolated/);
    }
    assert.ok(connectionFor('test', { MIGRATION_TEST_DATABASE_URL: 'postgresql://role@127.0.0.1:55439/gnosis_migration_test_0123456789abcdef' }, 'app'));
});
test('production requires its own direct TLS-verified connection per project', () => {
    // No fallback to the old shared MIGRATION_DATABASE_URL or DATABASE_URL.
    assert.throws(() => connectionFor('production', { DATABASE_URL: 'secret' }, 'app'), /requires/);
    assert.throws(() => connectionFor('production', { MIGRATION_DATABASE_URL: 'postgresql://role@host/db?sslmode=verify-full' }, 'app'), /requires/);
    assert.throws(() => connectionFor('production', { MIGRATION_APP_DATABASE_URL: 'postgresql://role@host-pooler/db?sslmode=verify-full' }, 'app'), /direct/);
    assert.throws(() => connectionFor('production', { MIGRATION_APP_DATABASE_URL: 'postgresql://role@host/db?sslmode=require' }, 'app'), /direct/);
    assert.ok(connectionFor('production', { MIGRATION_APP_DATABASE_URL: 'postgresql://role@host/db?sslmode=verify-full' }, 'app'));
    assert.ok(connectionFor('production', { MIGRATION_BIBLE_DATABASE_URL: 'postgresql://role@host/db?sslmode=verify-full' }, 'bible'));
    assert.throws(() => connectionFor('production', { MIGRATION_APP_DATABASE_URL: 'postgresql://role@host/db?sslmode=verify-full' }, 'bible'), /requires/);
});
