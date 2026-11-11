import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import AuthContext from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import LandingHeader from './LandingHeader';

function mount() {
    const logout = vi.fn();
    render(<MemoryRouter><ThemeProvider><AuthContext.Provider value={{ user: {
        id: 1, first_name: 'Alexandria', last_name: 'Montgomery-Worthington'
    }, isAuthLoading: false, logout }}>
        <LandingHeader hero /><button>Outside</button>
    </AuthContext.Provider></ThemeProvider></MemoryRouter>);
    return logout;
}

test('account disclosure preserves full name, action list, Tab order, Escape, and sign out', async () => {
    const user = userEvent.setup();
    const logout = mount();
    const trigger = screen.getByRole('button', { name: 'Account menu for Alexandria Montgomery-Worthington' });
    expect(within(trigger).getByText('Alexandria Montgomery-Worthington')).toHaveAttribute('title', 'Alexandria Montgomery-Worthington');
    trigger.focus();
    await user.keyboard('{Enter}');
    const list = document.getElementById(trigger.getAttribute('aria-controls'));
    expect(list.tagName).toBe('UL');
    // Two items: Settings and Sign out. (A Profile item used to sit here
    // with no handler — it did nothing when clicked — so it was removed;
    // it returns when a profile page lands.)
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).queryByText(/Bookmarks|Highlights|Profile/)).toBeNull();
    await user.tab();
    expect(within(list).getByRole('link', { name: 'Settings' })).toHaveFocus();
    expect(within(list).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    await user.tab();
    expect(within(list).getByRole('button', { name: 'Sign out' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalledOnce();
});

test('nested mobile disclosures survive null touch blur, switch reliably, and close on outside touch', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    const explore = within(mobile).getByRole('button', { name: 'Explore' });
    await user.click(explore);
    fireEvent.blur(explore, { relatedTarget: null });
    expect(explore).toHaveAttribute('aria-expanded', 'true');
    const account = within(mobile).getByRole('button', { name: /Account menu/ });
    fireEvent.blur(explore, { relatedTarget: account });
    expect(explore).toHaveAttribute('aria-expanded', 'true');
    await user.click(account);
    expect(explore).toHaveAttribute('aria-expanded', 'false');
    expect(account).toHaveAttribute('aria-expanded', 'true');
    fireEvent.blur(account, { relatedTarget: null });
    expect(account).toHaveAttribute('aria-expanded', 'true');
    within(mobile).getByRole('button', { name: 'Sign out' }).focus();
    await user.keyboard('{Escape}');
    expect(account).toHaveFocus();
    expect(mobile).toBeInTheDocument();
    await user.click(account);
    fireEvent.blur(account, { relatedTarget: explore });
    expect(account).toHaveAttribute('aria-expanded', 'true');
    await user.click(explore);
    expect(account).toHaveAttribute('aria-expanded', 'false');
    expect(explore).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).toBeNull();
});

test('clicking the changing hamburger SVG reliably opens and closes mobile navigation', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Open menu' }).querySelector('svg'));
    expect(screen.getByRole('navigation', { name: 'Mobile' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close menu' }).querySelector('svg'));
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).toBeNull();
});

test('theme toggle switches between light and dark', async () => {
    const user = userEvent.setup();
    document.documentElement.setAttribute('data-theme', 'light');
    mount();
    const toggle = screen.getByRole('button', { name: 'Switch to dark theme' });
    await user.click(toggle);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
});
