import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import HistoryTimeline from "./HistoryTimeline";

const EVENTS = [
    {
        id: "event-creation",
        title: "Creation",
        date: { type: "unknown", label: "No established date", yearStart: null, yearEnd: null },
    },
    {
        id: "event-flood",
        title: "The Flood",
        date: { type: "unknown", label: "No established date", yearStart: null, yearEnd: null },
    },
    {
        id: "event-abraham",
        title: "The Call of Abraham",
        date: { type: "traditional", label: "c. 2000 BCE", traditionalSystem: "Traditional chronology", yearStart: -2000, yearEnd: -2000 },
    },
];

function LocationProbe() {
    const location = useLocation();
    return <p data-testid="location">{location.pathname}</p>;
}

function renderTimeline({ currentEventId = "event-creation" } = {}) {
    return render(
        <MemoryRouter initialEntries={["/biblical-history/genesis/creation"]}>
            <Routes>
                <Route
                    path="/biblical-history/genesis/:event?"
                    element={
                        <>
                            <LocationProbe />
                            <HistoryTimeline events={EVENTS} currentEventId={currentEventId} bookId="genesis" />
                        </>
                    }
                />
            </Routes>
        </MemoryRouter>,
    );
}

describe("HistoryTimeline", () => {
    it("renders one node per event with date labels and aria-current on the open event", () => {
        renderTimeline();
        expect(screen.getByRole("navigation", { name: "Events in this book" })).toBeInTheDocument();
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

    it("ends with one generic Upcoming slot that is not a link or button and never navigates", async () => {
        const user = userEvent.setup();
        renderTimeline();
        const upcoming = screen.getByText("Upcoming");
        expect(upcoming.closest("button")).toBeNull();
        expect(upcoming.closest("a")).toBeNull();
        expect(upcoming.closest("[aria-disabled='true']")).not.toBeNull();
        // Clicking it navigates nowhere.
        await user.click(upcoming);
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/creation");
        // Keyboard navigation skips it: End lands on the last real event.
        const creation = screen.getByRole("button", { name: /Creation/ });
        creation.focus();
        await user.keyboard("{End}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/abraham");
        await user.keyboard("{ArrowRight}");
        expect(screen.getByTestId("location")).toHaveTextContent("/biblical-history/genesis/creation");
    });
});
