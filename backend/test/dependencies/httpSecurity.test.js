const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { gzipSync, deflateSync, brotliCompressSync } = require('node:zlib');
const { createRequire } = require('node:module');
const express = require('express');

// Exercise the dependencies Express actually resolves. No application imports,
// dotenv, credentials, or database connections are needed by these fixtures.
const expressRequire = createRequire(require.resolve('express'));
const proxyaddr = expressRequire('proxy-addr');
const qs = expressRequire('qs');

async function serve(t, app) {
    const server = app.listen(0, '127.0.0.1');
    t.after(async () => {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    });
    await once(server, 'listening');
    return server.address().port;
}

function request(port, { body, encoding, forwardedFor, path = '/', method = 'POST' } = {}) {
    return new Promise((resolve, reject) => {
        const headers = { Connection: 'close' };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(body);
        }
        if (encoding) headers['Content-Encoding'] = encoding;
        if (forwardedFor) headers['X-Forwarded-For'] = forwardedFor;
        const req = http.request({ host: '127.0.0.1', port, path, method, headers, agent: false }, res => {
            const chunks = [];
            res.on('error', reject);
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) });
                } catch (error) { reject(error); }
            });
        });
        req.setTimeout(5000, () => req.destroy(new Error('Synthetic HTTP request timed out')));
        req.on('error', reject);
        req.end(body);
    });
}

async function parserFixture(t) {
    const app = express();
    let handled = 0;
    // Same parser/default limit as src/app.js; no production behavior change.
    app.use(express.json());
    app.post('/', (req, res) => {
        handled++;
        res.json(req.body);
    });
    app.get('/health', (req, res) => res.json({ healthy: true }));
    // Expose dependency error types only in this synthetic fixture. Gnosis's
    // public error mapping is covered by its existing auth/server tests.
    app.use((error, req, res, next) => {
        res.status(error.status || 500).json({ type: error.type });
    });
    return { port: await serve(t, app), handled: () => handled };
}

test('Express resolves patched HTTP dependencies without changing Express', () => {
    assert.equal(require('express/package.json').version, '5.2.1');
    const semver = require('semver');
    for (const [name, minimum] of [['body-parser', '2.4.0'], ['proxy-addr', '2.0.8'], ['qs', '6.16.1']]) {
        assert.ok(semver.gte(expressRequire(`${name}/package.json`).version, minimum), name);
    }
    const parserRequire = createRequire(expressRequire.resolve('body-parser'));
    assert.ok(semver.gte(parserRequire('qs/package.json').version, '6.16.1'));
});

test('plain, gzip, deflate and Brotli JSON preserve the payload', async t => {
    const { port, handled } = await parserFixture(t);
    const value = { text: 'Synthetic scripture — שלום', count: 3 };
    const raw = Buffer.from(JSON.stringify(value));
    for (const [encoding, encode] of [[undefined, x => x], ['gzip', gzipSync],
        ['deflate', deflateSync], ['br', brotliCompressSync]]) {
        assert.deepEqual(await request(port, { body: encode(raw), encoding }), { status: 200, body: value });
    }
    assert.equal(handled(), 4);
});

test('malformed plain and compressed JSON are rejected before the handler', async t => {
    const { port, handled } = await parserFixture(t);
    for (const [body, encoding] of [['{bad', undefined], [gzipSync('{bad'), 'gzip']]) {
        assert.deepEqual(await request(port, { body, encoding }),
            { status: 400, body: { type: 'entity.parse.failed' } });
    }
    assert.equal(handled(), 0);
});

test('100 KiB limit applies to decoded JSON, including small compressed bodies', async t => {
    const { port, handled } = await parserFixture(t);
    const below = JSON.stringify({ text: 'a'.repeat(100 * 1024 - 11) });
    const above = JSON.stringify({ text: 'a'.repeat(100 * 1024) });
    assert.equal(Buffer.byteLength(below), 100 * 1024);
    assert.equal((await request(port, { body: below })).status, 200);
    assert.ok(gzipSync(above).length < 1024);
    for (const [body, encoding] of [[above, undefined], [gzipSync(above), 'gzip']]) {
        assert.deepEqual(await request(port, { body, encoding }),
            { status: 413, body: { type: 'entity.too.large' } });
    }
    assert.equal(handled(), 1);
});

test('trailing bytes after gzip do not crash the worker or prevent another request', async t => {
    const { port } = await parserFixture(t);
    // GHSA-27r3-jxmh-p828: NUL ends the valid member, followed by enough
    // garbage to span stream chunks. No uncaughtException handler masks a crash.
    const value = { synthetic: true };
    const body = Buffer.concat([gzipSync(JSON.stringify(value)), Buffer.from([0]), Buffer.alloc(128 * 1024, 0x58)]);
    const result = await request(port, { body, encoding: 'gzip' });
    // zlib versions differ: some finish the member, others reject its tail.
    assert.ok([200, 400].includes(result.status), JSON.stringify(result));
    if (result.status === 200) assert.deepEqual(result.body, value);
    assert.deepEqual(await request(port, { method: 'GET', path: '/health' }),
        { status: 200, body: { healthy: true } });
});

test('truncated gzip fails safely and leaves the server responsive', async t => {
    const { port, handled } = await parserFixture(t);
    const compressed = gzipSync('{"synthetic":true}');
    assert.equal((await request(port, { body: compressed.subarray(0, -8), encoding: 'gzip' })).status, 400);
    assert.equal(handled(), 0);
    assert.equal((await request(port, { method: 'GET', path: '/health' })).status, 200);
});

test('Express ignores spoofed forwarding unless the socket proxy is trusted', async t => {
    for (const trust of [false, 'loopback', '10.0.0.0/8']) {
        const app = express();
        app.set('trust proxy', trust);
        app.get('/', (req, res) => res.json({ ip: req.ip, ips: req.ips }));
        const port = await serve(t, app);
        const result = await request(port, { method: 'GET', forwardedFor: '198.51.100.9, 203.0.113.8' });
        assert.deepEqual(result, { status: 200, body: trust === 'loopback'
            ? { ip: '203.0.113.8', ips: ['203.0.113.8'] }
            : { ip: '127.0.0.1', ips: [] } });
    }
});

test('IPv6 trust subnets cannot accidentally trust every IPv4 address', () => {
    for (const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
        const trust = proxyaddr.compile(subnet);
        assert.equal(trust('203.0.113.9'), false, subnet);
        assert.equal(proxyaddr({ socket: { remoteAddress: '203.0.113.9' },
            headers: { 'x-forwarded-for': '198.51.100.7' } }, trust), '203.0.113.9');
    }
    for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104']) {
        const trust = proxyaddr.compile(subnet);
        assert.equal(trust('10.2.3.4'), true);
        assert.equal(trust('203.0.113.9'), false);
    }
});

test('qs enforces comma array limits and safely serializes hostile properties', () => {
    assert.throws(() => qs.parse('a[]=1,2,3,4', { comma: true, arrayLimit: 3, throwOnLimitExceeded: true }), RangeError);
    const parsed = qs.parse('a[constructor][isBuffer]=not-callable', { plainObjects: true });
    assert.doesNotThrow(() => qs.stringify(parsed));
    assert.doesNotThrow(() => qs.stringify({ a: [{ toString: 'not-callable' }] }, { arrayFormat: 'comma' }));
    assert.equal(qs.stringify({ a: ['one', 'two'] }, { arrayFormat: 'comma' }), 'a=one%2Ctwo');
});
