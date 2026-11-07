import { describe, expect, test, vi, beforeEach } from "vitest";

import {
    getChapterCommentaries,
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

    test("a non-array payload is not cached", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
            .mockResolvedValueOnce(jsonResponse(GENESIS_1_MATTHEW_HENRY));
        vi.stubGlobal("fetch", fetchMock);
        const first = await getChapterCommentaries(2, 1, 3);
        expect(first).toEqual({ error: "boom" });
        const second = await getChapterCommentaries(2, 1, 3);
        expect(second).toEqual(GENESIS_1_MATTHEW_HENRY);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
