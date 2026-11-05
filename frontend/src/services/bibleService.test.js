import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
    getBibleChapter,
    getBooks,
    getChapters,
    getTranslations,
} from './bibleService';

function jsonResponse(data, ok = true) {
    return { ok, json: async () => data };
}

describe('bibleService', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    test('getBooks returns the book list on success', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse([{ id: 1, name: 'Genesis' }])
        );

        await expect(getBooks()).resolves.toEqual([
            { id: 1, name: 'Genesis' },
        ]);
        expect(fetch).toHaveBeenCalledWith(
            'https://api.example.invalid/api/books'
        );
    });

    test('getBooks rejects when the request fails', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({ error: 'Failed to retrieve books' }, false)
        );

        await expect(getBooks()).rejects.toThrow('Unable to load books.');
    });

    test('getBooks rejects when the payload is not an array', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({ error: 'Failed to retrieve books' })
        );

        await expect(getBooks()).rejects.toThrow('Unable to load books.');
    });

    test('getTranslations returns the translation list on success', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse([{ abbreviation: 'KJV' }])
        );

        await expect(getTranslations()).resolves.toEqual([
            { abbreviation: 'KJV' },
        ]);
    });

    test('getTranslations rejects when the request fails', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({ error: 'Failed to retrieve translations.' }, false)
        );

        await expect(getTranslations()).rejects.toThrow(
            'Unable to load translations.'
        );
    });

    test('getTranslations rejects when the payload is not an array', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({ error: 'Failed to retrieve translations.' })
        );

        await expect(getTranslations()).rejects.toThrow(
            'Unable to load translations.'
        );
    });

    test('getChapters returns the chapter list on success', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse([{ chapter: 1 }, { chapter: 2 }])
        );

        await expect(getChapters(1)).resolves.toEqual([
            { chapter: 1 },
            { chapter: 2 },
        ]);
        expect(fetch).toHaveBeenCalledWith(
            'https://api.example.invalid/api/books/1/chapters'
        );
    });

    test('getChapters rejects when the request fails', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({ error: 'Failed to retrieve chapters.' }, false)
        );

        await expect(getChapters(1)).rejects.toThrow(
            'Unable to load chapters.'
        );
    });

    test('getBibleChapter returns verses on success and rejects on failure', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse([{ verse_number: 1, text: 'In the beginning' }])
        );

        await expect(getBibleChapter('Genesis', 1, 'KJV')).resolves.toEqual([
            { verse_number: 1, text: 'In the beginning' },
        ]);

        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({ error: 'Failed to retrieve chapter.' }, false)
        );

        await expect(getBibleChapter('Genesis', 1, 'KJV')).rejects.toThrow(
            'Unable to load Scripture.'
        );
    });
});
