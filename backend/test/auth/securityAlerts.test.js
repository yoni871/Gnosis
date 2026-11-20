const test = require('node:test');
const assert = require('node:assert/strict');
const {
    ALERT_WINDOW_MS,
    REUSE_ALERT_KIND,
    NEW_DEVICE_KIND,
    findRecentReuseAlerts,
    findRecentNewDeviceAlerts,
} = require('../../src/utils/securityAlerts');

test('alert kinds and default window are pinned', () => {
    assert.equal(REUSE_ALERT_KIND, 'refresh_token.reused');
    assert.equal(NEW_DEVICE_KIND, 'login.new_device');
    assert.equal(ALERT_WINDOW_MS, 24 * 60 * 60 * 1000);
});

function fakeDb(rowsByKind) {
    const calls = [];
    return {
        calls,
        query: async (sql, params) => {
            calls.push([sql, params]);
            return { rows: rowsByKind[params[0]] || [] };
        },
    };
}

test('findRecentReuseAlerts queries only refresh_token.reused in the window', async () => {
    const since = new Date('2026-11-09T12:00:00.000Z');
    const expected = [{ user_id: 7, created_at: new Date('2026-11-09T13:00:00.000Z') }];
    const db = fakeDb({ 'refresh_token.reused': expected });
    assert.deepEqual(await findRecentReuseAlerts(db, { since }), expected);
    assert.equal(db.calls.length, 1);
    const [sql, params] = db.calls[0];
    assert.match(sql, /FROM security_events/);
    assert.match(sql, /kind = \$1 AND created_at >= \$2/);
    assert.match(sql, /ORDER BY created_at DESC/);
    assert.deepEqual(params, ['refresh_token.reused', since]);
    // No other kind is ever queried: no login.success, no password,
    // token, hash, email, IP, or user-agent in the query.
    assert.ok(!/login\.success|password|token_hash|email|user-agent/i.test(sql));
});

test('findRecentNewDeviceAlerts queries only login.new_device in the window', async () => {
    const since = new Date('2026-11-09T12:00:00.000Z');
    const expected = [{ user_id: 9, created_at: new Date('2026-11-09T14:00:00.000Z') }];
    const db = fakeDb({ 'login.new_device': expected });
    assert.deepEqual(await findRecentNewDeviceAlerts(db, { since }), expected);
    assert.deepEqual(db.calls[0][1], ['login.new_device', since]);
});

test('a missing since defaults to the 24h window', async () => {
    const before = Date.now();
    const db = fakeDb({});
    await findRecentReuseAlerts(db);
    const after = Date.now();
    const [sql, params] = db.calls[0];
    assert.match(sql, /created_at >= \$2/);
    assert.ok(params[1] instanceof Date);
    assert.ok(params[1].getTime() >= before - ALERT_WINDOW_MS);
    assert.ok(params[1].getTime() <= after - ALERT_WINDOW_MS + 1000);
});

test('an empty window returns an empty array, never null', async () => {
    const db = fakeDb({});
    assert.deepEqual(await findRecentReuseAlerts(db, { since: new Date() }), []);
    assert.deepEqual(await findRecentNewDeviceAlerts(db, { since: new Date() }), []);
});

test('the alert queries reject a database without query()', async () => {
    await assert.rejects(findRecentReuseAlerts(null), /requires a database/);
    await assert.rejects(findRecentNewDeviceAlerts({}), /requires a database/);
});
