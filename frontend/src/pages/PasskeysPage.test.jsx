import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import AuthContext from '../context/AuthContext';
import PasskeysPage from './PasskeysPage';
import { listPasskeys, registerPasskey, renamePasskey, removePasskey } from '../services/passkeyService';

vi.mock('../services/passkeyService', () => ({
    listPasskeys: vi.fn(),
    registerPasskey: vi.fn(),
    renamePasskey: vi.fn(),
    removePasskey: vi.fn(),
    loginWithPasskey: vi.fn(),
}));

const user = { id: 11, first_name: 'Passkey', last_name: 'Reader', email: 'passkeys@example.invalid' };
const stored = [
    { id: 'pk-1', label: 'MacBook', createdAt: '2026-11-09T00:00:00.000Z', lastUsedAt: null, flaggedAt: null },
    { id: 'pk-2', label: 'Phone', createdAt: '2026-11-09T00:00:00.000Z', lastUsedAt: '2026-11-09T12:00:00.000Z', flaggedAt: null },
];

function mount(currentUser = user) {
    render(
        <MemoryRouter initialEntries={['/passkeys']}>
            <AuthContext.Provider value={{
                user: currentUser,
                getAccessToken: () => 'synthetic-token',
                isAuthLoading: false,
                loginWithToken: vi.fn(),
            }}>
                <Routes>
                    <Route path="/passkeys" element={<PasskeysPage />} />
                    <Route path="/login" element={<h1>Sign in</h1>} />
                </Routes>
            </AuthContext.Provider>
        </MemoryRouter>,
    );
}

test('lists the user passkeys with dates and no key material', async () => {
    listPasskeys.mockResolvedValue(stored);
    await act(async () => { mount(); });
    expect(screen.getByText('MacBook')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(listPasskeys).toHaveBeenCalledWith('synthetic-token');
    expect(screen.queryByText(/credential/i)).not.toBeInTheDocument();
});

test('shows the empty state and the password-always-works copy', async () => {
    listPasskeys.mockResolvedValue([]);
    await act(async () => { mount(); });
    expect(screen.getByText('You have no passkeys yet. Add one below.')).toBeInTheDocument();
    expect(screen.getByText(/your password always still works/i)).toBeInTheDocument();
});

test('redirects to login when there is no user', async () => {
    await act(async () => { mount(null); });
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(listPasskeys).not.toHaveBeenCalled();
});

test('adding a passkey confirms with the password and refreshes the list', async () => {
    const userEventApi = userEvent.setup();
    listPasskeys.mockResolvedValueOnce([]).mockResolvedValueOnce([...stored,
        { id: 'pk-3', label: 'Tablet', createdAt: '2026-11-09T00:00:00.000Z', lastUsedAt: null, flaggedAt: null }]);
    registerPasskey.mockResolvedValue({ id: 'pk-3', label: 'Tablet' });
    await act(async () => { mount(); });
    await userEventApi.type(screen.getByLabelText('Name for this passkey'), 'Tablet');
    await userEventApi.type(screen.getByLabelText('Current password'), 'synthetic-password');
    await userEventApi.click(screen.getByRole('button', { name: 'Add passkey' }));
    expect(registerPasskey).toHaveBeenCalledWith('synthetic-token', 'synthetic-password', 'Tablet');
    expect(await screen.findByText('Tablet')).toBeInTheDocument();
});

test('renaming a passkey saves the new label', async () => {
    const userEventApi = userEvent.setup();
    listPasskeys.mockResolvedValueOnce(stored).mockResolvedValueOnce([
        { ...stored[0], label: 'Work laptop' }, stored[1],
    ]);
    renamePasskey.mockResolvedValue({ ...stored[0], label: 'Work laptop' });
    await act(async () => { mount(); });
    await userEventApi.click(screen.getAllByRole('button', { name: 'Rename' })[0]);
    const input = screen.getByLabelText('Passkey name');
    await userEventApi.clear(input);
    await userEventApi.type(input, 'Work laptop');
    await userEventApi.click(screen.getByRole('button', { name: 'Save' }));
    expect(renamePasskey).toHaveBeenCalledWith('synthetic-token', 'pk-1', 'Work laptop');
    expect(await screen.findByText('Work laptop')).toBeInTheDocument();
});

test('removing a passkey confirms with the password', async () => {
    const userEventApi = userEvent.setup();
    listPasskeys.mockResolvedValueOnce(stored).mockResolvedValueOnce([stored[1]]);
    removePasskey.mockResolvedValue(undefined);
    await act(async () => { mount(); });
    await userEventApi.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    await userEventApi.type(screen.getByLabelText('Current password', { selector: '#remove-password' }), 'synthetic-password');
    await userEventApi.click(screen.getByRole('button', { name: 'Remove passkey' }));
    expect(removePasskey).toHaveBeenCalledWith('synthetic-token', 'pk-1', 'synthetic-password');
    await screen.findByText('Phone');
    expect(screen.queryByText('MacBook')).not.toBeInTheDocument();
});
