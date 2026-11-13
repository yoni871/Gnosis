import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import AuthContext from '../context/AuthContext';
import useNotes from './useNotes';
import useBookmarks from './useBookmarks';
import useHighlights from './useHighlights';
import useVerseSelection from './useVerseSelection';
import useScripturePreviews from './useScripturePreviews';
import * as notes from '../services/notesService';
import * as bookmarks from '../services/bookmarksService';
import * as highlights from '../services/highlightsService';
import { getBibleChapter } from '../services/bibleService';

vi.mock('../services/notesService', () => ({ getNotes: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }));
vi.mock('../services/bookmarksService', () => ({ getBookmarks: vi.fn(), createBookmark: vi.fn(), deleteBookmark: vi.fn() }));
vi.mock('../services/highlightsService', () => ({ getHighlights: vi.fn(), saveHighlights: vi.fn(), clearHighlights: vi.fn() }));
vi.mock('../services/bibleService', () => ({ getBibleChapter: vi.fn() }));

const empty = [];
const books = [{ id: 1, name: 'Genesis' }];
const passage = { bookId: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 1 };
const selection = { bookId: 1, verses: [{ chapter: 1, verse: 1 }] };
const record = { id: 7, content: 'private', book_id: 1, start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1, chapter: 1, verse: 1, color: '#abcdef' };
const A = { sessionVersion: 1, user: { id: 1 }, token: 'synthetic-A', isAuthenticated: true, isAuthLoading: false };
const B = { ...A, sessionVersion: 2, user: { id: 2 }, token: 'synthetic-B' };
const guest = { ...A, sessionVersion: 2, user: null, token: null, isAuthenticated: false };
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
async function settle(request, value, failure = false) {
    await act(async () => {
        request[failure ? 'reject' : 'resolve'](failure ? new Error('old failure') : value);
        await request.promise.catch(() => {});
    });
}
async function mount(hookFn, initial = A, strict = false) {
    let auth = initial;
    const hook = renderHook(hookFn, { reactStrictMode: strict, wrapper: ({ children }) => {
        const tree = <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
        return tree;
    } });
    await act(async () => {});
    return { ...hook, async change(next) { auth = next; hook.rerender(); await act(async () => {}); } };
}
const useJournal = () => useNotes({ book: 'Genesis', chapter: 1, selectedVerse: 1, books });
beforeEach(() => {
    vi.resetAllMocks();
    notes.getNotes.mockResolvedValue([record]);
    bookmarks.getBookmarks.mockResolvedValue([record]);
    highlights.getHighlights.mockResolvedValue([record]);
    getBibleChapter.mockResolvedValue([{ verse_number: 1, text: 'public' }]);
});

test('notes discard drafts, passage, editing state and feedback on every session boundary', async () => {
    const hook = await mount(useJournal);
    act(() => { hook.result.current.handleStartNote(passage); hook.result.current.setNoteContent('draft'); hook.result.current.handleStartEdit(record); });
    act(() => hook.result.current.handleStartNote(passage));
    expect(hook.result.current.notesError).not.toBe('');
    await hook.change({ ...B, isAuthLoading: true });
    expect(hook.result.current).toMatchObject({ notes: [], noteContent: '', draftPassage: null, editingNoteId: null, editContent: '', notesError: '', isSavingNote: false, isUpdatingNote: false, deletingNoteId: null, isLoadingNotes: false });
    await hook.change(B);
    expect(hook.result.current.notes).toHaveLength(1);
    await hook.change(guest);
    expect(hook.result.current.notes).toEqual([]);
    await hook.change({ ...A, sessionVersion: 3 });
    expect(hook.result.current.noteContent).toBe('');
});

const features = [
    { name: 'notes', hook: useJournal, load: notes.getNotes, data: 'notes', loading: 'isLoadingNotes', error: 'notesError' },
    { name: 'bookmarks', hook: useBookmarks, load: bookmarks.getBookmarks, data: 'bookmarks', loading: 'isLoading', error: 'error' },
    { name: 'highlights', hook: useHighlights, load: highlights.getHighlights, data: 'highlights', loading: 'isLoading', error: 'error' },
];
for (const feature of features) {
    test.each([false, true])(`${feature.name}: late load success/error/finally cannot change B`, async failure => {
        const old = deferred(), current = deferred();
        feature.load.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
        const hook = await mount(feature.hook);
        await hook.change(B);
        await settle(old, [record], failure);
        expect(hook.result.current[feature.data]).toEqual([]);
        expect(hook.result.current[feature.error]).toBe('');
        expect(hook.result.current[feature.loading]).toBe(true);
        await settle(current, [{ ...record, content: 'B' }]);
        expect(hook.result.current[feature.data][0].content).toBe('B');
    });
    test(`${feature.name}: Strict Mode replacement loads survive old cleanup and unmount ignores responses`, async () => {
        const old = deferred(), current = deferred();
        feature.load.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
        const hook = await mount(feature.hook, A, true);
        await settle(old, [record]);
        expect(hook.result.current[feature.loading]).toBe(true);
        await settle(current, [record]);
        expect(hook.result.current[feature.data]).toEqual([record]);
        const last = deferred();
        feature.load.mockReturnValueOnce(last.promise);
        await hook.change(B);
        hook.unmount();
        await settle(last, [], true);
    });
}

