import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HistoryBookIndex from "./HistoryBookIndex";

describe("HistoryBookIndex", () => {
    it("lists all 66 books grouped OT/NT with event counts or Upcoming", () => {
        render(<MemoryRouter><HistoryBookIndex /></MemoryRouter>);
        const ot = within(screen.getByRole("region", { name: "Old Testament" })).getAllByRole("link");
        const nt = within(screen.getByRole("region", { name: "New Testament" })).getAllByRole("link");
        // Sections are <section> elements; Testing Library maps them to region only with an accessible name.
        expect(ot).toHaveLength(39);
        expect(nt).toHaveLength(27);
        expect(screen.getByRole("link", { name: /Genesis/ })).toHaveAttribute("href", "/biblical-history/genesis");
        expect(screen.getByRole("link", { name: /Song of Solomon/ })).toHaveAttribute(
            "href", "/biblical-history/song-of-solomon",
        );
        expect(screen.getByRole("link", { name: /Revelation/ })).toHaveAttribute("href", "/biblical-history/revelation");
    });

    it("marks every book except Genesis Upcoming in a production build and ships no other event titles", () => {
        render(<MemoryRouter><HistoryBookIndex /></MemoryRouter>);
        expect(screen.getAllByText("Upcoming")).toHaveLength(65);
        expect(screen.getByText("1 event")).toBeInTheDocument();
        expect(screen.queryByText(/Creation/)).toBeNull();
    });
});
