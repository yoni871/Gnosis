import { useContext } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import AuthContext, { AuthProvider } from '../context/AuthContext';
import LoginPage from './LoginPage';

const profile = { id: 7, email: 'reader@example.invalid' };
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function response(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
async function settle(request, value, fail = false) {
    await act(async () => {
        if (fail) request.reject(value); else request.resolve(value);
        await request.promise.catch(() => {});
    });
}
function State() {
    const { user, token, isAuthLoading, logout } = useContext(AuthContext);
    const location = useLocation();
    return <>
        <output data-testid="location">{location.pathname}</output>
        <output data-testid="search">{location.search}</output>
        <output data-testid="state">{JSON.stringify({ user, token, isAuthLoading })}</output>
        <button onClick={logout}>Log out test session</button>
    </>;
}
function mount() {
    const requests = fetch;
    vi.stubGlobal('fetch', (url, options) => String(url).endsWith('/auth/refresh')
        ? Promise.resolve(response({ error: 'No session', code: 'SESSION_INVALID' }, 401))
        : requests(url, options));
    render(<MemoryRouter initialEntries={['/login']}><AuthProvider><State /><Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/bible/Genesis/1" element={<h1>Study destination</h1>} />
        <Route path="/bible/Psalms/119" element={<h1>Saved position</h1>} />
    </Routes></AuthProvider></MemoryRouter>);
}
async function submit() {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), profile.email);
    await user.type(screen.getByLabelText('Password'), 'synthetic-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    return user;
}
function state(user, token, isAuthLoading) {
    expect(JSON.parse(screen.getByTestId('state').textContent)).toEqual({ user, token, isAuthLoading });
    expect(localStorage.getItem('gnosisToken')).toBeNull();
}

test('successful login stores the session and navigates only after the profile completes', async () => {
    const login = deferred(), requestProfile = deferred(), readingState = deferred();
    const fetchMock = vi.fn().mockReturnValueOnce(login.promise).mockReturnValueOnce(requestProfile.promise).mockReturnValueOnce(readingState.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    await submit();
    state(null, null, true);
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    await settle(login, response({ token: 'synthetic-login-token' }));
    state(null, 'synthetic-login-token', true);
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    await settle(requestProfile, response(profile));
    // The profile is in, but navigation waits on the saved position.
    expect(screen.getByRole('button', { name: /opening your place/i })).toBeDisabled();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    await settle(readingState, response({ error: 'No saved reading position.' }, 404));
    state(profile, 'synthetic-login-token', false);
    expect(screen.getByRole('heading', { name: 'Study destination' })).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/login$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: profile.email, password: 'synthetic-password' });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer synthetic-login-token');
    expect(fetchMock.mock.calls[2][0]).toMatch(/\/reading-state$/);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer synthetic-login-token');
});

