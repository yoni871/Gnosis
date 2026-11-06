import { useContext } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import ThemeContext, { ThemeProvider } from './ThemeContext';
function Toggle() {
    const { theme, setTheme } = useContext(ThemeContext);
    return <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme}</button>;
}
describe('theme persistence', () => {
    it('retains both explicit choices after remounting the application', () => {
        const app = () => <ThemeProvider><Toggle /></ThemeProvider>;
        let view = render(app());
        fireEvent.click(screen.getByText('light'));
        expect(localStorage.getItem('gnosis-theme')).toBe('dark');
        view.unmount();
        view = render(app());
        expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
        fireEvent.click(screen.getByText('dark'));
        view.unmount();
        render(app());
        expect(screen.getByText('light')).toBeInTheDocument();
        expect(localStorage.getItem('gnosis-theme')).toBe('light');
    });
    it('applies dark before React loads and defaults safely with blocked storage', () => {
        const bootstrap = fs.readFileSync('public/theme-init.js', 'utf8');
        localStorage.setItem('gnosis-theme', 'dark');
        Function(bootstrap)();
        expect(document.documentElement.dataset.theme).toBe('dark');
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        Function(bootstrap)();
        render(<ThemeProvider><Toggle /></ThemeProvider>);
        fireEvent.click(screen.getByText('light'));
        expect(document.documentElement.dataset.theme).toBe('dark');
    });
});
