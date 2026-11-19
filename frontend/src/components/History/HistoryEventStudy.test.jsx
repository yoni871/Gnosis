// Study-page tests. The service layer is mocked (the real generated
// content is production-mode: the in-review Creation event is not
// generated), so these tests exercise the study page itself — the
// sections, the tabs, the companion, the timeline, and the
// development-content badge — against fixture data shaped exactly like
// the real Creation record. The page is ordinary page content: no
// dialog, no backdrop, no focus trap, no sheet, no modal close.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthContext from "../../context/AuthContext";
import { ThemeProvider } from "../../context/ThemeContext";
import BiblicalHistoryBookRedirect from "../../pages/BiblicalHistoryBookRedirect";
import BiblicalHistoryEventPage from "../../pages/BiblicalHistoryEventPage";
import BiblicalHistoryIndexPage from "../../pages/BiblicalHistoryIndexPage";
import HistoryEventStudy from "./HistoryEventStudy";
import { getBibleChapter } from "../../services/bibleService";
import { loadCategorySections, loadEventSections } from "../../services/historyService";

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
    kind: "event",
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

// A category fixture shaped like the real record: representative
// primaryScripture (≤3 chapters) plus a much wider fullRange that must
// NEVER reach the Scripture companion.
const FIXTURE_CATEGORY = {
    id: "category-patriarchs",
    kind: "category",
    title: "The Patriarchs",
    category: "category",
    status: "in-review",
    primaryScripture: { book: "Genesis", bookId: "genesis", startChapter: 12, startVerse: 1, endChapter: 12, endVerse: 3 },
    fullRange: { book: "Genesis", bookId: "genesis", startChapter: 12, startVerse: 1, endChapter: 50, endVerse: 26 },
    era: "patriarchal",
    date: { type: "unknown", label: "No established date", yearStart: null, yearEnd: null },
    locations: [],
    topics: [],
    relatedEvents: [],
    connections: [
        {
            book: "Genesis", bookId: "genesis", startChapter: 12, startVerse: 1, endChapter: 12, endVerse: 3,
            type: "direct-account", confidence: "traditional",
            note: "The call of Abram.",
        },
    ],
    sources: ["source-bdb-lexicon"],
    bookNote: "The patriarchal era in brief.",
};

// The real getCategory returns the raw generated record: it has
// `category: "category"` but no `kind` — kind lives only in the book
// file's entries. The mocked service mirrors that shape, so the page
// must copy kind from the entry onto the record it hands to the study
// (QA F1); a mock that returned kind would hide the defect.
const FIXTURE_CATEGORY_RECORD = { ...FIXTURE_CATEGORY };
delete FIXTURE_CATEGORY_RECORD.kind;

const FIXTURE_CATEGORY_SECTIONS = {
    overview: { markdown: "Patriarchs overview prose.", footnotes: [] },
    ancientWorld: { markdown: "", footnotes: [] },
    ancientWorldSubsections: [
        { heading: "The patriarchs in the ancient Near East", markdown: "Patriarchs subsection prose.", footnotes: [] },
    ],
    whyItMatters: { markdown: "Patriarchs why it matters prose.", footnotes: [] },
};

// The mixed book entries, in narrative order: the event first, then the
// category — the unified entries list the timeline renders.
const FIXTURE_ENTRIES = [
    { ...FIXTURE_EVENT, narrativeOrder: 1 },
    { ...FIXTURE_CATEGORY, narrativeOrder: 2 },
];

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
        getFirstPublishedEvent: () => FIXTURE_EVENT,
        getCategoryBySlug: (slug) => (slug === "patriarchs" ? FIXTURE_CATEGORY_RECORD : null),
        getCategory: (id) => (id === FIXTURE_CATEGORY.id ? FIXTURE_CATEGORY_RECORD : null),
        categorySlug: (id) => String(id).replace(/^category-/, ""),
        listBookEntries: (bookId) => (bookId === "genesis" ? FIXTURE_ENTRIES : []),
        buildBookTimeline: (bookId) => (bookId === "genesis" ? FIXTURE_ENTRIES : []),
        listEventsForBook: () => [{ ...FIXTURE_EVENT, narrativeOrder: 1 }],
        getBooksForEvent: () => [
            { id: "genesis", title: "Genesis" },
            { id: "psalms", title: "Psalms" },
        ],
        getBooksForCategory: () => [
            { id: "genesis", title: "Genesis" },
            { id: "exodus", title: "Exodus" },
        ],
        loadEventSections: vi.fn(async () => FIXTURE_SECTIONS),
        loadCategorySections: vi.fn(async () => FIXTURE_CATEGORY_SECTIONS),
    };
});

