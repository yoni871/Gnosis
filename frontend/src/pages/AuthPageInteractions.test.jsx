import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import AuthContext from '../context/AuthContext';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';

for (const Page of [LoginPage, RegisterPage]) {
    for (const authenticated of [false, true]) {
        test(`${Page.name} logo returns ${authenticated ? 'authenticated' : 'signed-out'} users home`, async () => {
            const user = userEvent.setup();
            render(<MemoryRouter initialEntries={['/auth']}><AuthContext.Provider value={{
                user: authenticated ? { first_name: 'Test' } : null,
                isAuthenticated: authenticated,
            }}><Routes>
                <Route path="/auth" element={<Page />} />
                <Route path="/" element={<h1>Home destination</h1>} />
            </Routes></AuthContext.Provider></MemoryRouter>);
            await user.click(screen.getByRole('link', { name: 'Gnosis' }));
            expect(screen.getByRole('heading', { name: 'Home destination' })).toBeInTheDocument();
        });
    }

    test(`${Page.name} toggles password with the keyboard without losing input or submitting`, async () => {
        const user = userEvent.setup();
        const submit = vi.fn();
        render(<MemoryRouter><AuthContext.Provider value={{ login: submit, register: submit }}>
            <Page />
        </AuthContext.Provider></MemoryRouter>);
        const password = screen.getByLabelText('Password');
        expect(password).toHaveAttribute('type', 'password');
        await user.type(password, 'synthetic-password');
        await user.tab();
        expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(password).toHaveAttribute('type', 'text');
        expect(password).toHaveValue('synthetic-password');
        await user.keyboard(' ');
        expect(password).toHaveAttribute('type', 'password');
        expect(password).toHaveValue('synthetic-password');
        expect(password).toBeRequired();
        expect(submit).not.toHaveBeenCalled();
    });
}
