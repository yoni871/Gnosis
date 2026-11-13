// Trinity workspace tests: passage switching, timeline selection
// (click + keyboard), empty states, demonstration labeling, prev/next
// ends, translation switching, and the 40/60 layout structure.
//
// Scripture text here is synthetic ("Genesis 1 verse 26.") — the
// tests assert trimming, loading, and state, never real KJV wording.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import TraceTheDoctrineTrinityPage from "./TraceTheDoctrineTrinityPage";

const { getBibleChapter, getTranslations } = vi.hoisted(() => ({
    getBibleChapter: vi.fn(),
    getTranslations: vi.fn(),
}));

vi.mock("../services/bibleService", () => ({ getBibleChapter, getTranslations }));

const TRANSLATIONS = [
    { abbreviation: "KJV", name: "King James Version" },
    { abbreviation: "ESV", name: "English Standard Version" },
];

function chapterVerses(book, chapter, count) {
    return Array.from({ length: count }, (_, index) => ({
        verse_number: index + 1,
        text: `${book} ${chapter} verse ${index + 1}.`,
    }));
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/trace-the-doctrine/trinity"]}>
            <ThemeProvider>
                <AuthContext.Provider value={{ user: null, isAuthLoading: false, logout: vi.fn() }}>
                    <TraceTheDoctrineTrinityPage />
                </AuthContext.Provider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    getTranslations.mockResolvedValue(TRANSLATIONS);
    getBibleChapter.mockImplementation(async (book) => {
        if (book === "Genesis") return chapterVerses("Genesis", 1, 27);
        if (book === "John") return chapterVerses("John", 1, 5);
        if (book === "Matthew") return chapterVerses("Matthew", 28, 20);
        if (book === "2 Corinthians") return chapterVerses("2 Corinthians", 13, 14);
        return [];
    });
});

