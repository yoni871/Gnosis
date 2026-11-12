// Panel tests. The service layer is mocked (the real generated content is
// production-mode: the draft Creation event is not generated), so these
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
import BiblicalHistoryBookPage from "../../pages/BiblicalHistoryBookPage";
import BiblicalHistoryEventPage from "../../pages/BiblicalHistoryEventPage";
import HistoryEventPanel from "./HistoryEventPanel";

vi.mock("../components/Header/Header", () => ({ default: () => null }));

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
    sources: ["source-dev-placeholder"],
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

    it("shows cross-book chips for the other books carrying the event", () => {
        renderPanel();
        expect(screen.getByText("Also in:")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Psalms" })).toHaveAttribute(
            "href", "/biblical-history/psalms/creation",
        );
    });

    it("switches tabs: Scripture shows the assembled passages, Ancient World the subsections", async () => {
        const user = userEvent.setup();
        renderPanel();
        await waitFor(() => expect(screen.getByText("Overview prose here.")).toBeInTheDocument());
        await user.click(screen.getByRole("tab", { name: "Scripture" }));
        expect(screen.getByRole("heading", { name: "Primary Passage" })).toBeInTheDocument();
        // The primary passage and the connection share the same range, so
        // the link appears twice — both must land in the reader.
        const rangeLinks = screen.getAllByRole("link", { name: "Genesis 1:1–2:3" });
        expect(rangeLinks).toHaveLength(2);
        for (const link of rangeLinks) {
            expect(link).toHaveAttribute("href", "/bible/Genesis/1?verse=1");
        }
        expect(screen.getByText("The primary account.")).toBeInTheDocument();
        expect(screen.getByText("Traditional")).toBeInTheDocument();
        await user.click(screen.getByRole("tab", { name: "Ancient World" }));
        expect(screen.getByRole("button", { name: /Creation in the ancient Near East/ })).toBeInTheDocument();
        expect(screen.getByText("Subsection prose.")).toBeInTheDocument();
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

describe("HistoryEventPanel — focus return across the close navigation (D2)", () => {
    function renderBookPage(path) {
        return render(
            <MemoryRouter initialEntries={[path]}>
                <ThemeProvider>
                    <AuthContext.Provider value={{ user: null, isAuthLoading: false, logout: vi.fn() }}>
                        <Routes>
                            <Route path="/biblical-history/:book" element={<BiblicalHistoryBookPage />} />
                            <Route path="/biblical-history/:book/:event" element={<BiblicalHistoryEventPage />} />
                        </Routes>
                    </AuthContext.Provider>
                </ThemeProvider>
            </MemoryRouter>,
        );
    }

    it("returns focus to the event link after mouse-open + Escape close", async () => {
        const user = userEvent.setup();
        renderBookPage("/biblical-history/genesis");
        const link = document.getElementById("history-event-link-creation");
        expect(link).not.toBeNull();
        await user.click(link);
        await waitFor(() => expect(screen.getByRole("dialog", { name: "Creation" })).toBeInTheDocument());
        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        // The close navigation unmounts and remounts the book page, so
        // the link is a new node — focus must land on the new node, not
        // the detached one the panel captured on open.
        const relink = document.getElementById("history-event-link-creation");
        expect(relink).not.toBeNull();
        expect(relink).not.toBe(link);
        await waitFor(() => expect(document.activeElement).toBe(relink));
    });

    it("returns focus to the event link after keyboard-open + close-button close", async () => {
        const user = userEvent.setup();
        renderBookPage("/biblical-history/genesis");
        const link = document.getElementById("history-event-link-creation");
        link.focus();
        await user.keyboard("{Enter}");
        await waitFor(() => expect(screen.getByRole("dialog", { name: "Creation" })).toBeInTheDocument());
        await user.click(screen.getByTestId("history-panel-close"));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() =>
            expect(document.activeElement).toBe(document.getElementById("history-event-link-creation")),
        );
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
