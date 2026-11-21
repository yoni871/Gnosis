import { afterEach, expect, test, vi } from 'vitest';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import {
    listPasskeys,
    registerPasskey,
    renamePasskey,
    removePasskey,
    loginWithPasskey,
} from '../services/passkeyService';

vi.mock('@simplewebauthn/browser', () => ({
    startRegistration: vi.fn(),
    startAuthentication: vi.fn(),
    browserSupportsWebAuthn: vi.fn(() => true),
}));

function response(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

test('listPasskeys sends the token and returns the passkeys', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
        passkeys: [{ id: 'pk-1', label: 'MacBook', createdAt: '2026-11-09T00:00:00.000Z', lastUsedAt: null, flaggedAt: null }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const items = await listPasskeys('synthetic-token');
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('MacBook');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/passkeys$/);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-token');
});

test('registerPasskey runs the browser ceremony between options and verify', async () => {
    const options = { challenge: 'synthetic-challenge', rp: { id: 'frontend.example.invalid', name: 'Gnosis' } };
    const ceremony = { id: 'credential-id', type: 'public-key', response: {} };
    startRegistration.mockResolvedValue(ceremony);
    const fetchMock = vi.fn()
        .mockResolvedValueOnce(response(options))
        .mockResolvedValueOnce(response({ id: 'pk-1', label: 'MacBook' }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const stored = await registerPasskey('synthetic-token', 'synthetic-password', 'MacBook');
    expect(stored.label).toBe('MacBook');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/passkeys\/register\/options$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ password: 'synthetic-password' });
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: options });
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/passkeys\/register\/verify$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ response: ceremony, label: 'MacBook' });
});

test('renamePasskey patches the label', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ id: 'pk-1', label: 'Work laptop' }));
    vi.stubGlobal('fetch', fetchMock);
    const renamed = await renamePasskey('synthetic-token', 'pk-1', 'Work laptop');
    expect(renamed.label).toBe('Work laptop');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ label: 'Work laptop' });
});

test('removePasskey deletes with the current password', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await removePasskey('synthetic-token', 'pk-1', 'synthetic-password');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/passkeys\/pk-1$/);
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ password: 'synthetic-password' });
});

test('loginWithPasskey runs the browser ceremony and returns the session', async () => {
    const options = { challenge: 'synthetic-challenge', allowCredentials: [{ id: 'credential-id' }] };
    const ceremony = { id: 'credential-id', type: 'public-key', response: {} };
    startAuthentication.mockResolvedValue(ceremony);
    const fetchMock = vi.fn()
        .mockResolvedValueOnce(response(options))
        .mockResolvedValueOnce(response({ token: 'synthetic-passkey-token', expiresIn: 900 }));
    vi.stubGlobal('fetch', fetchMock);
    const session = await loginWithPasskey('reader@example.invalid');
    expect(session.token).toBe('synthetic-passkey-token');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/passkeys\/login\/options$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'reader@example.invalid' });
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: options });
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/passkeys\/login\/verify$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ response: ceremony });
});

test('a backend error code is preserved on the thrown error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(
        { error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' }, 401,
    )));
    const error = await loginWithPasskey('nobody@example.invalid').catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Invalid email or password.');
    expect(error.code).toBe('INVALID_CREDENTIALS');
});