const mutations = [
    { name: 'note create', hook: useJournal, mock: notes.createNote, prepare: h => h.setNoteContent('draft'), run: h => h.handleSaveNote(), result: record, busy: 'isSavingNote', data: 'notes' },
    { name: 'note update', hook: useJournal, mock: notes.updateNote, prepare: h => h.handleStartEdit(record), run: h => h.handleUpdateNote(7), result: record, busy: 'isUpdatingNote', data: 'notes' },
    { name: 'note delete', hook: useJournal, mock: notes.deleteNote, prepare: () => {}, run: h => h.handleDeleteNote(7), busy: 'deletingNoteId', data: 'notes' },
    { name: 'bookmark create', hook: useBookmarks, mock: bookmarks.createBookmark, prepare: () => {}, run: h => h.handleAddBookmarks({ ...passage, startVerse: 2 }), result: record, busy: 'isSaving', data: 'bookmarks' },
    { name: 'bookmark delete', hook: useBookmarks, mock: bookmarks.deleteBookmark, prepare: () => {}, run: h => h.handleDeleteBookmark(7), busy: 'deletingId', data: 'bookmarks' },
    { name: 'highlight save', hook: useHighlights, mock: highlights.saveHighlights, prepare: () => {}, run: h => h.handleSaveHighlights(selection, '#abcdef'), result: [record], busy: 'isSaving', data: 'highlights' },
    { name: 'highlight clear', hook: useHighlights, mock: highlights.clearHighlights, prepare: () => {}, run: h => h.handleClearHighlights(selection), result: { removedIds: [7] }, busy: 'isSaving', data: 'highlights' },
];
for (const mutation of mutations) {
    test.each([[B, false], [B, true], [guest, false], [guest, true]])(`${mutation.name}: stale completion ignored (next=%j, failure=%s)`, async (next, failure) => {
        const old = deferred(), current = deferred();
        mutation.mock.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
        const hook = await mount(mutation.hook);
        act(() => mutation.prepare(hook.result.current));
        let operation;
        act(() => { operation = mutation.run(hook.result.current); });
        expect(mutation.mock).toHaveBeenCalledTimes(1);
        await hook.change(next);
        if (next === B) {
            // Same record IDs deliberately detect stale deletes/updates.
            act(() => mutation.prepare(hook.result.current));
            act(() => { mutation.run(hook.result.current); });
        }
        const before = hook.result.current;
        await settle(old, mutation.result, failure);
        expect(await operation).not.toBe(true);
        expect(hook.result.current).toMatchObject({
            [mutation.data]: before[mutation.data],
            [mutation.busy]: before[mutation.busy],
            [mutation.data === 'notes' ? 'notesError' : 'error']: '',
        });
        if (next === B) await settle(current, mutation.result);
    });
    test(`${mutation.name}: current-session success still works`, async () => {
        mutation.mock.mockResolvedValue(mutation.result);
        const hook = await mount(mutation.hook);
        act(() => mutation.prepare(hook.result.current));
        await act(async () => { await mutation.run(hook.result.current); });
        expect(mutation.mock).toHaveBeenCalledTimes(1);
        expect(hook.result.current[mutation.busy]).toBe(mutation.busy.endsWith('Id') ? null : false);
    });
}

test('guest data and prompts persist within a guest session, but never transfer to an account', async () => {
    const hook = await mount(() => ({ bookmarks: useBookmarks(), highlights: useHighlights() }), guest);
    await act(async () => { await hook.result.current.bookmarks.handleAddBookmarks(passage); await hook.result.current.highlights.handleSaveHighlights(selection, '#abcdef'); });
    hook.rerender();
    expect(hook.result.current.bookmarks.bookmarks).toHaveLength(1);
    expect(hook.result.current.highlights.highlights).toHaveLength(1);
    expect(hook.result.current.bookmarks.showLoginPrompt).toBe(true);
    expect(bookmarks.createBookmark).not.toHaveBeenCalled();
    await hook.change({ ...A, sessionVersion: 3, isAuthLoading: true });
    expect(hook.result.current.bookmarks.bookmarks).toEqual([]);
    expect(hook.result.current.highlights.highlights).toEqual([]);
    expect(hook.result.current.bookmarks.showLoginPrompt).toBe(false);
    expect(hook.result.current.highlights.showLoginPrompt).toBe(false);
});

