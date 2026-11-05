import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

function Boom() {
    throw new Error('boom');
}

test('ErrorBoundary shows a friendly fallback instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
        <ErrorBoundary>
            <Boom />
        </ErrorBoundary>
    );

    expect(
        screen.getByText('Something went wrong while loading this page.')
    ).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Reload page' })
    ).toBeInTheDocument();
});

test('ErrorBoundary renders its children when nothing throws', () => {
    render(
        <ErrorBoundary>
            <p>Reader content</p>
        </ErrorBoundary>
    );

    expect(screen.getByText('Reader content')).toBeInTheDocument();
});