test('login with a saved position resumes there instead of Genesis 1', async () => {
    const login = deferred(), requestProfile = deferred(), readingState = deferred();
    const fetchMock = vi.fn().mockReturnValueOnce(login.promise).mockReturnValueOnce(requestProfile.promise).mockReturnValueOnce(readingState.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    await submit();
    await settle(login, response({ token: 'synthetic-login-token' }));
    await settle(requestProfile, response(profile));
    await settle(readingState, response({
        user_id: 7,
        book_id: 19,
        book: 'Psalms',
        chapter_number: 119,
        translation: 'ESV',
        commentary_id: 3,
        verse_number: 90,
        updated_at: '2026-11-06T20:00:00.000Z',
    }));
    expect(screen.getByRole('heading', { name: 'Saved position' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/bible/Psalms/119');
    expect(screen.getByTestId('search')).toHaveTextContent('translation=ESV&commentary=3&verse=90');
    expect(fetchMock.mock.calls[2][0]).toMatch(/\/reading-state$/);
});

test('a failed reading-state load still lands on Genesis 1 after login', async () => {
    const login = deferred(), requestProfile = deferred(), readingState = deferred();
    const fetchMock = vi.fn().mockReturnValueOnce(login.promise).mockReturnValueOnce(requestProfile.promise).mockReturnValueOnce(readingState.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    await submit();
    await settle(login, response({ token: 'synthetic-login-token' }));
    await settle(requestProfile, response(profile));
    await settle(readingState, response({ error: 'Failed to retrieve reading position.' }, 500));
    expect(screen.getByRole('heading', { name: 'Study destination' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/bible/Genesis/1');
});

test.each([false, true])('logout prevents late login feedback, storage and navigation (failure=%s)', async fail => {
    const login = deferred();
    const fetchMock = vi.fn().mockReturnValue(login.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    const user = await submit();
    await user.click(screen.getByRole('button', { name: 'Log out test session' }));
    await settle(login, fail ? new Error('stale login error') : response({ token: 'stale-token' }), fail);
    state(null, null, false);
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => !url.endsWith("/logout"))).toHaveLength(1);
});

test.each([
    [400, 'VALIDATION_FAILED', 'Email address is invalid.'],
    [401, 'INVALID_CREDENTIALS', 'Invalid email or password.'],
])('current HTTP %s error is shown without navigating', async (status, code, error) => {
    const login = deferred();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(login.promise));
    mount();
    await submit();
    await settle(login, response({ error, code }, status));
    expect(screen.getByRole('alert')).toHaveTextContent(error);
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
    state(null, null, false);
});

test('EMAIL_NOT_VERIFIED login branches on the code, not the message, and offers a resend', async () => {
    const login = deferred(), resend = deferred();
    const fetchMock = vi.fn().mockReturnValueOnce(login.promise).mockReturnValueOnce(resend.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    const user = await submit();
    await settle(login, response({ error: 'Some unrelated message.', code: 'EMAIL_NOT_VERIFIED' }, 403));
    expect(screen.getByRole('alert')).toHaveTextContent('not verified yet');
    expect(screen.getByRole('button', { name: /resend verification email/i })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    state(null, null, false);
    await user.click(screen.getByRole('button', { name: /resend verification email/i }));
    await settle(resend, response({ message: 'If there is an unverified account for this email, a new verification link has been sent.' }));
    expect(screen.getByText(/a new verification link has been sent/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/resend-verification$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: profile.email });
});

test('a 403 without the EMAIL_NOT_VERIFIED code shows no resend panel', async () => {
    const login = deferred();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(login.promise));
    mount();
    await submit();
    await settle(login, response({ error: 'Forbidden.', code: 'FORBIDDEN' }, 403));
    expect(screen.getByRole('alert')).toHaveTextContent('Forbidden.');
    expect(screen.queryByRole('button', { name: /resend verification email/i })).not.toBeInTheDocument();
});

test('MFA_REQUIRED login shows the code step, and a valid code completes login', async () => {
    const login = deferred(), verify = deferred(), requestProfile = deferred(), readingState = deferred();
    const fetchMock = vi.fn()
        .mockReturnValueOnce(login.promise)
        .mockReturnValueOnce(verify.promise)
        .mockReturnValueOnce(requestProfile.promise)
        .mockReturnValueOnce(readingState.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    const user = await submit();
    await settle(login, response({ error: 'Multi-factor authentication is required.', code: 'MFA_REQUIRED', challenge: 'mfa-challenge-token' }, 401));
    expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sign in$/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));
    await settle(verify, response({ token: 'access-token' }));
    await settle(requestProfile, response(profile));
    await settle(readingState, response({
        user_id: 7,
        book_id: 19,
        book: 'Psalms',
        chapter_number: 119,
        translation: 'ESV',
        commentary_id: 3,
        verse_number: 90,
        updated_at: '2026-11-06T20:00:00.000Z',
    }));
    state(profile, 'access-token', false);
    expect(screen.getByTestId('location')).toHaveTextContent('/bible/Psalms/119');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ challenge: 'mfa-challenge-token', code: '123456' });
});

test('a wrong MFA code shows an error and keeps the code step open', async () => {
    const login = deferred(), verify = deferred();
    const fetchMock = vi.fn().mockReturnValueOnce(login.promise).mockReturnValueOnce(verify.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    const user = await submit();
    await settle(login, response({ error: 'Multi-factor authentication is required.', code: 'MFA_REQUIRED', challenge: 'mfa-challenge-token' }, 401));
    await user.type(screen.getByLabelText('Verification code'), '000000');
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));
    await settle(verify, response({ error: 'Invalid verification code.', code: 'INVALID_MFA_CODE' }, 401));
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid verification code.');
    expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    state(null, null, false);
});

test('the login page links to the forgot-password page', async () => {
    vi.stubGlobal('fetch', vi.fn());
    mount();
    const link = screen.getByRole('link', { name: /forgot your password/i });
    expect(link).toHaveAttribute('href', '/forgot-password');
});
