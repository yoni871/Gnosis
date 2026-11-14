// Study-page tests. The service layer is mocked (the real generated
// content is production-mode: the in-review Creation event is not
// generated), so these tests exercise the study page itself — the
// sections, the tabs, the companion, the timeline, and the
// development-content badge — against fixture data shaped exactly like
// the real Creation record. The page is ordinary page content: no
// dialog, no backdrop, no focus trap, no sheet, no modal close.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthContext from "../../context/AuthContext";
import { ThemeProvider } from "../../context/ThemeContext";
import BiblicalHistoryBookRedirect from "../../pages/BiblicalHistoryBookRedirect";
import BiblicalHistoryEventPage from "../../pages/BiblicalHistoryEventPage";
import BiblicalHistoryIndexPage from "../../pages/BiblicalHistoryIndexPage";
import HistoryEventStudy from "./HistoryEventStudy";
import { loadEventSections } from "../../services/historyService";

// The companion fetches the passage with the reader's chapter loader;
// the fixture verses cover the mocked range (Genesis 1:1–2:3).
vi.mock("../../services/bibleService", () => ({
    getBibleChapter: vi.fn(async (book, chapter) =>
        chapter === 1
            ? [{ verse_number: 1, text: "In the beginning God created the heavens and the earth." }]
            : [{ verse_number: 1, text: "Thus the heavens and the earth were finished." }],
    ),
    getTranslations: vi.fn(async () => [
        { abbreviation: "KJV", name: "King James Version" },
        { abbreviation: "ESV", name: "English Standard Version" },
    ]),
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

function renderStudy({ onBackToBooks = vi.fn() } = {}) {
    return render(
        <MemoryRouter initialEntries={["/biblical-history/genesis/creation"]}>
            <HistoryEventStudy event={FIXTURE_EVENT} bookId="genesis" onBackToBooks={onBackToBooks} />
        </MemoryRouter>,
    );
}

describe("HistoryEventStudy", () => {
    it("renders the event as a page: h1 title, development-content badge, date honesty, no modal chrome", async () => {
        renderStudy();
        expect(screen.getByRole("heading", { level: 1, name: "Creation" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.querySelector(".history-panel-backdrop")).toBeNull();
        expect(screen.queryByTestId("history-sheet-handle")).toBeNull();
        expect(document.body.style.overflow).toBe("");
        expect(screen.getByText("Development content — not researched editorial content")).toBeInTheDocument();
        // The date label appears twice: the study header and the timeline node.
        expect(screen.getAllByText("No established date")).toHaveLength(2);
        await waitFor(() => expect(screen.getByText("Overview prose here.")).toBeInTheDocument());
        // The book note lives in the Story's Key Takeaway, which renders
        // with the sections — not in the study header.
        expect(screen.getByText("The opening of the biblical story.")).toBeInTheDocument();
        expect(screen.getByText("Why it matters prose.")).toBeInTheDocument();
    });

    it("shows the event's book note as the Story's Key Takeaway, and only there", async () => {
        renderStudy();
        await waitFor(() => expect(screen.getByText("Overview prose here.")).toBeInTheDocument());
        expect(screen.getByRole("heading", { name: "The Story" })).toBeInTheDocument();
        expect(screen.getByText("Key Takeaway")).toBeInTheDocument();
        // The book note appears once — in the takeaway, not repeated in
        // the study header.
        expect(screen.getAllByText("The opening of the biblical story.")).toHaveLength(1);
        expect(document.querySelector(".history-takeaway")).toHaveTextContent(
            "The opening of the biblical story.",
        );
    });

    it("renders the in-review badge for researched unpublished content", async () => {
        render(
            <MemoryRouter initialEntries={["/biblical-history/genesis/creation"]}>
                <HistoryEventStudy
                    event={{ ...FIXTURE_EVENT, status: "in-review" }}
                    bookId="genesis"
                    onBackToBooks={vi.fn()}
                />
            </MemoryRouter>,
        );
        expect(screen.getByText("In review — unpublished editorial content")).toBeInTheDocument();
        expect(screen.queryByText("Development content — not researched editorial content")).toBeNull();
    });

    it("shows cross-book chips for the other books carrying the event", () => {
        renderStudy();
        expect(screen.getByText("Also in:")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Psalms" })).toHaveAttribute(
            "href", "/biblical-history/psalms/creation",
        );
    });

    it("switches tabs: Connections shows passage buttons that open the companion, Context the subsections", async () => {
        const user = userEvent.setup();
        renderStudy();
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
        renderStudy();
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
        renderStudy();
        await waitFor(() => expect(screen.getByText(/Overview prose with a note/)).toBeInTheDocument());
        await user.click(screen.getByRole("link", { name: "1" }));
        await waitFor(() =>
            expect(screen.getByRole("tab", { name: "Sources" })).toHaveAttribute("aria-selected", "true"),
        );
        expect(document.getElementById("source-source-bdb-lexicon")).not.toBeNull();
        expect(screen.getByText(/A Hebrew and English Lexicon of the Old Testament/)).toBeInTheDocument();
    });

    it("opens with the primary passage by default; the Scripture button toggles it; Escape closes the companion and nothing else", async () => {
        const user = userEvent.setup();
        const onBackToBooks = vi.fn();
        renderStudy({ onBackToBooks });
        await waitFor(() => expect(screen.getByText("Overview prose here.")).toBeInTheDocument());
        // Default open: the primary passage is already beside the Story,
        // with only the cited verses.
        expect(await screen.findByRole("heading", { name: "Genesis 1:1–2:3" })).toBeInTheDocument();
        expect(screen.getByText("In the beginning God created the heavens and the earth.")).toBeInTheDocument();
        expect(screen.getByTestId("history-scripture-button")).toHaveAttribute("aria-expanded", "true");
        // The button closes it; clicking again reopens it.
        await user.click(screen.getByTestId("history-scripture-button"));
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Genesis 1:1–2:3" })).toBeNull());
        expect(screen.getByTestId("history-scripture-button")).toHaveAttribute("aria-expanded", "false");
        await user.click(screen.getByTestId("history-scripture-button"));
        expect(await screen.findByRole("heading", { name: "Genesis 1:1–2:3" })).toBeInTheDocument();
        // Escape closes the companion (the study stays on the page).
        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Genesis 1:1–2:3" })).toBeNull());
        expect(onBackToBooks).not.toHaveBeenCalled();
        expect(screen.getByRole("heading", { level: 1, name: "Creation" })).toBeInTheDocument();
        // A second Escape with no companion open navigates nowhere and
        // calls nothing: there is no modal to close.
        await user.keyboard("{Escape}");
        expect(onBackToBooks).not.toHaveBeenCalled();
        expect(screen.getByRole("heading", { level: 1, name: "Creation" })).toBeInTheDocument();
        // The Story section is untouched by opening and closing the companion.
        expect(screen.getByRole("tab", { name: "Story" })).toHaveAttribute("aria-selected", "true");
    });

    it("has a bottom-anchored timeline with no previous/next buttons", async () => {
        renderStudy();
        await waitFor(() => expect(screen.getByText("Overview prose here.")).toBeInTheDocument());
        expect(screen.getByRole("navigation", { name: "Events in this book" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
        expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
    });
});

describe("HistoryEventStudy — close returns to the index book entry", () => {
    // The routes mirror App.jsx: the book route is the redirect, the
    // event route is the study page, and the index is the real page —
    // these tests pin the close destination AND the focus return to
    // the book's entry in the index directory.
    function renderStudyPage(path) {
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

    it("the book URL redirects to the study page: no book shell, no dialog, event canonical", () => {
        renderStudyPage("/biblical-history/genesis");
        // The redirect lands on the first published event by
        // narrativeOrder, as a standalone page.
        expect(screen.getByRole("heading", { level: 1, name: "Creation" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.querySelector(".history-panel-backdrop")).toBeNull();
        // No book shell behind the study: no book heading, no event
        // list, no event count.
        expect(screen.queryByRole("heading", { level: 1, name: "Genesis" })).toBeNull();
        expect(screen.queryByText(/historical events/)).toBeNull();
        expect(screen.queryByText(/Events in Genesis/)).toBeNull();
        expect(document.title).toBe("Creation — Genesis 1:1–2:3 | Biblical History | Gnosis");
        expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
            "https://studygnosis.com/biblical-history/genesis/creation",
        );
        // Breadcrumb: the book crumb links to the first event (never
        // the obsolete book-page URL), the open event is current.
        const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(breadcrumb).toBeInTheDocument();
    });

    it("returns to the index after close-button close — focus lands on the Genesis entry", async () => {
        const user = userEvent.setup();
        renderStudyPage("/biblical-history/genesis/creation");
        expect(screen.getByRole("heading", { level: 1, name: "Creation" })).toBeInTheDocument();
        await user.click(screen.getByTestId("history-study-close"));
        await waitFor(() => expect(
            screen.getByRole("heading", { level: 1, name: "Discover the History Behind Scripture." }),
        ).toBeInTheDocument());
        // Close lands on the index book directory, with the directory
        // open at the book that was open — Creation is a Genesis event,
        // so its entry is the Genesis entry, not a hardcoded target.
        const genesisEntry = document.querySelector('[data-history-book="genesis"]');
        expect(genesisEntry).not.toBeNull();
        await waitFor(() => expect(genesisEntry).toHaveFocus());
        expect(document.activeElement).not.toBe(document.body);
    });

    it("Escape does not leave the study page — only the close button does", async () => {
        const user = userEvent.setup();
        renderStudyPage("/biblical-history/genesis/creation");
        await waitFor(() => expect(screen.getByText("Overview prose here.")).toBeInTheDocument());
        // The companion opens by default, so the first Escape closes it
        // and the second is a no-op — the study stays put either way.
        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Genesis 1:1–2:3" })).toBeNull());
        await user.keyboard("{Escape}");
        expect(screen.getByRole("heading", { level: 1, name: "Creation" })).toBeInTheDocument();
        await user.click(screen.getByTestId("history-study-close"));
        await waitFor(() => expect(
            screen.getByRole("heading", { level: 1, name: "Discover the History Behind Scripture." }),
        ).toBeInTheDocument());
    });
});

describe("HistoryEventStudy — mobile single column", () => {
    const originalMatchMedia = window.matchMedia;
    afterEach(() => {
        window.matchMedia = originalMatchMedia;
    });

    it("renders without a sheet handle or collapsed state on mobile", async () => {
        window.matchMedia = vi.fn((query) => ({
            matches: query === "(max-width: 768px)",
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
        }));
        renderStudy();
        await waitFor(() => expect(screen.getByText("Overview prose here.")).toBeInTheDocument());
        expect(screen.queryByTestId("history-sheet-handle")).toBeNull();
        expect(document.querySelector(".history-panel-dialog--collapsed")).toBeNull();
        expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "horizontal");
        // The companion still renders inline on mobile, open by default.
        expect(await screen.findByRole("heading", { name: "Genesis 1:1–2:3" })).toBeInTheDocument();
    });
});
