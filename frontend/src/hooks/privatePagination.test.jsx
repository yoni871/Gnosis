import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import AuthContext from '../context/AuthContext';
import useNotes from './useNotes';
import useHighlights from './useHighlights';
import * as notes from '../services/notesService';
import * as highlights from '../services/highlightsService';
vi.mock('../services/notesService', () => ({ getNotes: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }));
vi.mock('../services/highlightsService', () => ({ getHighlights: vi.fn(), saveHighlights: vi.fn(), clearHighlights: vi.fn() }));
const identity = id => ({ sessionVersion: id, user: { id }, token: `synthetic-owner-${id}`, isAuthenticated: true, isAuthLoading: false });
let owner;
function Wrapper({ children }) { return <AuthContext.Provider value={owner}>{children}</AuthContext.Provider>; }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const page = (items, nextCursor = null) => ({ items, nextCursor, hasMore: nextCursor !== null });
beforeEach(() => { vi.resetAllMocks(); owner = identity(1); });
test('load-more uses the returned cursor and preserves local items without duplicates', async () => {
    notes.getNotes.mockResolvedValueOnce(page([{ id: 5, content: 'first' }], '5'))
        .mockResolvedValueOnce(page([{ id: 5, content: 'stale duplicate' }, { id: 4, content: 'older' }], null));
    const { result } = renderHook(() => useNotes({ book: 'Genesis', chapter: 1, selectedVerse: 1, books: [{ id: 1, name: 'Genesis' }] }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.nextCursor).toBe('5'));
    await act(async () => result.current.loadMore());
    expect(notes.getNotes).toHaveBeenLastCalledWith('synthetic-owner-1', '5');
    expect(result.current.notes).toEqual([{ id: 5, content: 'first' }, { id: 4, content: 'older' }]);
    expect(result.current.nextCursor).toBeNull();
});
test('late pages from a previous account cannot enter the new journal or erase its draft', async () => {
    const late = deferred();
    notes.getNotes.mockResolvedValueOnce(page([{ id: 5, content: 'A' }], '5'))
        .mockReturnValueOnce(late.promise).mockResolvedValueOnce(page([{ id: 9, content: 'B' }]));
    const { result, rerender } = renderHook(() => useNotes({ book: 'Genesis', chapter: 1, selectedVerse: 1, books: [] }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.nextCursor).toBe('5'));
    let pending;
    act(() => { pending = result.current.loadMore(); });
    owner = identity(2); rerender();
    await waitFor(() => expect(result.current.notes).toEqual([{ id: 9, content: 'B' }]));
    act(() => result.current.setNoteContent('B private draft'));
    await act(async () => { late.resolve(page([{ id: 1, content: 'A late private item' }])); await pending; });
    expect(result.current.notes).toEqual([{ id: 9, content: 'B' }]);
    expect(result.current.noteContent).toBe('B private draft');
});
test('older current-chapter colors load independently of the global journal cursor', async () => {
    highlights.getHighlights.mockImplementation(async (token, cursor, filters) => {
        if (!filters) return page([{ id: 90, book_id: 2, chapter: 1, verse: 1, color: '#112233' }], '90');
        expect(filters).toEqual({ bookId: 1, chapter: 1 });
        return cursor ? page([{ id: 3, book_id: 1, chapter: 1, verse: 2, color: '#445566' }])
            : page([{ id: 4, book_id: 1, chapter: 1, verse: 1, color: '#778899' }], '4');
    });
    const { result } = renderHook(() => useHighlights({ bookId: 1, chapter: 1 }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.highlights).toHaveLength(3));
    expect(result.current.nextCursor).toBe('90');
    expect(result.current.highlights.find(row => row.id === 3).color).toBe('#445566');
    expect(result.current.isLoading).toBe(false);
});
