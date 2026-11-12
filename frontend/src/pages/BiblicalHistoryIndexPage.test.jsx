import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
    it("presents the editorial introduction without rendering the 66-book directory", () => {
        renderIndex();
        expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Explore" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "Discover the History Behind Scripture." })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "What Is Biblical History?" })).toBeInTheDocument();
        expect(screen.getAllByRole("listitem")).toHaveLength(4);
        expect(screen.queryByText("Upcoming")).toBeNull();
    });

    it("links its actions to the recommendation, Creation event, and book directory", () => {
        renderIndex();
        expect(screen.getByRole("link", { name: "Start Exploring" })).toHaveAttribute("href", "#history-start");
        expect(screen.getByRole("link", { name: "Explore Creation" })).toHaveAttribute("href", "/biblical-history/genesis/creation");
        expect(screen.getByRole("link", { name: "Browse Books" })).toHaveAttribute("href", "/biblical-history/books");
    });

    it("sets indexable metadata for the index page", () => {
        renderIndex();
        expect(document.title).toBe("Biblical History | Gnosis");
    });
});
