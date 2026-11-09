const test = require('node:test');
const assert = require('node:assert/strict');
const { testEnvironment } = require('../../scripts/test');
Object.assign(process.env, testEnvironment());
const app = require('../../src/app');
let server, origin;
test.before(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
});
for (const [path, options, status, code] of [
    ['/missing/<private-marker>', {}, 404, 'NOT_FOUND'],
    ['/api/auth/login', { method: 'POST', body: '{bad' }, 400, 'INVALID_BODY'],
    ['/api/auth/login', { method: 'POST', body: JSON.stringify({ value: 'x'.repeat(102400) }) }, 413, 'BODY_TOO_LARGE'],
    ['/api/auth/login', { method: 'POST', body: '{}', headers: { 'Content-Encoding': 'unknown' } }, 415, 'UNSUPPORTED_ENCODING'],
]) test(`safe headers and JSON on ${status}`, async () => {
    const response = await fetch(origin + path, { ...options,
        headers: { 'Content-Type': 'application/json', Connection: 'close', ...options.headers } });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.code, code);
    assert.ok(!JSON.stringify(body).includes('private-marker'));
});
