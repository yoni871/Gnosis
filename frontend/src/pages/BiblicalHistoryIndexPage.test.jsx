import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import BiblicalHistoryIndexPage from "./BiblicalHistoryIndexPage";

function renderIndex() {
    return render(
        <MemoryRouter initialEntries={["/biblical-history"]}>
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
        expect(screen.getByRole("link", { name: "Genesis" })).toHaveAttribute("href", "/biblical-history/genesis");
    });

    it("sets indexable metadata for the index page", () => {
        renderIndex();
        expect(document.title).toBe("Biblical History | Gnosis");
    });
});
