// Companion tests: the passage is fetched with the reader's own
// chapter loader, trimmed to the connection's exact verse range, and
// the companion never navigates — the reader stays one link away.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import HistoryScriptureCompanion from "./HistoryScriptureCompanion";

const PASSAGE = {
    book: "Genesis",
    bookId: "genesis",
    startChapter: 1,
    startVerse: 1,
    endChapter: 2,
    endVerse: 3,
};

const CHAPTER_1 = [
    { verse_number: 1, text: "Chapter one verse one." },
    { verse_number: 2, text: "Chapter one verse two." },
    { verse_number: 3, text: "Chapter one verse three." },
    { verse_number: 4, text: "Chapter one verse four." },
];
const CHAPTER_2 = [
    { verse_number: 1, text: "Chapter two verse one." },
    { verse_number: 2, text: "Chapter two verse two." },
    { verse_number: 3, text: "Chapter two verse three." },
    { verse_number: 4, text: "Chapter two verse four." },
];

const { getBibleChapter } = vi.hoisted(() => ({ getBibleChapter: vi.fn() }));

vi.mock("../../services/bibleService", () => ({ getBibleChapter }));

function renderCompanion({ passage = PASSAGE, onClose = vi.fn() } = {}) {
    return {
        onClose,
        ...render(
            <MemoryRouter>
                <HistoryScriptureCompanion passage={passage} onClose={onClose} />
            </MemoryRouter>,
        ),
    };
}

describe("HistoryScriptureCompanion", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("fetches both chapters in KJV and shows only the cited verses", async () => {
        getBibleChapter.mockImplementation(async (book, chapter) =>
            chapter === 1 ? CHAPTER_1 : CHAPTER_2,
        );
        renderCompanion();
        expect(screen.getByText("Loading passage…")).toBeInTheDocument();
        expect(await screen.findByText("Chapter one verse one.")).toBeInTheDocument();
        expect(screen.getByText("Chapter one verse three.")).toBeInTheDocument();
        // A multi-chapter range runs to the end of the start chapter:
        // chapter 1 verse 4 is in range, chapter 2 verse 4 is not.
        expect(screen.getByText("Chapter one verse four.")).toBeInTheDocument();
        expect(screen.getByText("Chapter two verse one.")).toBeInTheDocument();
        expect(screen.getByText("Chapter two verse three.")).toBeInTheDocument();
        expect(screen.queryByText("Chapter two verse four.")).toBeNull();
        expect(getBibleChapter).toHaveBeenCalledWith("Genesis", 1, "KJV");
        expect(getBibleChapter).toHaveBeenCalledWith("Genesis", 2, "KJV");
        expect(screen.getByRole("heading", { name: "Genesis 1:1–2:3" })).toBeInTheDocument();
        expect(screen.getByText("King James Version")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open in the reader" })).toHaveAttribute(
            "href", "/bible/Genesis/1?verse=1",
        );
    });

    it("shows an error with a retry that reloads the passage", async () => {
        const user = userEvent.setup();
        getBibleChapter
            .mockRejectedValueOnce(new Error("Unable to load Scripture."))
            .mockImplementation(async (book, chapter) => (chapter === 1 ? CHAPTER_1 : CHAPTER_2));
        renderCompanion();
        expect(await screen.findByRole("alert")).toHaveTextContent("The passage could not be loaded.");
        await user.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Chapter one verse one.")).toBeInTheDocument();
    });

    it("closes from its close button", async () => {
        const user = userEvent.setup();
        getBibleChapter.mockImplementation(async () => CHAPTER_1);
        const { onClose } = renderCompanion();
        await user.click(screen.getByTestId("history-companion-close"));
        expect(onClose).toHaveBeenCalled();
    });
});
