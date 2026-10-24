const test = require('node:test');
const assert = require('node:assert/strict');
const { connectionFor, parseArgs } = require('../../scripts/migrations/config');

test('every command requires an explicit target and rejects extra arguments', () => {
    for (const command of ['up','check','baseline','down','create']) {
        assert.throws(() => parseArgs([command]), /explicit/);
    }
    assert.throws(() => parseArgs(['up','--target','local','--fake']), /Unexpected/);
    assert.deepEqual(parseArgs(['up','--target','local']), {command:'up',target:'local',description:undefined});
});
test('local settings never fall back to DATABASE_URL', () => {
    assert.throws(() => connectionFor('local', {DATABASE_URL:'secret'}), /requires/);
    assert.throws(() => connectionFor('local', {DB_HOST:'remote',DB_NAME:'app',DB_USER:'role',DB_PORT:'5432'}), /loopback/);
    assert.throws(() => connectionFor('local', {DB_HOST:'127.0.0.1',DB_NAME:'production',DB_USER:'role',DB_PORT:'5432'}), /Unsafe/);
});
test('test targets reject remote hosts, suspicious names and URL overrides', () => {
    for (const value of [
        'postgresql://role@example.neon.tech/gnosis_migration_test_0123456789abcdef',
        'postgresql://role@localhost/gnosis_migration_test_0123456789abcdef',
        'postgresql://role@127.0.0.1/production',
        'postgresql://role@127.0.0.1/gnosis_migration_test_0123456789abcdef?host=remote',
        'postgresql://role@127.0.0.1/gnosis_migration_test_0123456789abcdef#secret']) {
        assert.throws(() => connectionFor('test',{MIGRATION_TEST_DATABASE_URL:value}), /isolated/);
    }
    assert.ok(connectionFor('test',{MIGRATION_TEST_DATABASE_URL:'postgresql://role@127.0.0.1:55439/gnosis_migration_test_0123456789abcdef'}));
});
test('production requires its own direct TLS-verified connection', () => {
    assert.throws(() => connectionFor('production', {DATABASE_URL:'secret'}), /requires/);
    assert.throws(() => connectionFor('production', {MIGRATION_DATABASE_URL:'postgresql://role@host-pooler/db?sslmode=verify-full'}), /direct/);
    assert.throws(() => connectionFor('production', {MIGRATION_DATABASE_URL:'postgresql://role@host/db?sslmode=require'}), /direct/);
});
