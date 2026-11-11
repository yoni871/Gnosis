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
const pageOf = (results, total = results.length, hasMore = false) =>
    ({ results, total, page: 1, limit: 100, hasMore });
it('shows Scripture before commentary and preserves results when commentary fails', async () => {
    searchBible.mockResolvedValue(pageOf([verse]));
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
        .mockResolvedValue(pageOf([]));
    searchCommentary.mockResolvedValue([]);
    render(<MemoryRouter initialEntries={['/search?q=faith']}><NextSearch /><SearchResultsPage /></MemoryRouter>);
    const signal = searchBible.mock.calls.at(-1)[2].signal;
    fireEvent.click(screen.getByText('Next search'));
    await waitFor(() => expect(signal.aborted).toBe(true));
    resolveOld(pageOf([verse]));
    await waitFor(() => expect(screen.getByText('No Scripture results')).toBeVisible());
    expect(screen.queryByText(verse.text)).not.toBeInTheDocument();
});
it('loads more Scripture results without repeating verses', async () => {
    const second = { book: 'John', chapter_number: 3, verse_number: 17, text: 'God did not send his Son' };
    const third = { book: 'John', chapter_number: 3, verse_number: 18, text: 'Whoever believes in him' };
    searchBible.mockImplementation((_query, _translation, { page = 1 } = {}) =>
        Promise.resolve(page === 1
            ? { results: [verse, second], total: 3, page: 1, limit: 100, hasMore: true }
            : { results: [third], total: 3, page: 2, limit: 100, hasMore: false }));
    searchCommentary.mockResolvedValue([]);
    render(<MemoryRouter initialEntries={['/search?q=love']}><SearchResultsPage /></MemoryRouter>);
    expect(await screen.findByText(verse.text)).toBeVisible();
    expect(screen.getByText(second.text)).toBeVisible();
    expect(screen.getByText('Showing 2 of 3 verses')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more verses' }));
    expect(await screen.findByText(third.text)).toBeVisible();
    // Paging must neither skip nor repeat: every loaded verse appears exactly once.
    expect(screen.getAllByText(verse.text)).toHaveLength(1);
    expect(screen.getAllByText(second.text)).toHaveLength(1);
    expect(screen.getByText('Showing 3 of 3 verses')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more verses' })).not.toBeInTheDocument();
    expect(searchBible).toHaveBeenCalledWith('love', 'BSB', expect.objectContaining({ page: 2 }));
});
it('renders commentary match highlights instead of stripping them', async () => {
    searchBible.mockResolvedValue(pageOf([]));
    searchCommentary.mockResolvedValue([{
        id: 1,
        commentary_id: 3,
        book: 'John',
        start_chapter: 3,
        start_verse: 16,
        end_chapter: 3,
        end_verse: 16,
        entry_title: 'John 3:16',
        source: 'Matthew Henry',
        excerpt: 'For God so <b>loved</b> the world',
    }]);
    render(<MemoryRouter initialEntries={['/search?q=loved']}><SearchResultsPage /></MemoryRouter>);
    const match = await screen.findByText('loved');
    expect(match.tagName).toBe('STRONG');
    expect(screen.getByText(/For God so/)).toBeInTheDocument();
    // No raw <b> markup leaks into the rendered text.
    expect(document.body.textContent).not.toContain('<b>');
});
