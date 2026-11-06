import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { it, expect, vi } from 'vitest';
import AuthContext from '../../context/AuthContext';
import ProfileMenu from './ProfileMenu';
import MobileMenu from './MobileMenu';
import { ThemeProvider } from '../../context/ThemeContext';
it('keeps account actions, removes saved-reader links, and supports keyboard dismissal', async () => {
    const user = userEvent.setup();
    const logout = vi.fn();
    render(<MemoryRouter><AuthContext.Provider value={{ user: {
        first_name: 'Test', last_name: 'Reader', email: 'reader@example.invalid'
    }, logout }}><ProfileMenu /></AuthContext.Provider></MemoryRouter>);
    const trigger = screen.getByRole('button', { name: /Test Reader/ });
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Profile' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeVisible();
    expect(screen.queryByText('Bookmarks')).not.toBeInTheDocument();
    expect(screen.queryByText('Highlights')).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Settings' }).focus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole('link', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalledOnce();
});

it('keeps the mobile profile compact and returns keyboard focus on Escape', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ThemeProvider><AuthContext.Provider value={{ user: {
        first_name: 'Test', last_name: 'Reader', email: 'reader@example.invalid'
    }, isAuthenticated: true, logout: vi.fn() }}><MobileMenu showSearch={false} /></AuthContext.Provider></ThemeProvider></MemoryRouter>);
    const trigger = screen.getByRole('button', { name: 'Open navigation menu' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /Test Reader/ }));
    expect(screen.getByRole('button', { name: 'Profile' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeVisible();
    expect(screen.queryByText('Bookmarks')).not.toBeInTheDocument();
    expect(screen.queryByText('Highlights')).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Settings' }).focus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
