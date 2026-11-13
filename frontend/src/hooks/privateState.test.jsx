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
    expect(hook.result.current).toMatchObject({ notes: [], noteContent: '', draftPassage: null, editingNoteId: null, notesError: '', isSavingNote: false, deletingNoteId: null, isLoadingNotes: false });
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
    { name: 'note create', hook: useJournal, mock: notes.createNote, prepare: () => {}, run: h => h.handleCreateDocument(), result: record, busy: 'isSavingNote', data: 'notes' },
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
    notes.updateNote.mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error('B failure'));
    const hook = await mount(useJournal);
    act(() => { hook.result.current.handleStartEdit(record); hook.result.current.changeDocument(7, { content: 'A draft' }); });
    let operation;
    act(() => { operation = hook.result.current.saveDocument(7); });
    await hook.change(B);
    act(() => { hook.result.current.handleStartEdit(record); hook.result.current.changeDocument(7, { content: 'B edit' }); });
    await act(async () => { await hook.result.current.saveDocument(7); });
    expect(hook.result.current.documents[7].error).toBe('B failure');
    await settle(old, null, true);
    expect(await operation).toBe(false);
    expect(hook.result.current).toMatchObject({ editingNoteId: 7, documents: { 7: { content: 'B edit', error: 'B failure' } } });
});

test('overlapping saves remain bound to their note across rapid switches', async () => {
    const first = deferred(), second = deferred();
    const noteA = { ...record, id: 701, title: 'A', content: 'body A' };
    const noteB = { ...record, id: 702, title: 'B', content: 'body B' };
    notes.getNotes.mockResolvedValue([noteA, noteB]);
    notes.updateNote.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const hook = await mount(useJournal);
    act(() => hook.result.current.handleStartEdit(noteA));
    act(() => hook.result.current.changeDocument(701, { title: 'A edit', content: 'A draft' }));
    act(() => { void hook.result.current.saveDocument(701); });
    act(() => hook.result.current.handleStartEdit(noteB));
    act(() => hook.result.current.changeDocument(702, { title: 'B edit', content: 'B draft' }));
    act(() => { void hook.result.current.saveDocument(702); });
    act(() => hook.result.current.changeDocument(701, { content: 'late callback' }));
    await settle(second, { ...noteB, title: 'B edit', content: 'B draft' });
    await settle(first, { ...noteA, title: 'A edit', content: 'A draft' });
    expect(hook.result.current.editingNoteId).toBe(702);
    expect(hook.result.current.documents[701]).toMatchObject({ title: 'A edit', content: 'A draft', saving: false });
    expect(hook.result.current.documents[702]).toMatchObject({ title: 'B edit', content: 'B draft', saving: false });
    expect(notes.updateNote).toHaveBeenNthCalledWith(1, 'synthetic-A', 701, { title: 'A edit', content: 'A draft' });
    expect(notes.updateNote).toHaveBeenNthCalledWith(2, 'synthetic-A', 702, { title: 'B edit', content: 'B draft' });
});

test('a failed save keeps the draft; cancel restores the last confirmed version', async () => {
    const note = { ...record, id: 703, title: 'Original', content: 'Original body' };
    notes.getNotes.mockResolvedValue([note]);
    notes.updateNote.mockRejectedValueOnce(new Error('Offline'));
    notes.updateNote.mockResolvedValueOnce(note);
    const hook = await mount(useJournal);
    act(() => hook.result.current.handleStartEdit(note));
    act(() => hook.result.current.changeDocument(note.id, { title: 'Draft', content: 'Draft body' }));
    await act(async () => { await hook.result.current.saveDocument(note.id); });
    expect(hook.result.current.documents[note.id]).toMatchObject({ title: 'Draft', content: 'Draft body', error: 'Offline' });
    await act(async () => { await hook.result.current.cancelDocument(note.id); });
    expect(hook.result.current.documents[note.id]).toMatchObject({ title: 'Original', content: 'Original body', error: '' });
    expect(notes.updateNote).toHaveBeenCalledTimes(2);
    expect(notes.updateNote).toHaveBeenLastCalledWith('synthetic-A', note.id, { title: 'Original', content: 'Original body' });
});

test('an in-flight save can finish after unmount and the same session restores its draft', async () => {
    const note = { ...record, id: 704, title: 'Before', content: 'Before body' };
    notes.getNotes.mockResolvedValue([note]);
    const request = deferred();
    notes.updateNote.mockReturnValueOnce(request.promise);
    const first = await mount(useJournal);
    act(() => first.result.current.handleStartEdit(note));
    act(() => first.result.current.changeDocument(note.id, { title: 'After', content: 'After body' }));
    act(() => { void first.result.current.saveDocument(note.id); });
    first.unmount();
    const next = await mount(useJournal);
    act(() => next.result.current.handleStartEdit(note));
    expect(next.result.current.documents[note.id]).toMatchObject({ title: 'After', content: 'After body', saving: true });
    await settle(request, { ...note, title: 'After', content: 'After body' });
    expect(next.result.current.documents[note.id]).toMatchObject({ title: 'After', content: 'After body', saving: false });
});

test('same-user reauthentication clears drafts even when user ID and token are reused', async () => {
    const hook = await mount(useJournal);
    act(() => hook.result.current.setNoteContent('old draft'));
    await hook.change({ ...A, sessionVersion: 3 });
    expect(hook.result.current.noteContent).toBe('');
});

test('a token without confirmed user ID cannot load or mutate private records', async () => {
    const hook = await mount(useJournal, { ...A, user: { email: 'synthetic@example.invalid' } });
    await act(async () => { await hook.result.current.handleCreateDocument(); });
    expect(notes.getNotes).not.toHaveBeenCalled();
    expect(notes.createNote).not.toHaveBeenCalled();
});
