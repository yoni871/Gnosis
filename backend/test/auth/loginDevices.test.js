const test = require('node:test');
const assert = require('node:assert/strict');
const { DEVICE_KEY_POLICY, computeDeviceKey, recordLoginDevice } = require('../../src/services/loginDevices');
const { computeKeyHash } = require('../../src/utils/rateLimit');

const SECRET = 'synthetic-login-devices-test-secret';

test.before(() => { process.env.RATE_LIMIT_KEY_SECRET = SECRET; });
test.after(() => { delete process.env.RATE_LIMIT_KEY_SECRET; });

// Minimal fake database: records every query and answers the device
// insert/update from an in-memory set of (user_id, device_key) pairs.
function fakeDb() {
    const devices = new Set();
    const calls = [];
    return {
        calls,
        devices,
        query: async (sql, params) => {
            calls.push([sql, params]);
            if (/INSERT INTO known_login_devices/.test(sql)) {
                const key = `${params[0]}:${params[1].toString('hex')}`;
                if (devices.has(key)) return { rows: [] };
                devices.add(key);
                return { rows: [{ id: devices.size }] };
            }
            if (/UPDATE known_login_devices SET last_seen_at/.test(sql)) return { rowCount: 1 };
            if (/INSERT INTO security_events/.test(sql)) return { rowCount: 1 };
            throw new Error(`unexpected query: ${sql}`);
        },
    };
}

test('the device key is the rate-limit HMAC discipline, not a plain hash', () => {
    const key = computeDeviceKey('203.0.113.7', 'SyntheticAgent/1.0', SECRET);
    assert.deepEqual(key, computeKeyHash(DEVICE_KEY_POLICY, ['203.0.113.7', 'SyntheticAgent/1.0'], SECRET));
    assert.equal(DEVICE_KEY_POLICY, 'known_login_device');
    // HMAC output, not the raw IP or user-agent, and not a plain hash.
    assert.ok(Buffer.isBuffer(key));
    assert.equal(key.length, 32);
    assert.ok(!key.toString('hex').includes('203.0.113'));
    assert.ok(!key.toString('utf8').includes('SyntheticAgent'));
    // The IP and the user-agent both feed the key: changing either changes it.
    assert.notDeepEqual(computeDeviceKey('203.0.113.8', 'SyntheticAgent/1.0', SECRET), key);
    assert.notDeepEqual(computeDeviceKey('203.0.113.7', 'SyntheticAgent/2.0', SECRET), key);
});

test('a new device inserts, audits login.new_device, and reports isNew', async () => {
    const db = fakeDb();
    assert.deepEqual(await recordLoginDevice(db, 7, '203.0.113.7', 'SyntheticAgent/1.0'), { isNew: true });
    assert.equal(db.devices.size, 1);
    const kinds = db.calls.filter(([sql]) => /INSERT INTO security_events/.test(sql));
    assert.equal(kinds.length, 1);
    assert.deepEqual(kinds[0][1], ['login.new_device', 7]);
});

test('a known device refreshes last_seen_at and emits nothing', async () => {
    const db = fakeDb();
    assert.deepEqual(await recordLoginDevice(db, 7, '203.0.113.7', 'SyntheticAgent/1.0'), { isNew: true });
    assert.deepEqual(await recordLoginDevice(db, 7, '203.0.113.7', 'SyntheticAgent/1.0'), { isNew: false });
    const audits = db.calls.filter(([sql]) => /INSERT INTO security_events/.test(sql));
    assert.equal(audits.length, 1);
    const updates = db.calls.filter(([sql]) => /UPDATE known_login_devices SET last_seen_at/.test(sql));
    assert.equal(updates.length, 1);
    assert.equal(updates[0][1][0], 7);
});

test('devices are per user: the same device key for another user is new', async () => {
    const db = fakeDb();
    assert.deepEqual(await recordLoginDevice(db, 7, '203.0.113.7', 'SyntheticAgent/1.0'), { isNew: true });
    assert.deepEqual(await recordLoginDevice(db, 8, '203.0.113.7', 'SyntheticAgent/1.0'), { isNew: true });
    assert.equal(db.calls.filter(([sql]) => /INSERT INTO security_events/.test(sql)).length, 2);
});

test('a missing IP is skipped, never collapsed into one shared device', async () => {
    const db = fakeDb();
    for (const ip of [undefined, null, '', 7]) {
        assert.deepEqual(await recordLoginDevice(db, 7, ip, 'SyntheticAgent/1.0'), { isNew: false });
    }
    assert.equal(db.devices.size, 0);
    assert.equal(db.calls.length, 0);
});

test('a missing user-agent still keys on the IP', async () => {
    const db = fakeDb();
    assert.deepEqual(await recordLoginDevice(db, 7, '203.0.113.7', undefined), { isNew: true });
    assert.deepEqual(await recordLoginDevice(db, 7, '203.0.113.7', undefined), { isNew: false });
});

test('detection failure never throws and never reports a new device', async () => {
    const failing = { query: async () => { throw Object.assign(new Error('synthetic failure naming a secret value'), { code: '08006' }); } };
    const lines = [];
    const original = console.error;
    console.error = (...args) => { lines.push(args.join(' ')); };
    try {
        assert.deepEqual(await recordLoginDevice(failing, 7, '203.0.113.7', 'SyntheticAgent/1.0'), { isNew: false });
    } finally {
        console.error = original;
    }
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[login-devices\] record failed code=08006$/);
    assert.ok(!lines[0].includes('synthetic failure'));
    assert.ok(!lines[0].includes('secret value'));
});

test('a missing secret skips detection without throwing', async () => {
    delete process.env.RATE_LIMIT_KEY_SECRET;
    const db = fakeDb();
    const lines = [];
    const original = console.error;
    console.error = (...args) => { lines.push(args.join(' ')); };
    try {
        assert.deepEqual(await recordLoginDevice(db, 7, '203.0.113.7', 'SyntheticAgent/1.0'), { isNew: false });
    } finally {
        console.error = original;
        process.env.RATE_LIMIT_KEY_SECRET = SECRET;
    }
    assert.equal(db.devices.size, 0);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[login-devices\] record failed code=none$/);
});