describe("TraceTheDoctrineTrinityPage", () => {
    it("renders the centered heading, noindex metadata, and the Genesis 1:26 starting state", async () => {
        renderPage();
        expect(document.title).toBe("The Trinity — Trace the Doctrine | Gnosis");
        expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
        expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
            "href",
            "https://studygnosis.com/trace-the-doctrine/trinity",
        );
        expect(screen.getByText("Gnosis · Trace the Doctrine")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "The Trinity" })).toBeInTheDocument();
        expect(screen.getByText("From Scripture through Christian history")).toBeInTheDocument();

        expect(screen.getByText("1 OF 4")).toBeInTheDocument();
        expect(await screen.findByText("Genesis 1 verse 26.")).toBeInTheDocument();
        // Only the cited verse is shown — the rest of the chapter is not.
        expect(screen.queryByText("Genesis 1 verse 25.")).toBeNull();
        expect(screen.queryByText("Genesis 1 verse 27.")).toBeNull();
        expect(getBibleChapter).toHaveBeenCalledWith("Genesis", 1, "KJV");
        expect(screen.getByRole("link", { name: "Open in the reader" })).toHaveAttribute(
            "href",
            "/bible/Genesis/1?verse=26",
        );
        expect(screen.getByText("King James Version")).toBeInTheDocument();
    });

    it("labels the demonstration data at workspace, panel, and timeline level, with pending placeholders", async () => {
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");
        // Workspace-level notice plus the panel and timeline notices.
        expect(screen.getAllByText(/Demonstration data — the theologian entries are placeholders pending research/).length).toBeGreaterThanOrEqual(3);
        expect(screen.getAllByText("Demonstration data").length).toBeGreaterThanOrEqual(3);
        expect(screen.getByText("Prototype")).toBeInTheDocument();
        // The first interpretation is auto-selected.
        expect(screen.getByRole("heading", { name: "Justin Martyr" })).toBeInTheDocument();
        expect(screen.getByText(/Quotation pending verification/)).toBeInTheDocument();
        expect(screen.getByText("Title pending verification")).toBeInTheDocument();
        expect(screen.getAllByText("Date pending verification").length).toBeGreaterThanOrEqual(2);
        // No invented content: no quotation, title, or year is asserted.
        expect(document.querySelector(".doctrine-workspace")).not.toHaveTextContent(/AD \d|c\. \d{3,4}/);
    });

    it("steps through the four passages with prev/next, never wrapping, and resets the timeline selection", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");

        const previous = screen.getByRole("button", { name: /Previous passage/ });
        const next = screen.getByRole("button", { name: /Next passage/ });
        expect(previous).toBeDisabled();
        expect(next).toBeEnabled();

        // Select a later theologian, then leave the passage: coming back
        // re-selects the first interpretation for Genesis 1:26.
        await user.click(screen.getByRole("button", { name: /Augustine/ }));
        expect(screen.getByRole("heading", { name: "Augustine" })).toBeInTheDocument();

        await user.click(next);
        expect(screen.getByText("2 OF 4")).toBeInTheDocument();
        expect(await screen.findByText("John 1 verse 1.")).toBeInTheDocument();
        expect(screen.getByText("John 1 verse 3.")).toBeInTheDocument();
        expect(screen.queryByText("John 1 verse 4.")).toBeNull();
        expect(getBibleChapter).toHaveBeenCalledWith("John", 1, "KJV");

        await user.click(screen.getByRole("button", { name: /Next passage/ }));
        expect(screen.getByText("3 OF 4")).toBeInTheDocument();
        expect(await screen.findByText("Matthew 28 verse 19.")).toBeInTheDocument();
        expect(screen.queryByText("Matthew 28 verse 20.")).toBeNull();

        await user.click(screen.getByRole("button", { name: /Next passage/ }));
        expect(screen.getByText("4 OF 4")).toBeInTheDocument();
        expect(await screen.findByText("2 Corinthians 13 verse 14.")).toBeInTheDocument();
        expect(screen.queryByText("2 Corinthians 13 verse 13.")).toBeNull();
        // The end is an honest end: Next is disabled and stays put.
        expect(screen.getByRole("button", { name: /Next passage/ })).toBeDisabled();
        await user.click(screen.getByRole("button", { name: /Next passage/ }));
        expect(screen.getByText("4 OF 4")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: /Previous passage/ }));
        await user.click(screen.getByRole("button", { name: /Previous passage/ }));
        await user.click(screen.getByRole("button", { name: /Previous passage/ }));
        expect(screen.getByText("1 OF 4")).toBeInTheDocument();
        expect(await screen.findByText("Genesis 1 verse 26.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Previous passage/ })).toBeDisabled();
        // Back on Genesis 1:26 the first interpretation is selected again.
        expect(screen.getByRole("heading", { name: "Justin Martyr" })).toBeInTheDocument();
    });

    it("shows honest empty states for passages with no entries, in panel and timeline", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");
        await user.click(screen.getByRole("button", { name: /Next passage/ }));
        await screen.findByText("John 1 verse 1.");

        expect(screen.getByText("No historical interpretations have been added for John 1:1–3 yet.")).toBeInTheDocument();
        expect(screen.getByText(/The timeline will list interpreters here once research verifies them/)).toBeInTheDocument();
        // No theologian is implied for this passage: no timeline buttons.
        const timeline = document.querySelector(".doctrine-timeline");
        expect(within(timeline).queryAllByRole("button")).toHaveLength(0);
        expect(screen.queryByRole("heading", { name: "Justin Martyr" })).toBeNull();
    });

    it("selects interpretations from the timeline without changing Scripture", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");

        const timeline = document.querySelector(".doctrine-timeline");
        const buttons = within(timeline).getAllByRole("button");
        expect(buttons).toHaveLength(5);
        expect(buttons[0]).toHaveAttribute("aria-current", "true");
        expect(buttons[1]).not.toHaveAttribute("aria-current");
        // Exactly one tab stop (roving tabindex).
        expect(buttons[0]).toHaveAttribute("tabindex", "0");
        expect(buttons[1]).toHaveAttribute("tabindex", "-1");

        await user.click(screen.getByRole("button", { name: /Tertullian/ }));
        expect(screen.getByRole("heading", { name: "Tertullian" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Tertullian/ })).toHaveAttribute("aria-current", "true");
        expect(screen.getByRole("button", { name: /Justin Martyr/ })).not.toHaveAttribute("aria-current");
        // Scripture did not move.
        expect(screen.getByText("Genesis 1 verse 26.")).toBeInTheDocument();
        expect(screen.getByText("1 OF 4")).toBeInTheDocument();
        expect(getBibleChapter).toHaveBeenCalledTimes(1);
    });

    it("moves the timeline selection with Left/Right arrows and Home/End", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");

        const justin = screen.getByRole("button", { name: /Justin Martyr/ });
        justin.focus();
        await user.keyboard("{ArrowRight}");
        expect(screen.getByRole("heading", { name: "Irenaeus" })).toBeInTheDocument();
        await user.keyboard("{ArrowRight}");
        expect(screen.getByRole("heading", { name: "Tertullian" })).toBeInTheDocument();
        await user.keyboard("{ArrowLeft}");
        expect(screen.getByRole("heading", { name: "Irenaeus" })).toBeInTheDocument();
        await user.keyboard("{End}");
        expect(screen.getByRole("heading", { name: "Augustine" })).toBeInTheDocument();
        await user.keyboard("{Home}");
        expect(screen.getByRole("heading", { name: "Justin Martyr" })).toBeInTheDocument();
        expect(screen.getByText(/Use the Left and Right arrow keys/)).toBeInTheDocument();
    });

    it("expands the explanation and source details as pending-verification placeholders", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");

        const explanation = screen.getByRole("button", { name: "Show explanation" });
        expect(explanation).toHaveAttribute("aria-expanded", "false");
        await user.click(explanation);
        expect(screen.getByText(/Explanation pending verification/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Source details" }));
        const details = document.getElementById("doctrine-source-details-body");
        expect(details).toHaveTextContent("Justin Martyr");
        expect(details).toHaveTextContent("Title pending verification — pending verification");
        expect(details).toHaveTextContent("Date pending verification — pending verification");
        expect(details).toHaveTextContent("Demonstration data — pending verification");
    });

    it("re-fetches the passage when the translation changes and shows the new translation's name", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");
        expect(getTranslations).toHaveBeenCalled();

        await user.selectOptions(screen.getByLabelText("Translation"), "ESV");
        expect(getBibleChapter).toHaveBeenCalledWith("Genesis", 1, "ESV");
        expect(await screen.findByText("Genesis 1 verse 26.")).toBeInTheDocument();
        expect(screen.getByText("English Standard Version")).toBeInTheDocument();
    });

    it("shows an error with a retry that reloads the passage", async () => {
        const user = userEvent.setup();
        getBibleChapter
            .mockRejectedValueOnce(new Error("Unable to load Scripture."))
            .mockImplementation(async (book, chapter) => chapterVerses(book, chapter, 27));
        renderPage();
        expect(await screen.findByRole("alert")).toHaveTextContent("The passage could not be loaded.");
        await user.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Genesis 1 verse 26.")).toBeInTheDocument();
    });

    it("lays out Scripture and interpretation as one 40/60 surface with the timeline full-width beneath", async () => {
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");

        const workspace = document.querySelector(".doctrine-workspace");
        const grid = document.querySelector(".doctrine-workspace-grid");
        expect(workspace).toContainElement(grid);
        expect(grid.children).toHaveLength(2);
        expect(grid.children[0]).toHaveClass("doctrine-workspace-scripture");
        expect(grid.children[1]).toHaveClass("doctrine-workspace-interpretation");

        // The timeline is a sibling after the grid — never inside the
        // right column — so it spans both columns.
        const timeline = document.querySelector(".doctrine-timeline");
        expect(timeline.parentElement).toBe(workspace);
        expect(timeline.previousElementSibling).toBe(grid);
        expect(timeline.closest(".doctrine-workspace-interpretation")).toBeNull();

        // Each timeline node keeps its marker, name, and date in one button.
        for (const button of within(timeline).getAllByRole("button")) {
            expect(button.querySelector(".doctrine-timeline-node-dot")).not.toBeNull();
            expect(button.querySelector(".doctrine-timeline-node-name")).not.toBeNull();
            expect(button.querySelector(".doctrine-timeline-node-date")).not.toBeNull();
        }
    });

    it("declares the 40/60 split, the thin divider, and no card styling in the workspace stylesheet", () => {
        const css = readFileSync(join(import.meta.dirname, "TraceTheDoctrineTrinityPage.css"), "utf8");
        const ruleBlock = (selector) => {
            const start = css.indexOf(selector);
            expect(start).toBeGreaterThanOrEqual(0);
            const open = css.indexOf("{", start);
            const close = css.indexOf("}", open);
            return css.slice(open + 1, close);
        };
        expect(ruleBlock(".doctrine-workspace-grid")).toContain("grid-template-columns: 40% 60%");
        expect(ruleBlock(".doctrine-workspace-interpretation")).toContain("border-left: 1px solid");
        // The columns are regions of one parchment surface, not cards.
        for (const selector of [".doctrine-workspace-scripture", ".doctrine-workspace-interpretation"]) {
            const block = ruleBlock(selector);
            expect(block).not.toContain("box-shadow");
            expect(block).not.toContain("border-radius");
        }
        // Mobile: the timeline strip scrolls horizontally with snap.
        expect(css).toContain("overflow-x: auto");
        expect(css).toContain("scroll-snap-type: x mandatory");
        expect(css).toContain("prefers-reduced-motion");
    });
});
