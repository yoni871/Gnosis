import { describe, expect, test, vi, beforeEach } from "vitest";

import {
    getBibleChapter,
    getBooks,
    getChapters,
    getTranslations,
    clearChapterCacheForTests,
} from "./bibleService";

const GENESIS_1 = [
    { verse_number: 1, text: "In the beginning God created the heavens and the earth." },
];

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    };
}

beforeEach(() => {
    clearChapterCacheForTests();
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
});

describe('bibleService', () => {
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
            jsonResponse({ error: 'Failed to retrieve books' }, 500)
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
            jsonResponse({ error: 'Failed to retrieve translations.' }, 500)
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
            jsonResponse({ error: 'Failed to retrieve chapters.' }, 500)
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
            jsonResponse({ error: 'Failed to retrieve chapter.' }, 500)
        );

        // A different chapter: Genesis 1 KJV is cached by the success
        // above, so the failure must use a fresh cache key.
        await expect(getBibleChapter('Genesis', 2, 'KJV')).rejects.toThrow(
            'Unable to load Scripture.'
        );
    });
});

describe("getBibleChapter in-memory cache", () => {
    test("a second read of the same chapter does not fetch again", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(GENESIS_1));
        vi.stubGlobal("fetch", fetchMock);
        const first = await getBibleChapter("Genesis", 1, "BSB");
        const second = await getBibleChapter("Genesis", 1, "BSB");
        assertSame(first, second);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        function assertSame(a, b) {
            expect(b).toBe(a);
        }
    });

    test("a different translation is a different cache entry", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(GENESIS_1));
        vi.stubGlobal("fetch", fetchMock);
        await getBibleChapter("Genesis", 1, "BSB");
        await getBibleChapter("Genesis", 1, "ESV");
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test("the cache holds 20 chapters and drops the oldest", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(GENESIS_1));
        vi.stubGlobal("fetch", fetchMock);
        for (let chapter = 1; chapter <= 21; chapter += 1) {
            await getBibleChapter("Psalms", chapter, "BSB");
        }
        expect(fetchMock).toHaveBeenCalledTimes(21);
        // Psalms 1 was evicted, so it fetches again — and re-inserting it
        // evicts Psalms 2, the next oldest.
        await getBibleChapter("Psalms", 1, "BSB");
        expect(fetchMock).toHaveBeenCalledTimes(22);
        await getBibleChapter("Psalms", 2, "BSB");
        expect(fetchMock).toHaveBeenCalledTimes(23);
        // The most recent chapter is still cached.
        await getBibleChapter("Psalms", 21, "BSB");
        expect(fetchMock).toHaveBeenCalledTimes(23);
    });

    test("a failed chapter is not cached", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
            .mockResolvedValueOnce(jsonResponse(GENESIS_1));
        vi.stubGlobal("fetch", fetchMock);
        await expect(getBibleChapter("Genesis", 1, "BSB")).rejects.toThrow("Unable to load Scripture.");
        const data = await getBibleChapter("Genesis", 1, "BSB");
        expect(data).toEqual(GENESIS_1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

describe("getBibleChapter error shape", () => {
    test("a licensed-unavailable response throws with its status and code", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                jsonResponse(
                    { error: "This translation is temporarily unavailable.", code: "LICENSED_UNAVAILABLE" },
                    503
                )
            )
        );
        let caught = null;
        try {
            await getBibleChapter("Genesis", 1, "ESV");
        } catch (error) {
            caught = error;
        }
        expect(caught).not.toBeNull();
        expect(caught.status).toBe(503);
        expect(caught.code).toBe("LICENSED_UNAVAILABLE");
    });
});
