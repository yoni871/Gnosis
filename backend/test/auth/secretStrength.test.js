const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { isStrongSecret, hasDistinctStrongSecrets } = require('../../src/utils/secretStrength');

test('accepts canonical encodings of independently generated 32-byte values', () => {
    const jwt = randomBytes(32);
    const rate = randomBytes(32);
    assert.equal(isStrongSecret(jwt.toString('hex')), true);
    assert.equal(isStrongSecret(rate.toString('base64url')), true);
    assert.equal(hasDistinctStrongSecrets(jwt.toString('hex'), rate.toString('base64url')), true);
});

test('rejects absent, short, plain-text, and malformed encodings', () => {
    for (const value of [undefined, null, '', 123, 'short-secret', 'x'.repeat(32),
        'correct horse battery staple, 2026!', 'a'.repeat(63), 'A'.repeat(42),
        'A'.repeat(43) + '=', 'not-an-encoded-placeholder-secret-1234567890']) {
        assert.equal(isStrongSecret(value), false, String(value));
    }
});

test('rejects repeated and encoded printable placeholders', () => {
    for (const value of ['a'.repeat(64), 'A'.repeat(43),
        Buffer.from('placeholder-secret-value-1234567890').toString('base64url'),
        Buffer.from('abcd'.repeat(8)).toString('hex')]) {
        assert.equal(isStrongSecret(value), false, value);
    }
});

test('rejects identical JWT and rate-limit secrets', () => {
    const bytes = randomBytes(32);
    assert.equal(hasDistinctStrongSecrets(bytes.toString('hex'), bytes.toString('hex')), false);
    assert.equal(hasDistinctStrongSecrets(bytes.toString('hex'), bytes.toString('base64url')), false);
});
