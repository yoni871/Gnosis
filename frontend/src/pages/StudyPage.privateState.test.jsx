import { useContext, useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import StudyPage from './StudyPage';
import AuthContext, { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import * as authService from '../services/authService';
import * as bible from '../services/bibleService';
import * as commentary from '../services/commentaryService';
import * as notes from '../services/notesService';
import * as bookmarks from '../services/bookmarksService';
import * as highlights from '../services/highlightsService';

vi.mock('../services/authService', () => ({ getProfile: vi.fn(), loginUser: vi.fn(), registerUser: vi.fn(), refreshSession: vi.fn(), logoutSession: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/bibleService', () => ({ getBooks: vi.fn(), getTranslations: vi.fn(), getBibleChapter: vi.fn(), getChapters: vi.fn() }));
vi.mock('../services/commentaryService', () => ({ getCommentaries: vi.fn(), getChapterCommentaries: vi.fn() }));
vi.mock('../services/notesService', () => ({ getNotes: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }));
vi.mock('../services/bookmarksService', () => ({ getBookmarks: vi.fn(), createBookmark: vi.fn(), deleteBookmark: vi.fn() }));
vi.mock('../services/highlightsService', () => ({ getHighlights: vi.fn(), saveHighlights: vi.fn(), clearHighlights: vi.fn() }));

let auth;
function Probe() {
    const value = useContext(AuthContext);
    useEffect(() => { auth = value; }, [value]);
    return null;
}
// Records the router location so a test can read the URL the reader
// actually shows, which MemoryRouter does not put on window.location.
let location;
function LocationProbe() {
    const currentLocation = useLocation();
    useEffect(() => { location = currentLocation; }, [currentLocation]);
    return null;
}
function deferred() {
    let resolve;
    const promise = new Promise(yes => { resolve = yes; });
    return { resolve, promise };
}
const record = { id: 1, content: 'A private note', book_id: 1, start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1, created_at: '2026-01-01T00:00:00Z' };
const scrollDescriptors = new Map(['scrollIntoView', 'scrollTo'].map(name => [name, Object.getOwnPropertyDescriptor(Element.prototype, name)]));
beforeAll(() => {
    for (const name of scrollDescriptors.keys()) Object.defineProperty(Element.prototype, name, { configurable: true, value: vi.fn() });
});
afterAll(() => {
    for (const [name, descriptor] of scrollDescriptors) {
        if (descriptor) Object.defineProperty(Element.prototype, name, descriptor);
        else delete Element.prototype[name];
    }
});
beforeEach(() => {
    vi.resetAllMocks();
    authService.logoutSession.mockResolvedValue(undefined);
    vi.mocked(fetch).mockImplementation(async url => {
        if (!String(url).endsWith('/books/1/chapters')) throw new Error('Unexpected mocked URL');
        return { json: async () => [{ chapter: 1 }] };
    });
    authService.refreshSession.mockResolvedValue({ token: 'synthetic-A' });
    authService.getProfile.mockResolvedValue({ id: 1, first_name: 'Synthetic', last_name: 'A', email: 'a@example.invalid' });
    authService.loginUser.mockResolvedValue({ token: 'synthetic-B' });
    bible.getBooks.mockResolvedValue([{ id: 1, name: 'Genesis', chapters: 50 }]);
    bible.getTranslations.mockResolvedValue([{ abbreviation: 'KJV', name: 'Synthetic public translation' }]);
    bible.getBibleChapter.mockResolvedValue([{ verse_number: 1, text: 'Public Scripture stays' }]);
    bible.getChapters.mockResolvedValue([{ chapter: 1 }]);
    commentary.getCommentaries.mockResolvedValue([{ id: 3, name: 'Public commentator' }]);
    commentary.getChapterCommentaries.mockResolvedValue([{ id: 1, entry_title: 'Public commentary stays', content: 'Public commentary text', start_chapter: 1, end_chapter: 1, start_verse: 1, end_verse: 1 }]);
    notes.getNotes.mockResolvedValue([record]);
    bookmarks.getBookmarks.mockResolvedValue([]);
    highlights.getHighlights.mockResolvedValue([]);
});
async function mount(strict = false, entry = '/bible/Genesis/1?verse=1&translation=KJV') {
    render(<ThemeProvider><AuthProvider><Probe /><MemoryRouter initialEntries={[entry]}><LocationProbe /><Routes><Route path="/bible/:book/:chapter" element={<StudyPage />} /></Routes></MemoryRouter></AuthProvider></ThemeProvider>, { reactStrictMode: strict });
    await act(async () => {});
    return within(document.querySelector('main'));
}
async function switchAccount() {
    act(() => auth.logout());
    authService.getProfile.mockResolvedValue({ id: 2, first_name: 'Synthetic', last_name: 'B', email: 'b@example.invalid' });
    notes.getNotes.mockResolvedValue([]);
    await act(async () => { await auth.login({ email: 'b@example.invalid', password: 'synthetic-only' }); });
}

test.each([false, true])('actual StudyPage resets drafts/actions across accounts and retains public reader state (Strict Mode=%s)', async strict => {
    const desktop = await mount(strict);
    expect(desktop.getByText('Public Scripture stays')).toBeInTheDocument();
    expect(desktop.getAllByText('Public commentary stays').length).toBeGreaterThan(0);
    fireEvent.click(desktop.getByRole('button', { name: 'Notes', exact: true }));
    expect(desktop.getByText('A private note')).toBeInTheDocument();
    const composer = desktop.getByPlaceholderText(/Write what you notice/);
    fireEvent.change(composer, { target: { value: 'A unsaved draft' } });
    fireEvent.click(screen.getByText('Stack'));
    expect(document.querySelector('main')).toHaveClass('grid-rows-2');
    const scriptureCalls = bible.getBibleChapter.mock.calls.length;
    const commentaryCalls = commentary.getChapterCommentaries.mock.calls.length;
    await switchAccount();
    expect(desktop.queryByText('A private note')).not.toBeInTheDocument();
    expect(desktop.queryByDisplayValue('A unsaved draft')).not.toBeInTheDocument();
    expect(desktop.getByPlaceholderText(/Write what you notice/)).toHaveValue('');
    expect(screen.queryAllByLabelText('Choose highlight color')).toHaveLength(0);
    expect(desktop.getByText('Public Scripture stays')).toBeInTheDocument();
    expect(desktop.getByRole('button', { name: /KJV/ })).toBeInTheDocument();
    expect(document.querySelector('main')).toHaveClass('grid-rows-2');
    expect(bible.getBibleChapter).toHaveBeenCalledTimes(scriptureCalls);
    expect(commentary.getChapterCommentaries).toHaveBeenCalledTimes(commentaryCalls);
    // Notes remains the selected desktop tab; public commentary is still available.
    fireEvent.click(desktop.getByRole('button', { name: /Commentary/i }));
    expect(desktop.getAllByText('Public commentary stays').length).toBeGreaterThan(0);
}, 15000);

test('late rendered save cannot clear B selection or change B journal/feedback', async () => {
    const desktop = await mount();
    fireEvent.click(desktop.getByRole('button', { name: 'Notes', exact: true }));
    fireEvent.change(desktop.getByPlaceholderText(/Write what you notice/), { target: { value: 'A submitted draft' } });
    const save = deferred();
    notes.createNote.mockReturnValue(save.promise);
    fireEvent.click(desktop.getByRole('button', { name: /Save/i }));
    await switchAccount();
    fireEvent.click(desktop.getByText('Public Scripture stays'));
    fireEvent.change(desktop.getByPlaceholderText(/Write what you notice/), { target: { value: 'B draft' } });
    await act(async () => { save.resolve({ ...record, content: 'A late saved note' }); await save.promise; });
    expect(desktop.getByPlaceholderText(/Write what you notice/)).toHaveValue('B draft');
    expect(desktop.queryByText('A late saved note')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Choose highlight color').length).toBeGreaterThan(0);
});

test('late highlight save cannot report success or clear B selection/palette', async () => {
    const desktop = await mount();
    fireEvent.click(screen.getAllByLabelText('Choose highlight color')[0]);
    fireEvent.change(screen.getByLabelText('Choose a custom highlight color'), { target: { value: '#123456' } });
    const save = deferred();
    highlights.saveHighlights.mockReturnValue(save.promise);
    fireEvent.click(screen.getByLabelText('Highlight yellow'));
    expect(highlights.saveHighlights).toHaveBeenCalledTimes(1);
    await switchAccount();
    expect(screen.queryByLabelText('Choose a custom highlight color')).not.toBeInTheDocument();
    fireEvent.click(desktop.getByText('Public Scripture stays'));
    fireEvent.click(screen.getAllByLabelText('Choose highlight color')[0]);
    expect(screen.getByLabelText('Choose a custom highlight color')).toHaveValue('#ffd54f');
    await act(async () => {
        save.resolve([{ id: 1, book_id: 1, chapter: 1, verse: 1, color: '#FFD54F' }]);
        await save.promise;
    });
    expect(screen.getByLabelText('Choose a custom highlight color')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Choose highlight color').length).toBeGreaterThan(0);
    expect(desktop.getByText('Public Scripture stays')).not.toHaveStyle({ backgroundColor: '#FFD54F40' });
});

test('mobile tab remains selected while its private journal is reset', async () => {
    await mount();
    const mobileNav = within(document.querySelector('nav.fixed.bottom-0'));
    const notesTab = mobileNav.getByRole('button', { name: 'Notes' });
    fireEvent.click(notesTab);
    expect(screen.getAllByText('A private note')).toHaveLength(1);
    await switchAccount();
    expect(notesTab).toHaveClass('text-[var(--color-brand)]');
    expect(screen.queryByText('A private note')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Write what you notice/)).toHaveValue('');
});

test.each([false, true])('renewal preserves the actual StudyPage draft (temporary failure=%s)', async fails => {
    const token = exp => `header.${btoa(JSON.stringify({ sid: 'same-session', exp }))}.signature`;
    const original = token(9999999999), renewed = token(9999999998);
    authService.refreshSession.mockResolvedValueOnce({ token: original });
    if (fails) authService.refreshSession.mockRejectedValue(new TypeError('Network unavailable'));
    else authService.refreshSession.mockResolvedValue({ token: renewed });
    const desktop = await mount();
    fireEvent.click(desktop.getByRole('button', { name: 'Notes', exact: true }));
    fireEvent.change(desktop.getByPlaceholderText(/Write what you notice/), { target: { value: 'Keep this private draft' } });
    const version = auth.sessionVersion;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(desktop.getByPlaceholderText(/Write what you notice/)).toHaveValue('Keep this private draft');
    expect(auth.token).toBe(fails ? original : renewed);
    expect(auth.sessionVersion).toBe(version);
    expect(authService.logoutSession).not.toHaveBeenCalled();
});

test('the reader writes its position to the URL so a refresh restores it', async () => {
    // The translations mock needs a third row: the reader defaults to
    // data[2] when the URL carries no translation, and the shared mock
    // only returns one.
    bible.getTranslations.mockResolvedValue([
        { abbreviation: 'BSB', name: 'Berean Standard Bible' },
        { abbreviation: 'WEB', name: 'World English Bible' },
        { abbreviation: 'KJV', name: 'King James Version' },
    ]);
    const desktop = await mount(false, '/bible/Genesis/1');
    expect(desktop.getByText('Public Scripture stays')).toBeInTheDocument();

    // Once the chapter and translations load, the URL must carry the
    // position the reader is actually at — translation and commentary —
    // so refreshing this page restores it instead of the defaults.
    await waitFor(() => {
        expect(new URLSearchParams(location.search).get('translation')).toBe('KJV');
        expect(new URLSearchParams(location.search).get('commentary')).toBe('3');
    });
    expect(location.pathname).toBe('/bible/Genesis/1');
    expect(desktop.getByText('Public Scripture stays')).toBeInTheDocument();
});

// The multi-verse selection tests below need a chapter with more than
// the shared mock's single verse.
const threeVerseChapter = [
    { verse_number: 1, text: 'First verse text' },
    { verse_number: 2, text: 'Second verse text' },
    { verse_number: 3, text: 'Third verse text' },
];

test('clicking verses one after another accumulates the selection and the URL carries both', async () => {
    bible.getBibleChapter.mockResolvedValue(threeVerseChapter);
    const desktop = await mount(false, '/bible/Genesis/1?translation=KJV');
    expect(desktop.getByText('First verse text')).toBeInTheDocument();

    fireEvent.click(desktop.getByText('First verse text'));
    fireEvent.click(desktop.getByText('Third verse text'));

    // Both verses stay selected, and the URL carries the whole list —
    // the regression collapsed this to just the last verse clicked.
    await waitFor(() => {
        expect(new URLSearchParams(location.search).get('verse')).toBe('1,3');
    });
    expect(desktop.getByText('First verse text')).toHaveClass('underline');
    expect(desktop.getByText('Third verse text')).toHaveClass('underline');
    expect(desktop.getByText('Second verse text')).not.toHaveClass('underline');
});

test('a refresh restores a multi-verse selection from the URL', async () => {
    bible.getBibleChapter.mockResolvedValue(threeVerseChapter);
    const desktop = await mount(false, '/bible/Genesis/1?verse=1,3&translation=KJV');
    expect(desktop.getByText('First verse text')).toBeInTheDocument();

    // Both verses come back selected once the URL's list is applied.
    await waitFor(() => {
        expect(desktop.getByText('First verse text')).toHaveClass('underline');
        expect(desktop.getByText('Third verse text')).toHaveClass('underline');
    });
    // And the URL keeps the whole list instead of collapsing to just 3.
    expect(new URLSearchParams(location.search).get('verse')).toBe('1,3');
    expect(desktop.getByText('Second verse text')).not.toHaveClass('underline');
});

test('deselecting one verse keeps the rest selected', async () => {
    bible.getBibleChapter.mockResolvedValue(threeVerseChapter);
    const desktop = await mount(false, '/bible/Genesis/1?verse=1,3&translation=KJV');
    await waitFor(() => {
        expect(desktop.getByText('First verse text')).toHaveClass('underline');
    });

    fireEvent.click(desktop.getByText('First verse text'));

    await waitFor(() => {
        expect(new URLSearchParams(location.search).get('verse')).toBe('3');
    });
    expect(desktop.getByText('First verse text')).not.toHaveClass('underline');
    expect(desktop.getByText('Third verse text')).toHaveClass('underline');
});
