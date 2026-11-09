const test = require('node:test');
const assert = require('node:assert/strict');
const { audit, AUDIT_EVENT_KINDS, isValidAuditKind } = require('../../src/utils/auditLog');

// The allowlist is the stable contract other PRs build on: every kind
// below must keep its exact string, and new kinds arrive only as new
// entries with an owner PR (docs/SecurityEvents.md).
const EXPECTED_KINDS = [
    'login.success',
    'login.failure',
    'password_reset.completed',
    'refresh_token.reused',
    'logout.all',
    'session.revoked',
    'password.changed',
    'mfa.enrolled',
    'mfa.verified',
    'mfa.verification_failed',
    'mfa.removed',
    'recovery_code.used',
    'recovery_codes.regenerated',
    'account_deletion.requested',
    'account_deletion.completed',
    'passkey.registered',
    'passkey.login',
    'passkey.removed',
    'breached_password.rejected',
    'secret_strength.boot_failed',
];

test('the kind allowlist holds exactly the documented kinds', () => {
    assert.deepEqual([...AUDIT_EVENT_KINDS], EXPECTED_KINDS);
    assert.ok(Object.isFrozen(AUDIT_EVENT_KINDS));
    for (const kind of EXPECTED_KINDS) assert.equal(isValidAuditKind(kind), true);
    for (const kind of ['login', 'Login.Success', 'login.success ', '', null, undefined, 7, {}]) {
        assert.equal(isValidAuditKind(kind), false);
    }
});

test('audit() inserts exactly kind + user_id and nothing else', async () => {
    const calls = [];
    const db = { query: async (sql, params) => { calls.push([sql, params]); return { rowCount: 1 }; } };
    await audit(db, 'login.success', 7);
    assert.equal(calls.length, 1);
    const [sql, params] = calls[0];
    assert.match(sql, /INSERT INTO security_events\(kind, user_id\) VALUES \(\$1, \$2\)/);
    assert.deepEqual(params, ['login.success', 7]);
    // No other column is ever written: no password, token, hash, email,
    // IP, user agent, message, or stack.
    assert.ok(!/password|token|hash|email|ip|agent|message|stack/i.test(sql));
});

test('audit() accepts a null user for unknown-account events', async () => {
    const calls = [];
    const db = { query: async (sql, params) => { calls.push([sql, params]); return { rowCount: 1 }; } };
    await audit(db, 'login.failure', null);
    assert.deepEqual(calls[0][1], ['login.failure', null]);
});

test('audit() throws on an unknown kind without touching the database', async () => {
    const calls = [];
    const db = { query: async () => { calls.push(true); return { rowCount: 1 }; } };
    await assert.rejects(audit(db, 'login.succeeded', 7), /Unknown audit event kind/);
    await assert.rejects(audit(db, '', 7), /Unknown audit event kind/);
    await assert.rejects(audit(db, null, 7), /Unknown audit event kind/);
    assert.equal(calls.length, 0);
});

test('audit() throws on a non-integer userId without touching the database', async () => {
    const calls = [];
    const db = { query: async () => { calls.push(true); return { rowCount: 1 }; } };
    for (const userId of ['7', 7.5, true, {}, undefined]) {
        await assert.rejects(audit(db, 'login.success', userId), /integer or null/);
    }
    assert.equal(calls.length, 0);
});

test('audit() never throws when the database fails, and logs one safe line', async () => {
    const failing = { query: async () => {
        throw Object.assign(new Error('synthetic failure naming a secret value'), { code: '23505' });
    } };
    const lines = [];
    const original = console.error;
    console.error = (...args) => { lines.push(args.join(' ')); };
    try {
        await audit(failing, 'refresh_token.reused', 7);
    } finally {
        console.error = original;
    }
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[audit\] insert failed kind=refresh_token\.reused code=23505$/);
    // The safe line carries kind + code only: never the error message
    // (which could embed submitted values) or a stack trace.
    assert.ok(!lines[0].includes('synthetic failure'));
    assert.ok(!lines[0].includes('secret value'));
    assert.ok(!lines[0].includes(' at '));
});

test('audit() never throws when the database fails without a code', async () => {
    const failing = { query: async () => { throw new Error('synthetic'); } };
    const lines = [];
    const original = console.error;
    console.error = (...args) => { lines.push(args.join(' ')); };
    try {
        await audit(failing, 'logout.all', 7);
    } finally {
        console.error = original;
    }
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[audit\] insert failed kind=logout\.all code=none$/);
});
