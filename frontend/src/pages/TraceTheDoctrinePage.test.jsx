import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import TraceTheDoctrinePage from "./TraceTheDoctrinePage";

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/trace-the-doctrine"]}>
            <ThemeProvider>
                <AuthContext.Provider value={{ user: null, isAuthLoading: false, logout: vi.fn() }}>
                    <TraceTheDoctrinePage />
                </AuthContext.Provider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

describe("TraceTheDoctrinePage", () => {
    it("renders the exact hero copy, the search field, and the era thread", () => {
        renderPage();
        // The light parchment hero needs the solid header band: the
        // plain hero header is ivory-on-transparent for dark heroes.
        expect(document.querySelector(".landing-header")).toHaveClass("landing-header-solid");
        expect(screen.getByRole("heading", { level: 1, name: "Trace the Doctrine" })).toBeInTheDocument();
        expect(screen.getByText("Gnosis · Theology Through History")).toBeInTheDocument();
        expect(screen.getByText("From Scripture, through centuries of Christian thought.")).toBeInTheDocument();
        expect(screen.getByText("Explore how Christian doctrines have been understood, explained, and debated throughout church history — beginning with the biblical text.")).toBeInTheDocument();
        expect(screen.getByRole("searchbox", { name: "Search planned doctrines" })).toHaveAttribute(
            "placeholder",
            "Search the six planned doctrines…",
        );
        expect(screen.getByText("Search covers the planned doctrines below — no studies are published yet.")).toBeInTheDocument();
        for (const era of ["Scripture", "Early Church", "Councils", "Reformation", "Today"]) {
            expect(screen.getByText(era)).toBeInTheDocument();
        }
    });

    it("features the Trinity with its passages, timeline, and a Preview workspace link", () => {
        renderPage();
        expect(screen.getByRole("heading", { level: 2, name: "The Trinity" })).toBeInTheDocument();
        expect(screen.getByText("Trace biblical passages and their interpretation from the early Church through major theological controversies and councils.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Genesis 1:26" })).toHaveAttribute("href", "/bible/Genesis/1");
        expect(screen.getByRole("link", { name: "Matthew 28:19" })).toHaveAttribute("href", "/bible/Matthew/28");
        expect(screen.getByText("Historical Timeline")).toBeInTheDocument();
        const action = screen.getByRole("link", { name: /Begin Exploring/ });
        expect(action).toHaveAttribute("href", "/trace-the-doctrine/trinity");
        expect(screen.getByText("The Trinity study workspace is available as a preview — its historical entries are demonstration data pending research.")).toBeInTheDocument();
    });

    it("lists all six planned doctrines, the Trinity as Preview and the other five Coming Soon", () => {
        renderPage();
        const directory = document.getElementById("doctrines");
        for (const title of ["The Trinity", "The Incarnation", "Salvation", "The Holy Spirit", "The Church", "The Resurrection"]) {
            expect(within(directory).getByRole("heading", { level: 3, name: title })).toBeInTheDocument();
        }
        // One Preview pill on the featured panel, one on the Trinity
        // card, and one Coming Soon pill per remaining directory card.
        expect(screen.getAllByText("Preview")).toHaveLength(2);
        expect(screen.getAllByText("Coming Soon")).toHaveLength(5);
        expect(screen.getByText("Planned categories for future studies. Each will trace its doctrine from the biblical text through centuries of Christian thought — none is published yet.")).toBeInTheDocument();
    });

    it("filters the directory by search and restores it on clear, with an honest empty state", async () => {
        const user = userEvent.setup();
        renderPage();
        const directory = () => document.getElementById("doctrines");
        const search = screen.getByRole("searchbox", { name: "Search planned doctrines" });
        await user.type(search, "pentecost");
        expect(screen.getByText("Showing 1 of 6 planned doctrines.")).toBeInTheDocument();
        expect(within(directory()).getByRole("heading", { name: "The Holy Spirit" })).toBeInTheDocument();
        expect(within(directory()).queryByRole("heading", { name: "The Trinity" })).toBeNull();
        expect(within(directory()).queryByRole("heading", { name: "Salvation" })).toBeNull();

        await user.clear(search);
        await user.type(search, "zzz-no-such-doctrine");
        expect(screen.getByText("No planned doctrines match “zzz-no-such-doctrine”.")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("No planned doctrines match your search.");
        await user.click(screen.getByRole("button", { name: "Show all planned doctrines" }));
        expect(within(directory()).getByRole("heading", { name: "The Trinity" })).toBeInTheDocument();
        expect(within(directory()).getByRole("heading", { name: "The Resurrection" })).toBeInTheDocument();
        expect(screen.getByText("Search covers the planned doctrines below — no studies are published yet.")).toBeInTheDocument();
    });

    it("matches a search against descriptions and keywords, not only titles", async () => {
        const user = userEvent.setup();
        renderPage();
        await user.type(screen.getByRole("searchbox", { name: "Search planned doctrines" }), "grace");
        const directory = document.getElementById("doctrines");
        expect(within(directory).getByRole("heading", { name: "Salvation" })).toBeInTheDocument();
        expect(within(directory).queryByRole("heading", { name: "The Church" })).toBeNull();
    });

    it("exposes Trace the Doctrine through the Explore dropdown and sets indexable metadata", async () => {
        const user = userEvent.setup();
        renderPage();
        expect(document.title).toBe("Trace the Doctrine | Gnosis");
        await user.click(screen.getByRole("button", { name: "Explore" }));
        const menu = document.querySelector(".landing-explore-options");
        expect(menu).not.toBeNull();
        const link = within(menu).getByRole("link", { name: /Trace the Doctrine/ });
        expect(link).toHaveAttribute("href", "/trace-the-doctrine");
        expect(link).toHaveTextContent("Follow Christian doctrines from Scripture through centuries of thought.");
        // Existing entries are preserved.
        expect(within(menu).getByRole("link", { name: /Bible & Commentary/ })).toBeInTheDocument();
        expect(within(menu).getByRole("link", { name: /Biblical History/ })).toBeInTheDocument();
    });

    it("keeps the directory cards non-interactive: no dead links imply a published study", () => {
        renderPage();
        const directory = document.getElementById("doctrines");
        expect(directory).not.toBeNull();
        const cardLinks = within(directory).queryAllByRole("link");
        expect(cardLinks).toHaveLength(0);
    });
});
