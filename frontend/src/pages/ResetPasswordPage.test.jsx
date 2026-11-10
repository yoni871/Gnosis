import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import ResetPasswordPage from './ResetPasswordPage';

const token = 'synthetic-reset-token-0123456789abcd';

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
function mount() {
    render(<MemoryRouter initialEntries={['/reset-password']}><Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<h1>Sign in destination</h1>} />
        <Route path="/forgot-password" element={<h1>Forgot destination</h1>} />
    </Routes></MemoryRouter>);
}
function setFragment(value) {
    window.history.replaceState(null, '', `/reset-password${value}`);
}

afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
});

test('removes the fragment on mount and submits nothing before the reset click', async () => {
    setFragment(`#token=${token}`);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mount();
    expect(window.location.hash).toBe('');
    expect(screen.getByRole('heading', { name: /choose a new password/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('gnosisToken')).toBeNull();
    expect(sessionStorage.length).toBe(0);
});

test('a missing token shows the invalid state with a link to request a new link', async () => {
    vi.stubGlobal('fetch', vi.fn());
    mount();
    expect(screen.getByRole('heading', { name: /this link is invalid or expired/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new reset link/i })).toBeInTheDocument();
});

test('mismatched passwords show an error and submit nothing', async () => {
    setFragment(`#token=${token}`);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mount();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('New password'), 'a-new-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'a-different-password');
    await user.click(screen.getByRole('button', { name: /reset my password/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
    expect(fetchMock).not.toHaveBeenCalled();
});

test('reset click submits the token and new password and shows the success state', async () => {
    setFragment(`#token=${token}`);
    const request = deferred();
    const fetchMock = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('New password'), 'a-new-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'a-new-password');
    await user.click(screen.getByRole('button', { name: /reset my password/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/reset-password$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token, password: 'a-new-password' });
    await settle(request, response({ reset: true }));
    expect(screen.getByRole('heading', { name: /your password has been reset/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
});

test('an invalid or expired link shows the invalid state', async () => {
    setFragment(`#token=${token}`);
    const request = deferred();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(request.promise));
    mount();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('New password'), 'a-new-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'a-new-password');
    await user.click(screen.getByRole('button', { name: /reset my password/i }));
    await settle(request, response({ error: 'Invalid or expired password reset link.', code: 'INVALID_RESET_LINK' }, 400), false);
    expect(screen.getByRole('heading', { name: /this link is invalid or expired/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new reset link/i })).toBeInTheDocument();
});

test('a short password shows the backend validation message and keeps the form', async () => {
    setFragment(`#token=${token}`);
    const request = deferred();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(request.promise));
    mount();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Confirm new password'), 'short');
    await user.click(screen.getByRole('button', { name: /reset my password/i }));
    await settle(request, response({ error: 'Password must be at least 8 characters.', code: 'VALIDATION_FAILED' }, 400), false);
    expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 8 characters.');
    expect(screen.getByRole('button', { name: /reset my password/i })).toBeInTheDocument();
});
