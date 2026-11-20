// Regression tests for the explicit MFA proxy routes
// (frontend/api/auth/mfa/*.js).
//
// Vercel does not route two-segment paths under /api/auth/ to the catch-all
// [...path].js, so /api/auth/mfa/* returned Vercel's plain-text 404 ("The
// page could not be found") and the browser's response.json() threw
// "Unexpected token 'T'". These tests pin that every MFA endpoint —
// including the nested enroll/confirm and recovery-codes/regenerate —
// forwards to the backend with the right method, headers, and body, and
// that proxy failures return JSON (502), never plain text.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import statusHandler from '../../api/auth/mfa/status.js';
import enrollHandler from '../../api/auth/mfa/enroll.js';
import enrollConfirmHandler from '../../api/auth/mfa/enroll/confirm.js';
import verifyHandler from '../../api/auth/mfa/verify.js';
import regenerateHandler from '../../api/auth/mfa/recovery-codes/regenerate.js';
import disableHandler from '../../api/auth/mfa/disable.js';

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

// One row per MFA endpoint: handler, request URL, method, and the upstream
// URL it must forward to.
const ROUTES = [
    {
        name: 'status',
        handler: statusHandler,
        url: '/api/auth/mfa/status',
        method: 'GET',
        upstream: 'https://api.example.invalid/api/auth/mfa/status',
    },
    {
        name: 'enroll',
        handler: enrollHandler,
        url: '/api/auth/mfa/enroll',
        method: 'POST',
        upstream: 'https://api.example.invalid/api/auth/mfa/enroll',
    },
    {
        name: 'enroll/confirm',
        handler: enrollConfirmHandler,
        url: '/api/auth/mfa/enroll/confirm',
        method: 'POST',
        upstream: 'https://api.example.invalid/api/auth/mfa/enroll/confirm',
    },
    {
        name: 'verify',
        handler: verifyHandler,
        url: '/api/auth/mfa/verify',
        method: 'POST',
        upstream: 'https://api.example.invalid/api/auth/mfa/verify',
    },
    {
        name: 'recovery-codes/regenerate',
        handler: regenerateHandler,
        url: '/api/auth/mfa/recovery-codes/regenerate',
        method: 'POST',
        upstream: 'https://api.example.invalid/api/auth/mfa/recovery-codes/regenerate',
    },
    {
        name: 'disable',
        handler: disableHandler,
        url: '/api/auth/mfa/disable',
        method: 'POST',
        upstream: 'https://api.example.invalid/api/auth/mfa/disable',
    },
];

describe('MFA proxy routes forward to the backend', () => {
    for (const route of ROUTES) {
        test(`${route.name} forwards method, bearer token, and body to ${route.upstream}`, async () => {
            const fetchMock = vi.fn().mockResolvedValue(upstreamResponse({ ok: true }));
            vi.stubGlobal('fetch', fetchMock);

            const body = route.method === 'GET' ? '' : JSON.stringify({ code: '123456' });
            const res = mockRes();
            await route.handler(mockReq({
                url: route.url,
                method: route.method,
                headers: {
                    authorization: 'Bearer access-token',
                    'content-type': 'application/json',
                },
                body,
            }), res);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(fetchMock.mock.calls[0][0]).toBe(route.upstream);
            const init = fetchMock.mock.calls[0][1];
            expect(init.method).toBe(route.method);
            expect(init.redirect).toBe('manual');
            expect(init.headers.authorization).toBe('Bearer access-token');
            if (route.method === 'GET') {
                expect(init.body).toBeUndefined();
            } else {
                expect(init.body.toString()).toBe(body);
                expect(init.headers['content-type']).toBe('application/json');
            }

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body.toString())).toEqual({ ok: true });
        });
    }
});

test('enroll passes the backend 200 through with the otpauth payload intact', async () => {
    const payload = {
        otpauthUrl: 'otpauth://totp/Gnosis:user@example.invalid?secret=ABCDEFG&issuer=Gnosis',
        secret: 'ABCDEFG',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamResponse(payload)));
    const res = mockRes();
    await enrollHandler(mockReq({
        url: '/api/auth/mfa/enroll',
        headers: { authorization: 'Bearer access-token' },
        body: '{}',
    }), res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body.toString())).toEqual(payload);
});

test('status forwards a query string to the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse({ enrolled: false }));
    vi.stubGlobal('fetch', fetchMock);
    const res = mockRes();
    await statusHandler(mockReq({
        url: '/api/auth/mfa/status?refresh=1',
        method: 'GET',
        headers: { authorization: 'Bearer access-token' },
    }), res);
    expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.example.invalid/api/auth/mfa/status?refresh=1',
    );
    expect(res.statusCode).toBe(200);
});

test('an unreachable backend returns JSON 502, not a plain-text page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));
    const res = mockRes();
    await enrollHandler(mockReq({
        url: '/api/auth/mfa/enroll',
        headers: { authorization: 'Bearer access-token' },
        body: '{}',
    }), res);
    expect(res.statusCode).toBe(502);
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(res.body.toString())).toEqual({
        error: 'Authentication service unavailable.',
    });
});

test('no backend origin configured returns JSON 502 without calling fetch', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = mockRes();
    await verifyHandler(mockReq({
        url: '/api/auth/mfa/verify',
        headers: { authorization: 'Bearer access-token' },
        body: '{}',
    }), res);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(502);
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(res.body.toString())).toEqual({
        error: 'Authentication service unavailable.',
    });
});

test('a backend error status passes through with its JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamResponse(
        { error: 'Invalid code.', code: 'MFA_INVALID_CODE' },
        { status: 400 },
    )));
    const res = mockRes();
    await verifyHandler(mockReq({
        url: '/api/auth/mfa/verify',
        headers: { authorization: 'Bearer access-token' },
        body: JSON.stringify({ code: '000000' }),
    }), res);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body.toString())).toEqual({
        error: 'Invalid code.',
        code: 'MFA_INVALID_CODE',
    });
});
