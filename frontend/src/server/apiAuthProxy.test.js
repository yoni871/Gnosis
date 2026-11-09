// Tests for the same-origin /api/auth proxy (frontend/api/auth/[...path].js).
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import handler from '../../api/auth/[...path].js';

function mockReq({ url, method = 'POST', headers = {}, body = '' }) {
    const chunks = body ? [new TextEncoder().encode(body)] : [];
    return {
        url,
        method,
        headers,
        async *[Symbol.asyncIterator]() {
            yield* chunks;
        },
    };
}

function mockRes() {
    const res = {
        statusCode: null,
        headers: null,
        body: null,
        writeHead(status, headers) {
            this.statusCode = status;
            this.headers = headers;
        },
        end(body) {
            this.body = body;
        },
    };
    return res;
}

function upstreamResponse(body, { status = 200, headers = {} } = {}) {
    return new Response(JSON.stringify(body), { status, headers });
}

beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.invalid/api');
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

test('refresh forwards the cookie and session header and passes the Set-Cookie through', async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse(
        { token: 'renewed' },
        { headers: { 'Set-Cookie': 'gnosisRefresh=abc; Path=/api/auth; HttpOnly; Secure; SameSite=Strict' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const req = mockReq({
        url: '/api/auth/refresh',
        headers: {
            cookie: 'gnosisRefresh=abc',
            'x-gnosis-session': '1',
            origin: 'https://frontend.example.invalid',
            'x-forwarded-for': '203.0.113.7',
            'content-type': 'application/json',
        },
        body: '{}',
    });
    const res = mockRes();
    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.invalid/api/auth/refresh');
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(init.headers.cookie).toBe('gnosisRefresh=abc');
    expect(init.headers['x-gnosis-session']).toBe('1');
    expect(init.headers.origin).toBe('https://frontend.example.invalid');
    expect(init.headers['x-forwarded-for']).toBe('203.0.113.7');
    expect(init.body.toString()).toBe('{}');

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body.toString())).toEqual({ token: 'renewed' });
    expect(res.headers['Set-Cookie']).toEqual([
        'gnosisRefresh=abc; Path=/api/auth; HttpOnly; Secure; SameSite=Strict',
    ]);
});

test('GNOSIS_API_BASE_URL takes precedence over VITE_API_URL', async () => {
    vi.stubEnv('GNOSIS_API_BASE_URL', 'https://backend.example.invalid');
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await handler(mockReq({ url: '/api/auth/login', body: '{}' }), mockRes());
    expect(fetchMock.mock.calls[0][0]).toBe('https://backend.example.invalid/api/auth/login');
});

test('login forwards the JSON body and content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse({ token: 'new-access' }));
    vi.stubGlobal('fetch', fetchMock);

    const body = JSON.stringify({ email: 'reader@example.invalid', password: 'synthetic-password' });
    await handler(mockReq({
        url: '/api/auth/login',
        headers: { 'content-type': 'application/json', 'x-gnosis-session': '1' },
        body,
    }), mockRes());

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.invalid/api/auth/login');
    expect(fetchMock.mock.calls[0][1].body.toString()).toBe(body);
    expect(fetchMock.mock.calls[0][1].headers['content-type']).toBe('application/json');
});

test('a GET profile request forwards the bearer token with no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse({ id: 12 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = mockRes();
    await handler(mockReq({
        url: '/api/auth/profile',
        method: 'GET',
        headers: { authorization: 'Bearer access-token' },
    }), res);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.invalid/api/auth/profile');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer access-token');
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(res.statusCode).toBe(200);
});

test('hop-by-hop headers and Host are not forwarded upstream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await handler(mockReq({
        url: '/api/auth/refresh',
        headers: {
            connection: 'keep-alive',
            host: 'frontend.example.invalid',
            'transfer-encoding': 'chunked',
            cookie: 'gnosisRefresh=abc',
        },
        body: '{}',
    }), mockRes());

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.connection).toBeUndefined();
    expect(headers.host).toBeUndefined();
    expect(headers['transfer-encoding']).toBeUndefined();
    expect(headers.cookie).toBe('gnosisRefresh=abc');
});

test('multiple Set-Cookie headers pass through intact', async () => {
    const upstream = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: [
            ['Set-Cookie', 'gnosisRefresh=abc; Path=/api/auth; HttpOnly; SameSite=Strict'],
            ['Set-Cookie', 'other=1; Path=/'],
        ],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstream));

    const res = mockRes();
    await handler(mockReq({ url: '/api/auth/login', body: '{}' }), res);
    expect(res.headers['Set-Cookie']).toEqual([
        'gnosisRefresh=abc; Path=/api/auth; HttpOnly; SameSite=Strict',
        'other=1; Path=/',
    ]);
});

test('a path escaping /api/auth is not proxied', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = mockRes();
    await handler(mockReq({ url: '/api/auth/../admin' }), res);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(502);
});

test('no backend origin configured returns 502 without calling fetch', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = mockRes();
    await handler(mockReq({ url: '/api/auth/refresh', body: '{}' }), res);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body.toString())).toEqual({ error: 'Authentication service unavailable.' });
});

test('an unreachable backend returns 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));

    const res = mockRes();
    await handler(mockReq({ url: '/api/auth/refresh', body: '{}' }), res);
    expect(res.statusCode).toBe(502);
});

// The proxy forwards X-Forwarded-For unchanged so the backend's IP-based
// rate limiting sees the real client address. #72 stripped these headers;
// that is rejected by the integration disposition: stripping leaves the
// backend seeing only the proxy socket IP and silently disables per-IP
// rate limiting. Spoof protection lives in the backend's TRUST_PROXY
// hop-count/CIDR model (backend/src/utils/rateLimit.js), proven end to
// end by frontend/security/policy.spec.js.
test('forwarding headers reach the backend unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const names = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip',
        'x-vercel-forwarded-for', 'cf-connecting-ip', 'true-client-ip'];
    await handler(mockReq({ url: '/api/auth/login',
        headers: Object.fromEntries(names.map(name => [name, '198.51.100.7'])) }), mockRes());
    for (const name of names) expect(fetchMock.mock.calls[0][1].headers[name]).toBe('198.51.100.7');
});

test('oversized proxy bodies fail before any upstream request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = mockRes();
    await handler(mockReq({ url: '/api/auth/login', body: 'x'.repeat(100 * 1024 + 1) }), res);
    expect(res.statusCode).toBe(413);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
});
