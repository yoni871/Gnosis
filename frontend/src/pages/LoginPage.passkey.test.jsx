import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import LoginPage from './LoginPage';
import { loginWithPasskey } from '../services/passkeyService';

vi.mock('../services/passkeyService', () => ({
    listPasskeys: vi.fn(),
    registerPasskey: vi.fn(),
    renamePasskey: vi.fn(),
    removePasskey: vi.fn(),
    loginWithPasskey: vi.fn(),
}));
vi.mock('@simplewebauthn/browser', () => ({
    browserSupportsWebAuthn: () => true,
    startRegistration: vi.fn(),
    startAuthentication: vi.fn(),
}));

const profile = { id: 7, email: 'reader@example.invalid' };
function response(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function State() {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}</output>;
}
function mount() {
    vi.stubGlobal('fetch', vi.fn((url) => {
        if (String(url).endsWith('/auth/refresh')) {
            return Promise.resolve(response({ error: 'No session', code: 'SESSION_INVALID' }, 401));
        }
        if (String(url).endsWith('/auth/profile')) {
            return Promise.resolve(response(profile));
        }
        if (String(url).endsWith('/reading-state')) {
            return Promise.resolve(response({ error: 'No saved reading position.' }, 404));
        }
        throw new Error(`Unexpected fetch: ${url}`);
    }));
    render(<MemoryRouter initialEntries={['/login']}><AuthProvider><State /><Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/bible/Genesis/1" element={<h1>Study destination</h1>} />
    </Routes></AuthProvider></MemoryRouter>);
}

test('signing in with a passkey navigates like a password login', async () => {
    const user = userEvent.setup();
    loginWithPasskey.mockResolvedValue({ token: 'synthetic-passkey-token', expiresIn: 900 });
    mount();
    await user.type(screen.getByLabelText('Email address'), profile.email);
    await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
    expect(loginWithPasskey).toHaveBeenCalledWith(profile.email);
    expect(await screen.findByRole('heading', { name: 'Study destination' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/bible/Genesis/1');
});

test('passkey sign-in without an email asks for the address first', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
    expect(loginWithPasskey).not.toHaveBeenCalled();
    expect(await screen.findByText(/Enter your email address first/i)).toBeInTheDocument();
});

test('a cancelled passkey ceremony is a plain message, not an error state', async () => {
    const user = userEvent.setup();
    loginWithPasskey.mockRejectedValue(Object.assign(new Error('The operation was cancelled.'), { name: 'NotAllowedError' }));
    mount();
    await user.type(screen.getByLabelText('Email address'), profile.email);
    await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
    expect(await screen.findByText('The passkey sign-in was cancelled.')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
});

test('a failed passkey sign-in shows the server message', async () => {
    const user = userEvent.setup();
    loginWithPasskey.mockRejectedValue(Object.assign(new Error('Invalid email or password.'), { code: 'INVALID_CREDENTIALS' }));
    mount();
    await user.type(screen.getByLabelText('Email address'), profile.email);
    await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
});
