import { afterEach, expect, test, vi } from 'vitest';
import { getProfile, loginUser, registerUser, resendVerification, verifyEmail, refreshSession, logoutSession } from '../services/authService';

function response(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

test('loginUser preserves the backend error code without deriving it from the message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(
        { error: 'Email not verified.', code: 'EMAIL_NOT_VERIFIED' }, 403,
    )));
    const error = await loginUser({ email: 'reader@example.invalid', password: 'synthetic-password' }).catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Email not verified.');
    expect(error.code).toBe('EMAIL_NOT_VERIFIED');
});

test('an error without a backend code carries no invented code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(
        { error: 'Invalid email or password.' }, 401,
    )));
    const error = await loginUser({ email: 'reader@example.invalid', password: 'wrong' }).catch(e => e);
    expect(error.message).toBe('Invalid email or password.');
    expect(error.code).toBeUndefined();
});

test('getProfile preserves the backend error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(
        { error: 'Authentication token is required.', code: 'TOKEN_REQUIRED' }, 401,
    )));
    const error = await getProfile('stale-token').catch(e => e);
    expect(error.code).toBe('TOKEN_REQUIRED');
});

test('registerUser posts the registration body and returns the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ id: 4, email: 'reader@example.invalid' }));
    vi.stubGlobal('fetch', fetchMock);
    const data = await registerUser({ firstName: 'Synthetic', lastName: 'Reader', email: 'reader@example.invalid', password: 'synthetic-password' });
    expect(data).toEqual({ id: 4, email: 'reader@example.invalid' });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/register$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        firstName: 'Synthetic', lastName: 'Reader', email: 'reader@example.invalid', password: 'synthetic-password',
    });
});

test('verifyEmail posts the token to the verification endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ verified: true }));
    vi.stubGlobal('fetch', fetchMock);
    await verifyEmail('synthetic-verification-token');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/verify-email$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 'synthetic-verification-token' });
});

test('resendVerification posts the email to the resend endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ message: 'If there is an unverified account for this email, a new verification link has been sent.' }));
    vi.stubGlobal('fetch', fetchMock);
    await resendVerification('reader@example.invalid');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/resend-verification$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'reader@example.invalid' });
});

test('refresh includes the HttpOnly cookie and the explicit session request header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ token: 'renewed' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(refreshSession()).resolves.toEqual({ token: 'renewed' });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/refresh$/);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
    expect(fetchMock.mock.calls[0][1].headers['X-Gnosis-Session']).toBe('1');
});
test('logout waits for a pending login cookie mutation and sends the bearer credential', async () => {
    let resolveLogin;
    const login = new Promise(resolve => { resolveLogin = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(login).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const pendingLogin = loginUser({ email: 'synthetic@example.invalid', password: 'synthetic' });
    const pendingLogout = logoutSession('old-access');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveLogin(response({ token: 'new-access' }));
    await pendingLogin;
    await pendingLogout;
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/logout$/);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer old-access');
    expect(fetchMock.mock.calls[1][1].credentials).toBe('include');
});
