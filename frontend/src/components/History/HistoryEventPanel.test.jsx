// Panel tests. The service layer is mocked (the real generated content is
// production-mode: the draft Creation event is not generated), so these
// tests exercise the panel itself — focus/Escape/return, the sheet, the
// tabs, the timeline, and the development-content badge — against fixture
// data shaped exactly like the real Creation record.
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import HistoryEventPanel from "./HistoryEventPanel";

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
