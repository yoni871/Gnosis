import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

test('React rendering, user interactions and DOM matchers work', async () => {
    function TestControl() {
        const [saved, setSaved] = useState(false);
        return <button onClick={() => setSaved(true)}>{saved ? 'Saved' : 'Save'}</button>;
    }
    const user = userEvent.setup();
    render(<TestControl />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument();
});

test('unmocked fetch is rejected and API configuration is synthetic', () => {
    expect(() => fetch('https://example.invalid')).toThrow('Unexpected network request');
    expect(import.meta.env.VITE_API_URL).toBe('https://api.example.invalid/api');
});
