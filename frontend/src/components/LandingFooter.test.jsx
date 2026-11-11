import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { ThemeProvider } from '../context/ThemeContext';
import LandingFooter from './LandingFooter';

test.each([false, true])('footer logo scrolls to top (reduced motion: %s)', async (reducedMotion) => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reducedMotion })));
    render(<MemoryRouter><ThemeProvider><LandingFooter /></ThemeProvider></MemoryRouter>);
    await userEvent.setup().click(screen.getByRole('link', { name: 'Gnosis home' }));
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' }));
});

test('footer theme toggle switches between light and dark', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('gnosis-theme', 'light');
    render(<MemoryRouter><ThemeProvider><LandingFooter /></ThemeProvider></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
});
