// Panel tests. The service layer is mocked (the real generated content is
// production-mode: the in-review Creation event is not generated), so these
// tests exercise the panel itself — focus/Escape/return, the sheet, the
// tabs, the timeline, and the development-content badge — against fixture
// data shaped exactly like the real Creation record.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthContext from "../../context/AuthContext";
import { ThemeProvider } from "../../context/ThemeContext";
import BiblicalHistoryBookRedirect from "../../pages/BiblicalHistoryBookRedirect";
import BiblicalHistoryEventPage from "../../pages/BiblicalHistoryEventPage";
import BiblicalHistoryIndexPage from "../../pages/BiblicalHistoryIndexPage";
import HistoryEventPanel from "./HistoryEventPanel";
import { loadEventSections } from "../../services/historyService";

// The companion fetches the passage with the reader's chapter loader;
// the fixture verses cover the mocked range (Genesis 1:1–2:3).
vi.mock("../../services/bibleService", () => ({
    getBibleChapter: vi.fn(async (book, chapter) =>
        chapter === 1
            ? [{ verse_number: 1, text: "In the beginning God created the heavens and the earth." }]
            : [{ verse_number: 1, text: "Thus the heavens and the earth were finished." }],
    ),
}));

const FIXTURE_EVENT = {
    id: "event-creation",
    title: "Creation",
    category: "event",
    status: "draft",
    primaryScripture: { book: "Genesis", bookId: "genesis", startChapter: 1, startVerse: 1, endChapter: 2, endVerse: 3 },
    date: { type: "unknown", label: "No established date", yearStart: null, yearEnd: null, note: "No date." },
    locations: [],
    topics: [],
    relatedEvents: [],
    connections: [
        {
            book: "Genesis", bookId: "genesis", startChapter: 1, startVerse: 1, endChapter: 2, endVerse: 3,
            type: "direct-account", confidence: "traditional",
            note: "The primary account.",
        },
    ],
    sources: ["source-bdb-lexicon"],
    bookNote: "The opening of the biblical story.",
};

const FIXTURE_SECTIONS = {
    overview: { markdown: "Overview prose here.", footnotes: [] },
    ancientWorld: { markdown: "", footnotes: [] },
    ancientWorldSubsections: [
        { heading: "Creation in the ancient Near East", markdown: "Subsection prose.", footnotes: [] },
    ],
    whyItMatters: { markdown: "Why it matters prose.", footnotes: [] },
};

vi.mock("../../services/historyService", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getBookTitle: (bookId) => (bookId === "genesis" ? "Genesis" : bookId),
        getBook: (bookId) => (bookId === "genesis"
            ? {
                id: "genesis",
                title: "Genesis",
                testament: "OT",
                introduction: "Genesis opens the biblical story.",
                events: [{ eventId: "event-creation", narrativeOrder: 1, bookNote: "The opening of the biblical story." }],
            }
            : null),
        listBooks: () => [{ id: "genesis", title: "Genesis", testament: "OT" }],
        getEventBySlug: (slug) => (slug === "creation" ? FIXTURE_EVENT : null),
        listEventsForBook: () => [{ ...FIXTURE_EVENT, narrativeOrder: 1 }],
        getBooksForEvent: () => [
            { id: "genesis", title: "Genesis" },
            { id: "psalms", title: "Psalms" },
        ],
        loadEventSections: vi.fn(async () => FIXTURE_SECTIONS),
    };
});

function renderPanel({ onClose = vi.fn() } = {}) {
    return render(
        <MemoryRouter initialEntries={["/biblical-history/genesis/creation"]}>
            <HistoryEventPanel event={FIXTURE_EVENT} bookId="genesis" onClose={onClose} />
        </MemoryRouter>,
    );
}

