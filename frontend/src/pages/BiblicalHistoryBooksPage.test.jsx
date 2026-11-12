import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import BiblicalHistoryBooksPage from "./BiblicalHistoryBooksPage";

vi.mock("../components/Header/Header", () => ({ default: () => null }));

function renderBooks() {
    return render(
        <MemoryRouter initialEntries={["/biblical-history/books"]}>
            <ThemeProvider>
                <AuthContext.Provider value={{ user: null, isAuthLoading: false, logout: vi.fn() }}>
                    <BiblicalHistoryBooksPage />
                </AuthContext.Provider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

describe("BiblicalHistoryBooksPage", () => {
    it("retains the complete book directory at its new route", () => {
        renderBooks();
        expect(screen.getByRole("heading", { level: 1, name: "Browse by Bible Book" })).toBeInTheDocument();
        expect(screen.getAllByText("Upcoming")).toHaveLength(65);
        expect(screen.getByText("1 event")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Genesis/ })).toHaveAttribute("href", "/biblical-history/genesis");
        expect(document.title).toBe("Browse Biblical History by Book | Gnosis");
    });
});
