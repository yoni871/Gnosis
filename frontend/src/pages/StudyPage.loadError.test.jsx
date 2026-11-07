import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import StudyPage from './StudyPage';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import * as authService from '../services/authService';
import * as bible from '../services/bibleService';
import * as commentary from '../services/commentaryService';
import * as notes from '../services/notesService';
import * as bookmarks from '../services/bookmarksService';
import * as highlights from '../services/highlightsService';

vi.mock('../services/authService', () => ({ getProfile: vi.fn(), loginUser: vi.fn(), registerUser: vi.fn() }));
vi.mock('../services/bibleService', () => ({ getBooks: vi.fn(), getTranslations: vi.fn(), getBibleChapter: vi.fn(), getChapters: vi.fn() }));
vi.mock('../services/commentaryService', () => ({ getCommentaries: vi.fn(), getChapterCommentaries: vi.fn() }));
vi.mock('../services/notesService', () => ({ getNotes: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }));
vi.mock('../services/bookmarksService', () => ({ getBookmarks: vi.fn(), createBookmark: vi.fn(), deleteBookmark: vi.fn() }));
vi.mock('../services/highlightsService', () => ({ getHighlights: vi.fn(), saveHighlights: vi.fn(), clearHighlights: vi.fn() }));

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
    localStorage.setItem('gnosisToken', 'synthetic-A');
    authService.getProfile.mockResolvedValue({ id: 1, first_name: 'Synthetic', last_name: 'A', email: 'a@example.invalid' });
    bible.getBooks.mockResolvedValue([{ id: 1, name: 'Genesis', chapters: 50 }]);
    bible.getTranslations.mockResolvedValue([{ abbreviation: 'KJV', name: 'Synthetic public translation' }]);
    bible.getBibleChapter.mockResolvedValue([{ verse_number: 1, text: 'Public Scripture stays' }]);
    bible.getChapters.mockResolvedValue([{ chapter: 1 }]);
    commentary.getCommentaries.mockResolvedValue([{ id: 3, name: 'Public commentator' }]);
    commentary.getChapterCommentaries.mockResolvedValue([{ id: 1, entry_title: 'Public commentary stays', content: 'Public commentary text', start_chapter: 1, end_chapter: 1, start_verse: 1, end_verse: 1 }]);
    notes.getNotes.mockResolvedValue([]);
    bookmarks.getBookmarks.mockResolvedValue([]);
    highlights.getHighlights.mockResolvedValue([]);
});

async function mount() {
    render(<ThemeProvider><AuthProvider><MemoryRouter initialEntries={['/bible/Genesis/1?translation=KJV']}><Routes><Route path="/bible/:book/:chapter" element={<StudyPage />} /></Routes></MemoryRouter></AuthProvider></ThemeProvider>);
    await act(async () => {});
    return within(document.querySelector('main'));
}

test('a failed book load shows a friendly error with a retry instead of crashing', async () => {
    bible.getBooks.mockRejectedValue(new Error('Unable to load books.'));

    const page = await mount();

    expect(
        page.getByText('We couldn’t load the Bible text.')
    ).toBeInTheDocument();
    expect(
        page.getByText(/The study service is unavailable right now/)
    ).toBeInTheDocument();
    expect(
        page.queryByText('Public Scripture stays')
    ).not.toBeInTheDocument();

    // Retry with a healthy catalog recovers the reader.
    bible.getBooks.mockResolvedValue([{ id: 1, name: 'Genesis', chapters: 50 }]);
    fireEvent.click(page.getByRole('button', { name: 'Try again' }));
    await act(async () => {});

    expect(
        screen.queryByText('We couldn’t load the Bible text.')
    ).not.toBeInTheDocument();
    // The retry replaces the error panel with the study layout, so
    // re-scope to the new main element instead of the detached one.
    const recovered = within(document.querySelector('main'));
    expect(recovered.getByText('Public Scripture stays')).toBeInTheDocument();
}, 15000);

test('a failed translation load shows the same error state', async () => {
    bible.getTranslations.mockRejectedValue(new Error('Unable to load translations.'));

    const page = await mount();

    expect(
        page.getByText('We couldn’t load the Bible text.')
    ).toBeInTheDocument();
    expect(
        page.getByRole('button', { name: 'Try again' })
    ).toBeInTheDocument();
}, 15000);
