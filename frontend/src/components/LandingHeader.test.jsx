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
    // Three items: Settings, the theme row, and Sign out. (A Profile
    // item used to sit here with no handler — it did nothing when
    // clicked — so it was removed; it returns when a profile page
    // lands. Two-factor authentication used to sit here too; it moved
    // into Settings under Security, reached through the Settings item.)
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).queryByText(/Bookmarks|Highlights|Profile/)).toBeNull();
    await user.tab();
    expect(within(list).getByRole('link', { name: 'Settings' })).toHaveFocus();
    expect(within(list).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    await user.tab();
    expect(within(list).getByRole('button', { name: 'Switch to dark theme' })).toHaveFocus();
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

function mountLoggedOut() {
    render(<MemoryRouter><ThemeProvider><AuthContext.Provider value={{ user: null, isAuthLoading: false, logout: vi.fn() }}>
        <LandingHeader hero /><button>Outside</button>
    </AuthContext.Provider></ThemeProvider></MemoryRouter>);
}

test('account menu theme row switches the theme without closing the menu', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('gnosis-theme', 'light');
    mount();
    // No standalone header toggle: the theme control lives in the menu.
    expect(screen.queryByRole('button', { name: 'Switch to dark theme' })).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Account menu for Alexandria Montgomery-Worthington' });
    await user.click(trigger);
    const list = document.getElementById(trigger.getAttribute('aria-controls'));
    await user.click(within(list).getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    // The menu stays open so the change is visible immediately.
    expect(list).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
});

test('mobile menu offers one theme row to logged-out visitors', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('gnosis-theme', 'light');
    mountLoggedOut();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    const toggles = within(mobile).getAllByRole('button', { name: 'Switch to dark theme' });
    expect(toggles).toHaveLength(1);
    await user.click(toggles[0]);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(within(mobile).getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
});

test('logged-in mobile menu has no theme row outside the account menu', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    expect(within(mobile).queryByRole('button', { name: 'Switch to dark theme' })).toBeNull();
});
