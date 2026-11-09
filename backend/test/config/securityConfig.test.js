const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { requireSecurityConfig } = require('../../src/config/securityConfig');
const { testEnvironment } = require('../../scripts/test');
const good = { JWT_SECRET: 'synthetic-jwt-key-0123456789-abcdefgh-test-only',
    RATE_LIMIT_KEY_SECRET: 'synthetic-rate-key-9876543210-ABCDEFGH-test-only' };
test('reject weak, missing, placeholder and shared secrets without disclosing values', () => {
    requireSecurityConfig(good);
    for (const value of [undefined, '', 'private-marker', 'x'.repeat(64), 'changeme-'.repeat(8)]) {
        assert.throws(() => requireSecurityConfig({ ...good, JWT_SECRET: value }),
            { message: 'Server configuration error: invalid security configuration.' });
        assert.throws(() => requireSecurityConfig({ ...good, RATE_LIMIT_KEY_SECRET: value }));
    }
    assert.throws(() => requireSecurityConfig({ ...good, RATE_LIMIT_KEY_SECRET: good.JWT_SECRET }));
});
test('production serverless app import fails before listening with weak configuration', () => {
    const result = spawnSync(process.execPath, ['-e', 'require("./src/app")'], {
        cwd: require('node:path').resolve(__dirname, '../..'), encoding: 'utf8',
        env: { ...testEnvironment(), ...good, NODE_ENV: 'production', JWT_SECRET: 'private-marker' },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid security configuration/);
    assert.ok(!result.stderr.includes('private-marker'));
});
