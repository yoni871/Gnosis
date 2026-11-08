import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import LandingFooter from './LandingFooter';

test.each([false, true])('footer logo scrolls to top (reduced motion: %s)', async (reducedMotion) => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reducedMotion })));
    render(<MemoryRouter><LandingFooter /></MemoryRouter>);
    await userEvent.setup().click(screen.getByRole('link', { name: 'Gnosis home' }));
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' }));
});
