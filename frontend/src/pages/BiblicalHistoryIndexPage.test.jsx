import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import BiblicalHistoryIndexPage from "./BiblicalHistoryIndexPage";

function renderIndex(initialEntries = ["/biblical-history"]) {
    return render(
        <MemoryRouter initialEntries={initialEntries}>
            <ThemeProvider>
                <AuthContext.Provider value={{ user: null, isAuthLoading: false, logout: vi.fn() }}>
                    <BiblicalHistoryIndexPage />
                </AuthContext.Provider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

describe("BiblicalHistoryIndexPage", () => {
    it("presents the editorial introduction with the book directory behind Browse Books", async () => {
        const user = userEvent.setup();
        renderIndex();
        expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Explore" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "Discover the History Behind Scripture." })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "What Is Biblical History?" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Browse Books/ })).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("tabpanel")).toBeNull();
        expect(screen.queryByText("Upcoming")).toBeNull();
        expect(screen.queryByText("Choose a book of the Bible to explore its historical context and events.")).toBeNull();
        await user.click(screen.getByRole("button", { name: /Browse Books/ }));
        expect(screen.getByRole("button", { name: /Close Books/ })).toHaveAttribute("aria-expanded", "true");
        expect(within(screen.getByRole("tabpanel")).getAllByRole("listitem")).toHaveLength(39);
        // Genesis is the only link; the other 38 books are Coming Soon.
        expect(screen.getAllByText("Coming Soon")).toHaveLength(38);
        expect(screen.queryByText("Upcoming")).toBeNull();
        expect(screen.getByText(/Scroll for more books/)).toBeInTheDocument();
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("tabpanel")).toBeNull();
        expect(screen.getByRole("button", { name: /Browse Books/ })).toHaveFocus();
    });

    it("links its actions to the recommendation and Creation event", async () => {
        const user = userEvent.setup();
        renderIndex();
        expect(screen.getByRole("link", { name: "Start Exploring" })).toHaveAttribute("href", "#history-start");
        expect(screen.getByRole("link", { name: "Explore Creation" })).toHaveAttribute("href", "/biblical-history/genesis/creation");
        expect(screen.getByRole("heading", { name: "Explore by Scripture" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /Browse Books/ }));
        // Genesis opens its first published event directly; the book
        // URL would redirect there anyway.
        expect(screen.getByRole("link", { name: "Genesis" })).toHaveAttribute("href", "/biblical-history/genesis/creation");
    });

    it("sets indexable metadata for the index page", () => {
        renderIndex();
        expect(document.title).toBe("Biblical History | Gnosis");
    });

    it("opens the directory at the book named in panel-close state and focuses its entry", () => {
        // The target is the book that was open, not a hardcoded
        // Genesis: Exodus has no published events, so only the
        // location-state mechanism can land focus on its entry.
        renderIndex([{ pathname: "/biblical-history", hash: "#history-books", state: { focusBook: "exodus" } }]);
        expect(screen.getByRole("button", { name: /Close Books/ })).toHaveAttribute("aria-expanded", "true");
        expect(document.querySelector('[data-history-book="exodus"]')).toHaveFocus();
        // Exodus has no published events, so its entry is a Coming Soon
        // chip — focusable (tabIndex -1) for the return, never a link.
        expect(document.querySelector('[data-history-book="exodus"]')).toHaveTextContent("Coming Soon");
        expect(document.activeElement).not.toBe(document.body);
    });

    it("opens the New Testament tab for a panel-close return to an NT book", () => {
        renderIndex([{ pathname: "/biblical-history", hash: "#history-books", state: { focusBook: "matthew" } }]);
        expect(screen.getByRole("tab", { name: /New Testament/ })).toHaveAttribute("aria-selected", "true");
        expect(document.querySelector('[data-history-book="matthew"]')).toHaveFocus();
        expect(document.activeElement).not.toBe(document.body);
    });

    it("falls back to the directory heading when the panel-close book has no entry", () => {
        renderIndex([{ pathname: "/biblical-history", hash: "#history-books", state: { focusBook: "nosuchbook" } }]);
        expect(screen.getByRole("button", { name: /Browse Books/ })).toHaveAttribute("aria-expanded", "false");
        expect(screen.getByRole("heading", { name: "Explore by Scripture" })).toHaveFocus();
        expect(document.activeElement).not.toBe(document.body);
    });

    it("focuses nothing on an ordinary visit without panel-close state", () => {
        renderIndex();
        expect(screen.getByRole("button", { name: /Browse Books/ })).toHaveAttribute("aria-expanded", "false");
        expect(document.activeElement).toBe(document.body);
    });
});
