import { afterEach, expect, test, vi } from 'vitest';
import { getProfile, loginUser, registerUser, resendVerification, verifyEmail, forgotPassword, resetPassword } from '../services/authService';

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

test('forgotPassword posts the email to the forgot endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ message: 'If there is an account for this email, a password reset link has been sent.' }));
    vi.stubGlobal('fetch', fetchMock);
    await forgotPassword('reader@example.invalid');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/forgot-password$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'reader@example.invalid' });
});

test('resetPassword posts the token and new password to the reset endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ reset: true }));
    vi.stubGlobal('fetch', fetchMock);
    await resetPassword('synthetic-reset-token', 'a-new-password');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/reset-password$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 'synthetic-reset-token', password: 'a-new-password' });
});

test('resetPassword preserves the invalid-link code without deriving it from the message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(
        { error: 'Invalid or expired password reset link.', code: 'INVALID_RESET_LINK' }, 400,
    )));
    const error = await resetPassword('synthetic-reset-token', 'a-new-password').catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Invalid or expired password reset link.');
    expect(error.code).toBe('INVALID_RESET_LINK');
});
