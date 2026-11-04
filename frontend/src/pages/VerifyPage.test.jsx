import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import VerifyPage from './VerifyPage';

const token = 'synthetic-verification-token-0123456789';

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
    render(<MemoryRouter initialEntries={['/verify-email']}><Routes>
        <Route path="/verify-email" element={<VerifyPage />} />
    </Routes></MemoryRouter>);
}
function setFragment(value) {
    window.history.replaceState(null, '', `/verify-email${value}`);
}

afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
});

test('removes the fragment on mount and submits nothing before the confirm click', async () => {
    setFragment(`#token=${token}`);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mount();
    expect(window.location.hash).toBe('');
    expect(screen.getByRole('heading', { name: /verify your email address/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('gnosisToken')).toBeNull();
    expect(sessionStorage.length).toBe(0);
});

test('confirm click verifies and shows the success state', async () => {
    setFragment(`#token=${token}`);
    const request = deferred();
    const fetchMock = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /verify my email/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/verify-email$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token });
    await settle(request, response({ verified: true }));
    expect(screen.getByRole('heading', { name: /your email is verified/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
});

test('a failed verification shows the invalid state with a resend form', async () => {
    setFragment(`#token=${token}`);
    const request = deferred();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(request.promise));
    mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /verify my email/i }));
    await settle(request, response({ error: 'Invalid or expired verification link.', code: 'INVALID_VERIFICATION_LINK' }, 400));
    expect(screen.getByRole('heading', { name: /invalid or expired/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
});

test('no token shows the invalid state without any service call', async () => {
    setFragment('');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mount();
    expect(screen.getByRole('heading', { name: /invalid or expired/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
});

test('the resend form sends the generic request and shows the generic message', async () => {
    setFragment('');
    const request = deferred();
    const fetchMock = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), 'reader@example.invalid');
    await user.click(screen.getByRole('button', { name: /resend verification email/i }));
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/resend-verification$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'reader@example.invalid' });
    await settle(request, response({ message: 'If there is an unverified account for this email, a new verification link has been sent.' }));
    expect(screen.getByText(/a new verification link has been sent/i)).toBeInTheDocument();
});