describe("HistoryEventPanel", () => {
    it("renders the event with its development-content badge and date honesty", async () => {
        renderPanel();
        expect(screen.getByRole("dialog", { name: "Creation" })).toBeInTheDocument();
        expect(screen.getByText("Development content — not researched editorial content")).toBeInTheDocument();
        // The date label appears twice: the panel header and the timeline node.
        expect(screen.getAllByText("No established date")).toHaveLength(2);
        expect(screen.getByText("The opening of the biblical story.")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText("Overview prose here.")).toBeInTheDocument());
        expect(screen.getByText("Why it matters prose.")).toBeInTheDocument();
    });

    it("renders the in-review badge for researched unpublished content", async () => {
        render(
            <MemoryRouter initialEntries={["/biblical-history/genesis/creation"]}>
                <HistoryEventPanel
                    event={{ ...FIXTURE_EVENT, status: "in-review" }}
                    bookId="genesis"
                    onClose={vi.fn()}
                />
            </MemoryRouter>,
        );
        expect(screen.getByText("In review — unpublished editorial content")).toBeInTheDocument();
        expect(screen.queryByText("Development content — not researched editorial content")).toBeNull();
    });

    it("shows cross-book chips for the other books carrying the event", () => {
        renderPanel();
        expect(screen.getByText("Also in:")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Psalms" })).toHaveAttribute(
            "href", "/biblical-history/psalms/creation",
        );
    });

    it("switches tabs: Connections shows passage buttons that open the companion, Context the subsections", async () => {
        const user = userEvent.setup();
        renderPanel();
        await waitFor(() => expect(screen.getByText("Overview prose here.")).toBeInTheDocument());
        await user.click(screen.getByRole("tab", { name: "Connections" }));
        expect(screen.getByRole("heading", { name: "Primary Passage" })).toBeInTheDocument();
        // The primary passage and the connection share the same range, so
        // the button appears twice — both open the passage in the
        // companion instead of navigating away.
        const rangeButtons = screen.getAllByRole("button", { name: /Read Genesis 1:1–2:3 alongside the study/ });
        expect(rangeButtons).toHaveLength(2);
        await user.click(rangeButtons[1]);
        expect(await screen.findByRole("heading", { name: "Genesis 1:1–2:3" })).toBeInTheDocument();
        expect(screen.getByText("In the beginning God created the heavens and the earth.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open in the reader" })).toHaveAttribute(
            "href", "/bible/Genesis/1?verse=1",
        );
        expect(screen.getByText("The primary account.")).toBeInTheDocument();
        expect(screen.getByText("Traditional")).toBeInTheDocument();
        // Closing the companion keeps the Connections section active.
        await user.click(screen.getByTestId("history-companion-close"));
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Genesis 1:1–2:3" })).toBeNull());
        expect(screen.getByRole("tab", { name: "Connections" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("heading", { name: "Primary Passage" })).toBeInTheDocument();
        await user.click(screen.getByRole("tab", { name: "Context" }));
        expect(screen.getByRole("button", { name: /Creation in the ancient Near East/ })).toBeInTheDocument();
        expect(screen.getByText("Subsection prose.")).toBeInTheDocument();
    });

    it("shows Sources as its own section, not under the other sections", async () => {
        const user = userEvent.setup();
        renderPanel();
        await waitFor(() => expect(screen.getByText("Overview prose here.")).toBeInTheDocument());
        expect(screen.queryByRole("heading", { name: "Sources" })).toBeNull();
        await user.click(screen.getByRole("tab", { name: "Sources" }));
        expect(screen.getByRole("heading", { name: "Sources" })).toBeInTheDocument();
        expect(screen.getByText(/A Hebrew and English Lexicon of the Old Testament/)).toBeInTheDocument();
        await user.click(screen.getByRole("tab", { name: "Story" }));
        expect(screen.queryByRole("heading", { name: "Sources" })).toBeNull();
    });

    it("a footnote link in the prose switches to Sources and lands on the cited source", async () => {
        const user = userEvent.setup();
        vi.mocked(loadEventSections).mockResolvedValueOnce({
            ...FIXTURE_SECTIONS,
            overview: {
                markdown: "Overview prose with a note.[1](#source-source-bdb-lexicon)",
                footnotes: [],
            },
        });
        renderPanel();
        await waitFor(() => expect(screen.getByText(/Overview prose with a note/)).toBeInTheDocument());
        await user.click(screen.getByRole("link", { name: "1" }));
        await waitFor(() =>
            expect(screen.getByRole("tab", { name: "Sources" })).toHaveAttribute("aria-selected", "true"),
        );
        expect(document.getElementById("source-source-bdb-lexicon")).not.toBeNull();
        expect(screen.getByText(/A Hebrew and English Lexicon of the Old Testament/)).toBeInTheDocument();
    });

    it("opens the primary passage from the header Scripture button; Escape closes the companion first", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderPanel({ onClose });
        await waitFor(() => expect(screen.getByText("Overview prose here.")).toBeInTheDocument());
        await user.click(screen.getByTestId("history-scripture-button"));
        expect(await screen.findByRole("heading", { name: "Genesis 1:1–2:3" })).toBeInTheDocument();
        expect(screen.getByTestId("history-scripture-button")).toHaveAttribute("aria-expanded", "true");
        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Genesis 1:1–2:3" })).toBeNull());
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog", { name: "Creation" })).toBeInTheDocument();
        // The Story section is untouched by opening and closing the companion.
        expect(screen.getByRole("tab", { name: "Story" })).toHaveAttribute("aria-selected", "true");
        await user.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalled();
    });

    it("has a bottom-anchored timeline with no previous/next buttons", async () => {
        renderPanel();
        await waitFor(() => expect(screen.getByText("Overview prose here.")).toBeInTheDocument());
        expect(screen.getByRole("navigation", { name: "Events in this book" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
        expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
    });

    it("closes on Escape and returns focus to the opener", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        function Harness() {
            const [open, setOpen] = useState(false);
            return (
                <MemoryRouter initialEntries={["/biblical-history/genesis"]}>
                    <button type="button" onClick={() => setOpen(true)}>Open Creation</button>
                    {open && (
                        <HistoryEventPanel
                            event={FIXTURE_EVENT}
                            bookId="genesis"
                            onClose={() => { onClose(); setOpen(false); }}
                        />
                    )}
                </MemoryRouter>
            );
        }
        render(<Harness />);
        const opener = screen.getByRole("button", { name: "Open Creation" });
        await user.click(opener);
        await waitFor(() => expect(screen.getByRole("dialog", { name: "Creation" })).toBeInTheDocument());
        await user.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(document.activeElement).toBe(opener);
    });

    it("closes from the close button and the sheet handle toggles expansion", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderPanel({ onClose });
        await waitFor(() => expect(screen.getByText("Overview prose here.")).toBeInTheDocument());
        const handle = screen.getByTestId("history-sheet-handle");
        expect(handle).toHaveAttribute("aria-expanded", "false");
        await user.click(handle);
        expect(handle).toHaveAttribute("aria-expanded", "true");
        await user.click(screen.getByTestId("history-panel-close"));
        expect(onClose).toHaveBeenCalled();
    });
});

