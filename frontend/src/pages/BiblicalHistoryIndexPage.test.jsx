import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import BiblicalHistoryIndexPage from "./BiblicalHistoryIndexPage";

vi.mock("../components/Header/Header", () => ({ default: () => null }));

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
    it("lists all 66 books with Upcoming states and no unpublished titles", () => {
        renderIndex();
        expect(screen.getByRole("heading", { level: 1, name: "Biblical History" })).toBeInTheDocument();
        expect(screen.getAllByText("Upcoming")).toHaveLength(66);
        expect(screen.queryByText(/Creation/)).toBeNull();
        expect(screen.getByRole("link", { name: /Genesis/ })).toHaveAttribute("href", "/biblical-history/genesis");
    });

    it("sets indexable metadata for the index page", () => {
        renderIndex();
        expect(document.title).toBe("Biblical History | Gnosis");
    });
});
