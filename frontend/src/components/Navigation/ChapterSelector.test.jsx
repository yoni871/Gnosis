import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";

import ChapterSelector from "./ChapterSelector";

const books = [{ id: 1, name: "Genesis" }];

function chaptersResponse(count) {
    return new Response(
        JSON.stringify(
            Array.from({ length: count }, (_, i) => ({
                chapter_number: i + 1,
            })),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
    );
}

function Location() {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}</output>;
}

function mount(chapter) {
    vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(chaptersResponse(3))),
    );

    render(
        <MemoryRouter initialEntries={[`/bible/Genesis/${chapter}`]}>
            <Location />
            <Routes>
                <Route
                    path="/bible/:book/:chapter"
                    element={
                        <ChapterSelector
                            book="Genesis"
                            books={books}
                            chapter={chapter}
                            setChapter={() => {}}
                            setSelectedVerse={() => {}}
                            isChapterMenuOpen={false}
                            setIsChapterMenuOpen={() => {}}
                            setIsBookMenuOpen={() => {}}
                            setIsVerseMenuOpen={() => {}}
                        />
                    }
                />
            </Routes>
        </MemoryRouter>,
    );
}

describe("ChapterSelector chapter navigation", () => {
    test("previous and next chapters are real links to chapter URLs", async () => {
        mount(2);

        expect(
            screen.getByRole("link", { name: "Previous chapter" }),
        ).toHaveAttribute("href", "/bible/Genesis/1");
        expect(
            await screen.findByRole("link", { name: "Next chapter" }),
        ).toHaveAttribute("href", "/bible/Genesis/3");
    });

    test("following the next link changes the route", async () => {
        mount(2);
        const user = userEvent.setup();

        await user.click(
            await screen.findByRole("link", { name: "Next chapter" }),
        );

        expect(screen.getByTestId("location")).toHaveTextContent(
            "/bible/Genesis/3",
        );
    });

    test("the first chapter has no previous link", () => {
        mount(1);

        expect(
            screen.queryByRole("link", { name: "Previous chapter" }),
        ).toBeNull();
    });

    test("the last chapter has no next link", async () => {
        mount(3);

        expect(
            await screen.findByRole("link", { name: "Previous chapter" }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("link", { name: "Next chapter" }),
        ).toBeNull();
    });
});