test('selection resets while stable reader callbacks and expected-selection protection survive', async () => {
    const hook = await mount(useVerseSelection);
    const actions = hook.result.current;
    act(() => actions.toggleVerse(1, 1, 1));
    const old = hook.result.current.selection;
    await hook.change(B);
    expect(hook.result.current.selection.verses).toEqual([]);
    for (const key of ['clearSelection', 'replaceSelection', 'retainAvailableVerses']) expect(hook.result.current[key]).toBe(actions[key]);
    act(() => hook.result.current.replaceSelection(1, 1, 2));
    act(() => actions.clearSelection(old));
    expect(hook.result.current.selection.verses).toEqual([{ chapter: 1, verse: 2 }]);
});

test.each([false, true])('preview snapshots ignore stale completion (%s), retain public cache and retry failures', async failure => {
    const old = deferred();
    getBibleChapter.mockReturnValueOnce(old.promise);
    let records = [record];
    const hook = await mount(() => useScripturePreviews(records, books, 'KJV', empty));
    records = [];
    await hook.change(B);
    await settle(old, [{ verse_number: 1, text: 'public' }], failure);
    expect(hook.result.current).toEqual({ chapters: {}, error: '', isLoading: false });
    records = [record];
    await act(async () => hook.rerender());
    expect(hook.result.current.chapters['1:1']).toEqual([{ verse_number: 1, text: 'public' }]);
    expect(getBibleChapter).toHaveBeenCalledTimes(failure ? 2 : 1);
});

test('current failures retain the draft for retry; old failures cannot replace B feedback or editing state', async () => {
    const old = deferred();
    notes.createNote.mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error('B failure'));
    const hook = await mount(useJournal);
    act(() => hook.result.current.setNoteContent('A draft'));
    let operation;
    act(() => { operation = hook.result.current.handleSaveNote(); });
    await hook.change(B);
    act(() => { hook.result.current.setNoteContent('B draft'); hook.result.current.handleStartEdit({ ...record, content: 'B edit' }); });
    await act(async () => { await hook.result.current.handleSaveNote(); });
    expect(hook.result.current.notesError).toBe('B failure');
    await settle(old, null, true);
    expect(await operation).toBe(false);
    expect(hook.result.current).toMatchObject({ noteContent: 'B draft', editContent: 'B edit', editingNoteId: 7, notesError: 'B failure', isSavingNote: false });
});

test('note autosaves are serialized so a slow older response cannot overwrite a newer edit', async () => {
    vi.useFakeTimers();
    const first = deferred();
    notes.updateNote.mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce({ ...record, title: 'Newest', content: '<p>Newest</p>' });
    const hook = await mount(useJournal);
    act(() => hook.result.current.handleStartEdit(record));

    act(() => hook.result.current.scheduleDocumentSave(7, { title: 'Older', content: '<p>Older</p>' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    act(() => hook.result.current.scheduleDocumentSave(7, { title: 'Newest', content: '<p>Newest</p>' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(notes.updateNote).toHaveBeenCalledTimes(1);

    await settle(first, { ...record, title: 'Older', content: '<p>Older</p>' });
    await act(async () => {});
    expect(notes.updateNote).toHaveBeenCalledTimes(2);
    expect(notes.updateNote).toHaveBeenLastCalledWith('synthetic-A', 7, {
        title: 'Newest', content: '<p>Newest</p>',
    });
    expect(hook.result.current.notes[0]).toMatchObject({ title: 'Newest', content: '<p>Newest</p>' });
    vi.useRealTimers();
});

test('same-user reauthentication clears drafts even when user ID and token are reused', async () => {
    const hook = await mount(useJournal);
    act(() => hook.result.current.setNoteContent('old draft'));
    await hook.change({ ...A, sessionVersion: 3 });
    expect(hook.result.current.noteContent).toBe('');
});

test('a token without confirmed user ID cannot load or mutate private records', async () => {
    const hook = await mount(useJournal, { ...A, user: { email: 'synthetic@example.invalid' } });
    act(() => hook.result.current.setNoteContent('draft'));
    await act(async () => { await hook.result.current.handleSaveNote(); });
    expect(notes.getNotes).not.toHaveBeenCalled();
    expect(notes.createNote).not.toHaveBeenCalled();
});
