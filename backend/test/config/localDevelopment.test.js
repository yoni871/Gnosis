const test = require('node:test');
const assert = require('node:assert/strict');
const { assertLocalDatabase } = require('../../src/config/localDevelopment');
const { validateEmailConfig } = require('../../src/config/emailConfig');
const { createResendClient } = require('../../src/utils/resendClient');
const local = { NODE_ENV: 'development', GNOSIS_LOCAL_DEV: '1', EMAIL_DELIVERY: 'disabled',
    FRONTEND_URL: 'http://localhost:5173', DB_HOST: '127.0.0.1', DB_PORT: '55432',
    DB_NAME: 'gnosis_local', DB_USER: 'gnosis_reader', DB_PASSWORD: 'synthetic' };
test('local reader accepts HTTP loopback without email credentials', () => {
    assert.ok(validateEmailConfig(local).config);
    assert.doesNotThrow(() => assertLocalDatabase(local));
});
test('disabled delivery and HTTP cannot enter production or ordinary startup', () => {
    for (const env of [{ ...local, NODE_ENV: 'production' }, { ...local, GNOSIS_LOCAL_DEV: '' }]) {
        assert.ok(validateEmailConfig(env).errors);
    }
    for (const origin of ['http://remote.example', 'http://localhost.evil.test:5173', 'http://user:pass@localhost:5173']) {
        assert.ok(validateEmailConfig({...local, FRONTEND_URL: origin}).errors);
    }
});
test('local database guard rejects URL precedence, remote hosts and other databases', () => {
    for (const override of [{ DATABASE_URL: 'postgres://remote.invalid/db' }, { DB_HOST: 'remote.invalid' },
        { DB_NAME: 'production' }, { NODE_ENV: 'production' }, { DB_PASSWORD: '' }, { DB_PORT: '0' }]) {
        assert.throws(() => assertLocalDatabase({...local, ...override}));
    }
});
test('disabled delivery never calls the network and does not return a verification token', async () => {
    const client = createResendClient({env: local, fetchImpl: () => assert.fail('Network must not run')});
    await assert.rejects(client.sendVerificationEmail({to:'test@example.invalid',token:'synthetic'}), /disabled/);
});
