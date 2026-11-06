import { describe, expect, test, vi, beforeEach } from "vitest";

import {
    getReadingState,
    saveReadingState,
} from "./readingStateService";

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    };
}

beforeEach(() => {
    vi.restoreAllMocks();
});

const SAVED_ROW = {
    user_id: 1,
    book_id: 2,
    chapter_number: 1,
    translation: "ESV",
    commentary_id: 3,
    verse_number: 5,
    updated_at: "2026-11-06T19:00:00.000Z",
    book: "Genesis",
};

describe("getReadingState", () => {
    test("returns the saved position", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(SAVED_ROW));
        vi.stubGlobal("fetch", fetchMock);

        const data = await getReadingState("test-token");

        expect(data).toEqual(SAVED_ROW);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.example.invalid/api/reading-state",
            {
                method: "GET",
                headers: { Authorization: "Bearer test-token" },
            },
        );
    });

    test("a 404 means nothing is saved yet, not an error", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(
            { error: "No saved reading position." },
            404,
        )));

        await expect(getReadingState("test-token")).resolves.toBeNull();
    });

    test("other failures throw the server message", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(
            { error: "Failed to retrieve reading position." },
            500,
        )));

        await expect(getReadingState("test-token")).rejects.toThrow(
            "Failed to retrieve reading position.",
        );
    });
});

describe("saveReadingState", () => {
    test("saves the position with a PUT and returns it", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(SAVED_ROW));
        vi.stubGlobal("fetch", fetchMock);

        const data = await saveReadingState("test-token", {
            bookId: 2,
            chapter: 1,
            translation: "ESV",
            commentaryId: 3,
            verse: 5,
        });

        expect(data).toEqual(SAVED_ROW);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.example.invalid/api/reading-state",
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer test-token",
                },
                body: JSON.stringify({
                    bookId: 2,
                    chapter: 1,
                    translation: "ESV",
                    commentaryId: 3,
                    verse: 5,
                }),
            },
        );
    });

    test("a failure throws the server message", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(
            { error: "The book does not exist." },
            400,
        )));

        await expect(saveReadingState("test-token", {
            bookId: 999,
            chapter: 1,
            translation: "ESV",
            commentaryId: null,
            verse: null,
        })).rejects.toThrow("The book does not exist.");
    });
});
