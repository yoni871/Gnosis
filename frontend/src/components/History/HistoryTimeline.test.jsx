import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import HistoryTimeline from "./HistoryTimeline";

const EVENTS = [
    {
        id: "event-creation",
        kind: "event",
        title: "Creation",
        date: { type: "unknown", label: "No established date", yearStart: null, yearEnd: null },
    },
    {
        id: "event-flood",
        kind: "event",
        title: "The Flood",
        date: { type: "unknown", label: "No established date", yearStart: null, yearEnd: null },
    },
    {
        id: "event-abraham",
        kind: "event",
        title: "The Call of Abraham",
        date: { type: "traditional", label: "c. 2000 BCE", traditionalSystem: "Traditional chronology", yearStart: -2000, yearEnd: -2000 },
    },
];

// A mixed book: an event, then a category, then an event — the unified
// entries list in narrative order.
const MIXED_ENTRIES = [
    {
        id: "event-creation",
        kind: "event",
        title: "Creation",
        date: { type: "unknown", label: "No established date", yearStart: null, yearEnd: null },
    },
    {
        id: "category-patriarchs",
        kind: "category",
        title: "The Patriarchs",
        date: { type: "unknown", label: "No established date", yearStart: null, yearEnd: null },
    },
    {
        id: "event-flood",
        kind: "event",
        title: "The Flood",
        date: { type: "unknown", label: "No established date", yearStart: null, yearEnd: null },
    },
];

function LocationProbe() {
    const location = useLocation();
    return <p data-testid="location">{location.pathname}</p>;
}

function renderTimeline({ currentEntryId = "event-creation", entries = EVENTS } = {}) {
    return render(
        <MemoryRouter initialEntries={["/biblical-history/genesis/creation"]}>
            <Routes>
                <Route
                    path="/biblical-history/genesis/:event?"
                    element={
                        <>
                            <LocationProbe />
                            <HistoryTimeline entries={entries} currentEntryId={currentEntryId} bookId="genesis" />
                        </>
                    }
                />
            </Routes>
        </MemoryRouter>,
    );
}

describe("HistoryTimeline", () => {
    it("centers the active marker inside the strip without scrolling the page", () => {
        const scrollTo = vi.fn();
        const scrollIntoView = vi.fn();
        const originalScrollTo = HTMLElement.prototype.scrollTo;
        const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
        HTMLElement.prototype.scrollTo = scrollTo;
        HTMLElement.prototype.scrollIntoView = scrollIntoView;
        try {
            renderTimeline();
            expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: expect.any(String), left: expect.any(Number) }));
            expect(scrollIntoView).not.toHaveBeenCalled();
        } finally {
            HTMLElement.prototype.scrollTo = originalScrollTo;
            HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
        }
    });
    it("renders one node per entry with date labels and aria-current on the open entry", () => {
        renderTimeline();
        expect(screen.getByRole("navigation", { name: "Entries in this book" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Creation/ })).toHaveAttribute("aria-current", "true");
        expect(screen.getByRole("button", { name: /The Flood/ })).not.toHaveAttribute("aria-current");
        expect(screen.getAllByText("No established date")).toHaveLength(2);
        expect(screen.getByText("c. 2000 BCE — Traditional (Traditional chronology)")).toBeInTheDocument();
        // Keyboard instructions are visible so arrow navigation is discoverable.
        expect(screen.getByText(/Use the Left and Right arrow keys/)).toBeInTheDocument();
    });

    it("has no previous/next buttons anywhere", () => {
        renderTimeline();
        expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
        expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
    });

    it("moves with Left/Right arrows and Home/End, navigating to the event URL", async () => {
        const user = userEvent.setup();
        renderTimeline();
        const creation = screen.getByRole("button", { name: /Creation/ });
        creation.focus();
        await user.keyboard("{ArrowRight}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/flood");
        await user.keyboard("{ArrowRight}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/abraham");
        await user.keyboard("{ArrowLeft}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/flood");
        await user.keyboard("{End}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/abraham");
        await user.keyboard("{Home}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/creation");
    });

    it("navigates on click and keeps exactly one tab stop (roving tabindex)", async () => {
        const user = userEvent.setup();
        renderTimeline();
        const buttons = screen.getAllByRole("button", { name: /Creation|Flood|Call of Abraham/ });
        expect(buttons[0]).toHaveAttribute("tabindex", "0");
        expect(buttons[1]).toHaveAttribute("tabindex", "-1");
        expect(buttons[2]).toHaveAttribute("tabindex", "-1");
        await user.click(screen.getByRole("button", { name: /The Flood/ }));
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/flood");
    });

    it("contains only published entries and keeps keyboard navigation on real nodes", async () => {
        const user = userEvent.setup();
        renderTimeline();
        expect(screen.queryByText("Upcoming")).toBeNull();
        expect(screen.getAllByRole("button")).toHaveLength(EVENTS.length);
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/creation");
        const creation = screen.getByRole("button", { name: /Creation/ });
        creation.focus();
        await user.keyboard("{End}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/abraham");
        await user.keyboard("{ArrowRight}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/creation");
    });
});

describe("HistoryTimeline — mixed events and categories", () => {
    it("renders category nodes with a visible Category label and a kind in the accessible name", () => {
        renderTimeline({ entries: MIXED_ENTRIES, currentEntryId: "category-patriarchs" });
        expect(screen.getByRole("navigation", { name: "Entries in this book" })).toBeInTheDocument();
        const categoryNode = screen.getByRole("button", { name: /The Patriarchs, Category/ });
        expect(categoryNode).toHaveAttribute("aria-current", "true");
        expect(categoryNode).toHaveTextContent("Category");
        expect(categoryNode).toHaveClass("history-timeline-node--category");
        // Event nodes state their kind too, and carry no visible Category label.
        const creationNode = screen.getByRole("button", { name: /Creation, Event/ });
        expect(creationNode).not.toHaveAttribute("aria-current");
        expect(creationNode).not.toHaveTextContent("Category");
        expect(creationNode).not.toHaveClass("history-timeline-node--category");
    });

    it("navigates with keyboard and click across mixed nodes, using the category slug for categories", async () => {
        const user = userEvent.setup();
        renderTimeline({ entries: MIXED_ENTRIES, currentEntryId: "event-creation" });
        const creation = screen.getByRole("button", { name: /Creation, Event/ });
        creation.focus();
        await user.keyboard("{ArrowRight}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/patriarchs");
        await user.keyboard("{ArrowRight}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/flood");
        await user.keyboard("{ArrowLeft}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/patriarchs");
        await user.keyboard("{Home}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/creation");
        await user.keyboard("{End}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/flood");
        await user.click(screen.getByRole("button", { name: /The Patriarchs, Category/ }));
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/patriarchs");
    });
});
