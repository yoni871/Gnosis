import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import AuthContext from '../context/AuthContext';
import SessionsPage from './SessionsPage';
import { getSessions, revokeSession, changePassword } from '../services/authService';

vi.mock('../services/authService', () => ({
    getSessions: vi.fn(),
    revokeSession: vi.fn(),
    changePassword: vi.fn(),
}));

const CURRENT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';
const REVOKED_ID = '00000000-0000-4000-8000-000000000003';
const sessionsFixture = [
    { id: CURRENT_ID, createdAt: '2026-11-09T10:00:00.000Z', expiresAt: '2026-11-16T10:00:00.000Z', revokedAt: null, current: true },
    { id: OTHER_ID, createdAt: '2026-11-08T09:00:00.000Z', expiresAt: '2026-11-15T09:00:00.000Z', revokedAt: null, current: false },
    { id: REVOKED_ID, createdAt: '2026-11-07T08:00:00.000Z', expiresAt: '2026-11-14T08:00:00.000Z', revokedAt: '2026-11-08T12:00:00.000Z', current: false },
];

function Location() {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}</output>;
}

function mount(authValue, initialEntries = ['/sessions']) {
    render(
        <MemoryRouter initialEntries={initialEntries}>
            <AuthContext.Provider value={authValue}>
                <Location />
                <Routes>
                    <Route path="/sessions" element={<SessionsPage />} />
                    <Route path="/login" element={<h1>Sign in</h1>} />
                </Routes>
            </AuthContext.Provider>
        </MemoryRouter>,
    );
}

const authenticated = (overrides = {}) => ({
    user: { first_name: 'Test', last_name: 'Reader', email: 'reader@example.invalid' },
    token: 'synthetic-token',
    isAuthenticated: true,
    isAuthLoading: false,
    logout: vi.fn(),
    ...overrides,
});

beforeEach(() => {
    vi.mocked(getSessions).mockResolvedValue({ sessions: sessionsFixture });
    vi.mocked(revokeSession).mockResolvedValue(null);
    vi.mocked(changePassword).mockResolvedValue({ changed: true });
});

test('lists sessions, flags the current one, and offers revoke only for active sessions', async () => {
    mount(authenticated());
    expect(await screen.findByText('This device')).toBeVisible();
    expect(screen.getByText(/Revoked/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign out of this device' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeVisible();
    // The revoked session has no revoke button: exactly two buttons.
    expect(screen.getAllByRole('button', { name: /Revoke|Sign out of this device/ })).toHaveLength(2);
    expect(vi.mocked(getSessions)).toHaveBeenCalledWith('synthetic-token');
});

test('revoking another session reloads the list and shows it as revoked', async () => {
    const user = userEvent.setup();
    vi.mocked(getSessions)
        .mockResolvedValueOnce({ sessions: sessionsFixture })
        .mockResolvedValueOnce({ sessions: sessionsFixture.map((session) =>
            (session.id === OTHER_ID ? { ...session, revokedAt: '2026-11-09T15:00:00.000Z' } : session)) });
    mount(authenticated());
    await screen.findByText('This device');
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(vi.mocked(revokeSession)).toHaveBeenCalledWith('synthetic-token', OTHER_ID);
    expect(await screen.findAllByText(/Revoked/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
});

test('revoking the current session logs out and navigates to sign in', async () => {
    const user = userEvent.setup();
    const logout = vi.fn();
    mount(authenticated({ logout }));
    await screen.findByText('This device');
    await user.click(screen.getByRole('button', { name: 'Sign out of this device' }));
    expect(vi.mocked(revokeSession)).toHaveBeenCalledWith('synthetic-token', CURRENT_ID);
    expect(logout).toHaveBeenCalledOnce();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
});

test('change password rejects mismatched new passwords without calling the service', async () => {
    const user = userEvent.setup();
    mount(authenticated());
    await screen.findByText('This device');
    await user.type(screen.getByLabelText('Current password'), 'old-password');
    await user.type(screen.getByLabelText('New password'), 'a-new-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'a-different-password');
    await user.click(screen.getByRole('button', { name: 'Change my password' }));
    expect(screen.getByText('New passwords do not match.')).toBeVisible();
    expect(vi.mocked(changePassword)).not.toHaveBeenCalled();
});

test('change password success shows the sign-out notice and clears the form', async () => {
    const user = userEvent.setup();
    mount(authenticated());
    await screen.findByText('This device');
    await user.type(screen.getByLabelText('Current password'), 'old-password');
    await user.type(screen.getByLabelText('New password'), 'a-new-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'a-new-password');
    await user.click(screen.getByRole('button', { name: 'Change my password' }));
    expect(vi.mocked(changePassword)).toHaveBeenCalledWith('synthetic-token', {
        currentPassword: 'old-password', newPassword: 'a-new-password',
    });
    expect(await screen.findByText('Your password has been changed. Other devices have been signed out.')).toBeVisible();
    expect(screen.getByLabelText('Current password')).toHaveValue('');
});

test('change password shows the backend message for validation failures and a generic prompt otherwise', async () => {
    const user = userEvent.setup();
    const validationError = new Error('Password must be at least 8 characters.');
    validationError.code = 'VALIDATION_FAILED';
    vi.mocked(changePassword).mockRejectedValueOnce(validationError);
    mount(authenticated());
    await screen.findByText('This device');
    await user.type(screen.getByLabelText('Current password'), 'old-password');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Confirm new password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Change my password' }));
    expect(await screen.findByText('Password must be at least 8 characters.')).toBeVisible();

    const credentialError = new Error('Invalid email or password.');
    credentialError.code = 'INVALID_CREDENTIALS';
    vi.mocked(changePassword).mockRejectedValueOnce(credentialError);
    await user.click(screen.getByRole('button', { name: 'Change my password' }));
    expect(await screen.findByText('Could not change your password. Try again.')).toBeVisible();
});

test('unauthenticated visitors are sent to sign in', async () => {
    mount({ user: null, token: null, isAuthenticated: false, isAuthLoading: false, logout: vi.fn() });
    expect(await screen.findByText('Sign in')).toBeVisible();
    expect(vi.mocked(getSessions)).not.toHaveBeenCalled();
});
