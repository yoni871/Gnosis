import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { it, expect, vi } from 'vitest';
import SearchResultsPage from './SearchResultsPage';
import { searchBible, searchCommentary } from '../services/searchService';
vi.mock('../services/searchService', () => ({ searchBible: vi.fn(), searchCommentary: vi.fn() }));
vi.mock('../services/bibleService', () => ({ getBooks: async () => [] }));
vi.mock('../components/Header/Header', () => ({ default: () => null }));
vi.mock('../components/Navigation/SubHeader', () => ({ default: () => null }));
function NextSearch() {
    const navigate = useNavigate();
    return <button onClick={() => navigate('/search?q=hope')}>Next search</button>;
}
const verse = { book: 'John', chapter_number: 3, verse_number: 16, text: 'God so loved the world' };
it('shows Scripture before commentary and preserves results when commentary fails', async () => {
    searchBible.mockResolvedValue([verse]);
    let reject;
    searchCommentary.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    render(<MemoryRouter initialEntries={['/search?q=love']}><SearchResultsPage /></MemoryRouter>);
    expect(await screen.findByText(verse.text)).toBeVisible();
    expect(screen.getByText('Searching commentary…')).toBeInTheDocument();
    reject(new Error('failed'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(verse.text)).toBeVisible();
});
it('aborts rapid consecutive searches and ignores late responses', async () => {
    let resolveOld;
    searchBible.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
        .mockResolvedValue([]);
    searchCommentary.mockResolvedValue([]);
    render(<MemoryRouter initialEntries={['/search?q=faith']}><NextSearch /><SearchResultsPage /></MemoryRouter>);
    const signal = searchBible.mock.calls.at(-1)[2].signal;
    fireEvent.click(screen.getByText('Next search'));
    await waitFor(() => expect(signal.aborted).toBe(true));
    resolveOld([verse]);
    await waitFor(() => expect(screen.getByText('No Scripture results')).toBeVisible());
    expect(screen.queryByText(verse.text)).not.toBeInTheDocument();
});
