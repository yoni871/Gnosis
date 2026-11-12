// The public Sources list shows author, title, publication details,
// and the original-source link — never the internal verification status.
// Regression coverage for the removal of the verification badges/labels:
// a not-independently-verified source and a verified source must both
// render without any verification text.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import HistorySourcesList from "./HistorySourcesList";

vi.mock("../../services/historyService", () => ({
    getSource: (id) => {
        if (id === "source-unverified") {
            return {
                id,
                author: "Catherine McDowell",
                title: "Human Identity and Purpose Redefined",
                publisher: "Advances in Ancient, Biblical, and Near Eastern Research",
                year: 2021,
                pagesOrSection: "1(3): 29–44",
                url: "https://doi.org/10.35068/aabner.v1i3.830",
                verification: "not-independently-verified",
                verificationDetail: "Full article read.",
            };
        }
        if (id === "source-verified") {
            return {
                id,
                author: "Nicole Brisch",
                title: "Marduk (god)",
                publisher: "Oracc, University of Pennsylvania / collaborators",
                year: null,
                pagesOrSection: "Functions",
                url: "https://oracc.museum.upenn.edu/amgg/listofdeities/marduk/index.html",
                verification: "verified",
                verificationDetail: "ORACC page fetched.",
            };
        }
        return null;
    },
}));

describe("HistorySourcesList", () => {
    it("renders authors, titles, details, and links without verification labels", () => {
        render(<HistorySourcesList sourceIds={["source-unverified", "source-verified"]} />);
        expect(screen.getByText(/Catherine McDowell/)).toBeInTheDocument();
        expect(screen.getByText(/Human Identity and Purpose Redefined/)).toBeInTheDocument();
        expect(screen.getByText(/Nicole Brisch/)).toBeInTheDocument();
        expect(screen.getByText(/Marduk \(god\)/)).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: "View source" })).toHaveLength(2);
        expect(screen.queryByText(/not independently verified/i)).toBeNull();
        expect(screen.queryByText(/^verified$/i)).toBeNull();
        expect(document.querySelector(".history-source-verification")).toBeNull();
    });

    it("renders nothing when no sources resolve", () => {
        const { container } = render(<HistorySourcesList sourceIds={["source-missing"]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
