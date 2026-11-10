import { useContext } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import AuthContext, { AuthProvider } from '../context/AuthContext';
import RegisterPage from './RegisterPage';

const profile = { id: 8, first_name: 'Synthetic', last_name: 'Reader', email: 'reader@example.invalid' };
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
        <output data-testid="state">{JSON.stringify({ user, token, isAuthLoading })}</output>
        <button onClick={logout}>Log out test session</button>
    </>;
}
function mount() {
    const requests = fetch;
    vi.stubGlobal('fetch', (url, options) => String(url).endsWith('/auth/refresh')
        ? Promise.resolve(response({ error: 'No session', code: 'SESSION_INVALID' }, 401))
        : requests(url, options));
    render(<MemoryRouter initialEntries={['/register']}><AuthProvider><State /><Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/bible/Genesis/1" element={<h1>Study destination</h1>} />
    </Routes></AuthProvider></MemoryRouter>);
}
async function submit() {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('First name'), 'Synthetic');
    await user.type(screen.getByLabelText('Last name'), 'Reader');
    await user.type(screen.getByLabelText('Email address'), profile.email);
    await user.type(screen.getByLabelText('Password'), 'synthetic-password');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    return user;
}
function state(user, token, isAuthLoading) {
    expect(JSON.parse(screen.getByTestId('state').textContent)).toEqual({ user, token, isAuthLoading });
    expect(localStorage.getItem('gnosisToken')).toBe(token);
}

test('registration shows the check-email state without logging in or navigating', async () => {
    const registration = deferred();
    const fetchMock = vi.fn().mockReturnValue(registration.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    await submit();
    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled();
    await settle(registration, response(profile));
    expect(screen.getByText(/check your email to finish creating your account/i)).toBeInTheDocument();
    expect(screen.getByText(profile.email)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/register');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        firstName: 'Synthetic', lastName: 'Reader', email: profile.email, password: 'synthetic-password',
    });
    state(null, null, false);
});

test('VALIDATION_FAILED feedback stops registration without automatic login or navigation', async () => {
    const registration = deferred();
    const fetchMock = vi.fn().mockReturnValue(registration.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    await submit();
    await settle(registration, response({
        code: 'VALIDATION_FAILED', error: 'Password must be at least 8 characters.',
    }, 400));
    expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 8 characters.');
    expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled();
    expect(screen.getByTestId('location')).toHaveTextContent('/register');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    state(null, null, false);
});

test.each([false, true])('logout during registration neither logs in nor suppresses the result (failure=%s)', async fail => {
    const registration = deferred();
    const fetchMock = vi.fn().mockReturnValue(registration.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    const user = await submit();
    await user.click(screen.getByRole('button', { name: 'Log out test session' }));
    await settle(registration, fail ? new Error('stale registration error') : response(profile), fail);
    state(null, null, false);
    if (fail) {
        expect(screen.getByRole('alert')).toHaveTextContent('stale registration error');
    } else {
        expect(screen.getByText(/check your email to finish creating your account/i)).toBeInTheDocument();
    }
    expect(screen.getByTestId('location')).toHaveTextContent('/register');
    expect(fetchMock.mock.calls.filter(([url]) => !url.endsWith("/logout"))).toHaveLength(1);
});

test('check-email resend requests a fresh link for the registered address', async () => {
    const registration = deferred(), resend = deferred();
    const fetchMock = vi.fn().mockReturnValueOnce(registration.promise).mockReturnValueOnce(resend.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    const user = await submit();
    await settle(registration, response(profile));
    expect(screen.getByText(/check your email to finish creating your account/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /resend verification email/i }));
    await settle(resend, response({ message: 'If there is an unverified account for this email, a new verification link has been sent.' }));
    expect(screen.getByText(/a new verification link has been sent/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['register', 'resend-verification']);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: profile.email });
});