function renderStudy({ onBackToBooks = vi.fn() } = {}) {
    return render(
        <MemoryRouter initialEntries={["/biblical-history/genesis/creation"]}>
            <HistoryEventStudy record={FIXTURE_EVENT} bookId="genesis" onBackToBooks={onBackToBooks} />
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
        // The date label appears three times: the study header and the
        // two timeline nodes (the mixed entries list carries the event
        // and the category, both undated).
        expect(screen.getAllByText("No established date")).toHaveLength(3);
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
                    record={{ ...FIXTURE_EVENT, status: "in-review" }}
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
        expect(screen.getByRole("navigation", { name: "Entries in this book" })).toBeInTheDocument();
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

    it("opens Scripture in a separate mobile sheet and hides the timeline", async () => {
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
        expect(screen.queryByRole("heading", { name: "Genesis 1:1–2:3" })).toBeNull();
        await userEvent.click(screen.getByTestId("history-scripture-button"));
        expect(await screen.findByRole("heading", { name: "Genesis 1:1–2:3" })).toBeInTheDocument();
        expect(document.querySelector(".history-study")).toHaveClass("history-study--scripture-open");
        await userEvent.click(screen.getByTestId("history-companion-close"));
        expect(document.querySelector(".history-study")).not.toHaveClass("history-study--scripture-open");
    });
});

describe("HistoryEventStudy — category record", () => {
    function renderCategoryStudy() {
        return render(
            <MemoryRouter initialEntries={["/biblical-history/genesis/patriarchs"]}>
                <HistoryEventStudy record={FIXTURE_CATEGORY} bookId="genesis" onBackToBooks={vi.fn()} />
            </MemoryRouter>,
        );
    }

    it("renders the category with its in-review badge and loads sections via the category loader", async () => {
        vi.mocked(loadEventSections).mockClear();
        vi.mocked(loadCategorySections).mockClear();
        renderCategoryStudy();
        expect(screen.getByRole("heading", { level: 1, name: "The Patriarchs" })).toBeInTheDocument();
        expect(screen.getByText("In review — unpublished editorial content")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText("Patriarchs overview prose.")).toBeInTheDocument());
        expect(screen.getByText("Patriarchs why it matters prose.")).toBeInTheDocument();
        expect(vi.mocked(loadCategorySections)).toHaveBeenCalledWith("category-patriarchs");
        expect(vi.mocked(loadEventSections)).not.toHaveBeenCalled();
        // The book note lives in the Story's Key Takeaway, as for events.
        expect(screen.getByText("The patriarchal era in brief.")).toBeInTheDocument();
    });

    it("defaults the companion to the representative primaryScripture and never fetches the fullRange", async () => {
        vi.mocked(getBibleChapter).mockClear();
        renderCategoryStudy();
        await waitFor(() => expect(screen.getByText("Patriarchs overview prose.")).toBeInTheDocument());
        // Default open: Genesis 12:1–3 only — the representative passage.
        expect(await screen.findByRole("heading", { name: "Genesis 12:1–3" })).toBeInTheDocument();
        expect(vi.mocked(getBibleChapter).mock.calls.length).toBeGreaterThan(0);
        expect(vi.mocked(getBibleChapter).mock.calls.every(([, chapter]) => chapter === 12)).toBe(true);
        // No chapter of the 12–50 fullRange beyond its first chapter is fetched.
        expect(vi.mocked(getBibleChapter)).not.toHaveBeenCalledWith("Genesis", 50, expect.anything());
        expect(vi.mocked(getBibleChapter)).not.toHaveBeenCalledWith("Genesis", 13, expect.anything());
    });

    it("shows cross-book chips for the other books carrying the category, with the category slug", () => {
        renderCategoryStudy();
        expect(screen.getByText("Also in:")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Exodus" })).toHaveAttribute(
            "href", "/biblical-history/exodus/patriarchs",
        );
    });

    it("renders a mixed timeline: event and category nodes, category labelled, current on the category", async () => {
        renderCategoryStudy();
        await waitFor(() => expect(screen.getByText("Patriarchs overview prose.")).toBeInTheDocument());
        expect(screen.getByRole("navigation", { name: "Entries in this book" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /The Patriarchs, Category/ })).toHaveAttribute("aria-current", "true");
        expect(screen.getByRole("button", { name: /Creation, Event/ })).not.toHaveAttribute("aria-current");
    });
});

