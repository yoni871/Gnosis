import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import ForgotPasswordPage from './ForgotPasswordPage';

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
    render(<MemoryRouter initialEntries={['/forgot-password']}><Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<h1>Sign in destination</h1>} />
    </Routes></MemoryRouter>);
}

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
});

test('submitting an email shows the same generic sent message', async () => {
    const request = deferred();
    const fetchMock = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), 'reader@example.invalid');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/forgot-password$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'reader@example.invalid' });
    await settle(request, response({ message: 'If there is an account for this email, a password reset link has been sent.' }));
    expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByText(/a password reset link has been sent/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument();
});

test('a failed request shows a retry prompt and keeps the form', async () => {
    const request = deferred();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(request.promise));
    mount();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), 'reader@example.invalid');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    await settle(request, response({ error: 'Something went wrong.', code: 'INTERNAL_ERROR' }, 500), false);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not send a password reset link. Try again.');
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
});

test('a rate-limited request shows the backend message', async () => {
    const request = deferred();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(request.promise));
    mount();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), 'reader@example.invalid');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    await settle(request, response({ error: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' }, 429), false);
    expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts. Please try again later.');
});
