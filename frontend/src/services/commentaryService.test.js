import { describe, expect, test, vi, beforeEach } from "vitest";

import {
    getChapterCommentaries,
    getCommentaries,
    clearCommentaryCacheForTests,
} from "./commentaryService";

const GENESIS_1_MATTHEW_HENRY = [
    { id: 1, entry_title: "Genesis 1", content: "In the beginning..." },
];

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    };
}

beforeEach(() => {
    clearCommentaryCacheForTests();
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
});

describe('commentaryService', () => {
    test('getCommentaries returns the list on success', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse([{ id: 3, name: 'Matthew Henry' }])
        );

        await expect(getCommentaries()).resolves.toEqual([
            { id: 3, name: 'Matthew Henry' },
        ]);
    });

    test('getCommentaries rejects when the request fails', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({ error: 'Failed to retrieve commentaries.' }, 500)
        );

        await expect(getCommentaries()).rejects.toThrow(
            'Unable to load commentaries.'
        );
    });

    test('getCommentaries rejects when the payload is not an array', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({ error: 'Failed to retrieve commentaries.' })
        );

        await expect(getCommentaries()).rejects.toThrow(
            'Unable to load commentaries.'
        );
    });

    test('getChapterCommentaries returns entries on success and rejects on failure', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse([{ id: 1, entry_title: 'Genesis 1' }])
        );

        await expect(getChapterCommentaries(1, 1, 3)).resolves.toEqual([
            { id: 1, entry_title: 'Genesis 1' },
        ]);

        vi.mocked(fetch).mockResolvedValue(
            jsonResponse(
                { error: 'Failed to retrieve chapter commentaries.' },
                500
            )
        );

        // A different chapter: chapter 1 is cached by the success above,
        // so the failure must use a fresh cache key.
        await expect(getChapterCommentaries(1, 2, 3)).rejects.toThrow(
            'Unable to load commentary.'
        );
    });
});

describe("getChapterCommentaries in-memory cache", () => {
    test("a second read of the same chapter and commentator does not fetch again", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(GENESIS_1_MATTHEW_HENRY));
        vi.stubGlobal("fetch", fetchMock);
        const first = await getChapterCommentaries(2, 1, 3);
        const second = await getChapterCommentaries(2, 1, 3);
        expect(second).toBe(first);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("a different commentator is a different cache entry", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(GENESIS_1_MATTHEW_HENRY));
        vi.stubGlobal("fetch", fetchMock);
        await getChapterCommentaries(2, 1, 3);
        await getChapterCommentaries(2, 1, 4);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test("switching commentators and back reuses the cached chapter", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(GENESIS_1_MATTHEW_HENRY));
        vi.stubGlobal("fetch", fetchMock);
        await getChapterCommentaries(2, 1, 3);
        await getChapterCommentaries(2, 1, 4);
        await getChapterCommentaries(2, 1, 3);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test("a failed chapter is not cached", async () => {
        // A failed fetch rejects instead of returning the error body:
        // CommentaryPanel calls .map on the result, so a non-array
        // payload would crash the reader. The failure is not cached,
        // so the next read fetches again.
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
            .mockResolvedValueOnce(jsonResponse(GENESIS_1_MATTHEW_HENRY));
        vi.stubGlobal("fetch", fetchMock);
        await expect(getChapterCommentaries(2, 1, 3)).rejects.toThrow(
            "Unable to load commentary."
        );
        const second = await getChapterCommentaries(2, 1, 3);
        expect(second).toEqual(GENESIS_1_MATTHEW_HENRY);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
