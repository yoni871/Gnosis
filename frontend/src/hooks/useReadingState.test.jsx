import { afterEach, describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import AuthContext from "../context/AuthContext";
import useReadingState from "./useReadingState";

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    };
}

const LOGGED_IN = {
    sessionVersion: 1,
    user: {
        id: 1,
        first_name: "Test",
        last_name: "User",
        email: "test@example.invalid",
    },
    token: "test-token",
    isAuthenticated: true,
    isAuthLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
};

const LOGGED_OUT = {
    sessionVersion: 0,
    user: null,
    token: null,
    isAuthenticated: false,
    isAuthLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
};

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

const POSITION = {
    bookId: 2,
    chapter: 1,
    translation: "ESV",
    commentaryId: 3,
    verse: 5,
};

function wrapper(authValue) {
    return function Wrapper({ children }) {
        return (
            <AuthContext.Provider value={authValue}>
                {children}
            </AuthContext.Provider>
        );
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("useReadingState", () => {
    test("loads the saved position on mount for a logged-in reader", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(SAVED_ROW)));

        const { result } = renderHook(() => useReadingState(null), {
            wrapper: wrapper(LOGGED_IN),
        });

        await waitFor(() => {
            expect(result.current.savedState).toEqual(SAVED_ROW);
        });
    });

    test("saves the current position when the reader moves", async () => {
        const fetchMock = vi.fn(async (url, init) => {
            if (init?.method === "PUT") {
                return jsonResponse(SAVED_ROW);
            }
            return jsonResponse(
                { error: "No saved reading position." },
                404,
            );
        });
        vi.stubGlobal("fetch", fetchMock);

        renderHook(() => useReadingState(POSITION), {
            wrapper: wrapper(LOGGED_IN),
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                "https://api.example.invalid/api/reading-state",
                expect.objectContaining({
                    method: "PUT",
                    body: JSON.stringify({
                        bookId: 2,
                        chapter: 1,
                        translation: "ESV",
                        commentaryId: 3,
                        verse: 5,
                    }),
                }),
            );
        });
    });

    test("does not save before the book and translation are known", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(
            { error: "No saved reading position." },
            404,
        ));
        vi.stubGlobal("fetch", fetchMock);

        renderHook(
            () => useReadingState({
                bookId: null,
                chapter: 1,
                translation: "",
                commentaryId: 3,
                verse: null,
            }),
            { wrapper: wrapper(LOGGED_IN) },
        );

        // Let the load finish; only its GET may have happened.
        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
        expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    });

    test("never touches the API for guests", async () => {
        const fetchMock = vi.fn(() => {
            throw new Error("fetch must not be called for guests");
        });
        vi.stubGlobal("fetch", fetchMock);

        renderHook(() => useReadingState(POSITION), {
            wrapper: wrapper(LOGGED_OUT),
        });

        // The effects run on mount; give them a tick to (not) fire.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