describe("HistoryEventPanel — close returns focus to the index book entry", () => {
    // The routes mirror App.jsx: the book route is the redirect, the
    // event route is the study page, and the index is the real page —
    // these tests pin the close destination AND the focus return to
    // the book's entry in the index directory.
    function renderBookPage(path) {
        return render(
            <MemoryRouter initialEntries={[path]}>
                <ThemeProvider>
                    <AuthContext.Provider value={{ user: null, isAuthLoading: false, logout: vi.fn() }}>
                        <Routes>
                            <Route path="/biblical-history" element={<BiblicalHistoryIndexPage />} />
                            <Route path="/biblical-history/:book" element={<BiblicalHistoryBookRedirect />} />
                            <Route path="/biblical-history/:book/:event" element={<BiblicalHistoryEventPage />} />
                        </Routes>
                    </AuthContext.Provider>
                </ThemeProvider>
            </MemoryRouter>,
        );
    }

    it("returns to the index after mouse-open + Escape close — focus lands on the Genesis entry", async () => {
        const user = userEvent.setup();
        renderBookPage("/biblical-history/genesis");
        // The book URL redirects to the first event, so the panel is
        // already open; the event link is still in the shell behind it.
        const link = document.getElementById("history-event-link-creation");
        expect(link).not.toBeNull();
        await user.click(link);
        await waitFor(() => expect(screen.getByRole("dialog", { name: "Creation" })).toBeInTheDocument());
        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        // Close lands on the index book directory, not the retired book
        // page — so there is no event link left to return focus to.
        // Focus returns to the Genesis entry in the directory instead.
        expect(screen.getByRole("heading", { level: 1, name: "Discover the History Behind Scripture." })).toBeInTheDocument();
        expect(document.getElementById("history-event-link-creation")).toBeNull();
        const genesisEntry = document.querySelector('[data-history-book="genesis"]');
        expect(genesisEntry).not.toBeNull();
        await waitFor(() => expect(genesisEntry).toHaveFocus());
        expect(document.activeElement).not.toBe(document.body);
    });

    it("returns to the index after keyboard-open + close-button close — focus lands on the Genesis entry", async () => {
        const user = userEvent.setup();
        renderBookPage("/biblical-history/genesis");
        const link = document.getElementById("history-event-link-creation");
        link.focus();
        await user.keyboard("{Enter}");
        await waitFor(() => expect(screen.getByRole("dialog", { name: "Creation" })).toBeInTheDocument());
        await user.click(screen.getByTestId("history-panel-close"));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(screen.getByRole("heading", { level: 1, name: "Discover the History Behind Scripture." })).toBeInTheDocument();
        const genesisEntry = document.querySelector('[data-history-book="genesis"]');
        expect(genesisEntry).not.toBeNull();
        await waitFor(() => expect(genesisEntry).toHaveFocus());
        expect(document.activeElement).not.toBe(document.body);
    });
});

describe("HistoryEventPanel — collapsed sheet state (D1)", () => {
    const originalMatchMedia = window.matchMedia;
    afterEach(() => {
        window.matchMedia = originalMatchMedia;
    });

    it("marks the dialog collapsed on mobile until the sheet expands", async () => {
        window.matchMedia = vi.fn((query) => ({
            matches: query === "(max-width: 768px)",
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
        }));
        const user = userEvent.setup();
        renderPanel();
        const dialog = screen.getByRole("dialog", { name: "Creation" });
        expect(dialog).toHaveClass("history-panel-dialog--collapsed");
        expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "horizontal");
        await user.click(screen.getByTestId("history-sheet-handle"));
        expect(dialog).not.toHaveClass("history-panel-dialog--collapsed");
    });
});