describe("HistoryEventStudy — category page (mocked service, routes mirror App.jsx)", () => {
    function renderCategoryPage(path) {
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

    it("renders the published category page for a direct Genesis / patriarchs link", async () => {
        renderCategoryPage("/biblical-history/genesis/patriarchs");
        expect(screen.queryByRole("heading", { level: 1, name: "Page not found" })).toBeNull();
        expect(screen.getByRole("heading", { level: 1, name: "The Patriarchs" })).toBeInTheDocument();
        expect(document.title).toBe("The Patriarchs — Genesis 12:1–3 | Biblical History | Gnosis");
        expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
            "https://studygnosis.com/biblical-history/genesis/patriarchs",
        );
        // Breadcrumb: the book crumb links to the first entry (Creation,
        // an event), the open category is current.
        const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(breadcrumb).getByRole("link", { name: "Genesis" })).toHaveAttribute(
            "href", "/biblical-history/genesis/creation",
        );
        expect(within(breadcrumb).getByText("The Patriarchs")).toHaveAttribute("aria-current", "page");
        // Companion default is the representative primary passage.
        expect(await screen.findByRole("heading", { name: "Genesis 12:1–3" })).toBeInTheDocument();
        // Timeline carries the mixed entries.
        expect(screen.getByRole("navigation", { name: "Entries in this book" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /The Patriarchs, Category/ })).toHaveAttribute("aria-current", "true");
        expect(screen.getByRole("button", { name: /Creation, Event/ })).toBeInTheDocument();
    });

    it("loads the category sections through the category loader — the page supplies kind from the book entry (QA F1)", async () => {
        // The mocked getCategoryBySlug returns the kind-less record the
        // real service returns, so this fails if the page hands the
        // study a record without kind: the study would take the event
        // loader and show the event sections (or the load error) instead
        // of the category sections.
        vi.mocked(loadEventSections).mockClear();
        vi.mocked(loadCategorySections).mockClear();
        renderCategoryPage("/biblical-history/genesis/patriarchs");
        await waitFor(() => expect(screen.getByText("Patriarchs overview prose.")).toBeInTheDocument());
        expect(screen.getByText("Patriarchs why it matters prose.")).toBeInTheDocument();
        expect(vi.mocked(loadCategorySections)).toHaveBeenCalledWith("category-patriarchs");
        expect(vi.mocked(loadEventSections)).not.toHaveBeenCalled();
    });

    it("navigates Creation → The Patriarchs through the timeline", async () => {
        const user = userEvent.setup();
        renderCategoryPage("/biblical-history/genesis/creation");
        expect(screen.getByRole("heading", { level: 1, name: "Creation" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /The Patriarchs, Category/ }));
        await waitFor(() => expect(
            screen.getByRole("heading", { level: 1, name: "The Patriarchs" }),
        ).toBeInTheDocument());
        expect(document.title).toBe("The Patriarchs — Genesis 12:1–3 | Biblical History | Gnosis");
        expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
            "https://studygnosis.com/biblical-history/genesis/patriarchs",
        );
    });

    it("renders the 404 page for an unknown category slug", () => {
        renderCategoryPage("/biblical-history/genesis/not-a-category");
        expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    });

    it("renders the 404 page for a category not connected to the requested book", () => {
        renderCategoryPage("/biblical-history/exodus/patriarchs");
        expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    });
});
