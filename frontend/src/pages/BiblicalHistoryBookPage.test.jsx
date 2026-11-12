import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import BiblicalHistoryBookPage from "./BiblicalHistoryBookPage";

vi.mock("../components/Header/Header", () => ({ default: () => null }));

function renderBook(path) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <ThemeProvider>
                <AuthContext.Provider value={{ user: null, isAuthLoading: false, logout: vi.fn() }}>
                    <Routes>
                        <Route path="/biblical-history/:book" element={<BiblicalHistoryBookPage />} />
                        <Route path="/biblical-history/:book/:event" element={<BiblicalHistoryBookPage />} />
                    </Routes>
                </AuthContext.Provider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

describe("BiblicalHistoryBookPage", () => {
    it("renders Genesis with its published Creation event in a production build", () => {
        renderBook("/biblical-history/genesis");
        expect(screen.getByRole("heading", { level: 1, name: "Genesis" })).toBeInTheDocument();
        expect(screen.getByText(/1 historical event/)).toBeInTheDocument();
        expect(screen.queryByText(/No historical events published yet/)).toBeNull();
        expect(screen.getByRole("link", { name: /Creation/ })).toHaveAttribute(
            "href", "/biblical-history/genesis/creation",
        );
        expect(document.title).toBe("Biblical History — Genesis | Gnosis");
    });

    it("links into the reader at chapter 1, encoding spaced book names", () => {
        renderBook("/biblical-history/1-samuel");
        expect(screen.getByRole("heading", { level: 1, name: "1 Samuel" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Read 1 Samuel 1 in the Bible/ })).toHaveAttribute(
            "href", "/bible/1%20Samuel/1",
        );
    });

    it("renders the 404 page for an unknown book slug", () => {
        renderBook("/biblical-history/not-a-book");
        expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    });

    it("renders the published event panel for Genesis / Creation in a production build", () => {
        renderBook("/biblical-history/genesis/creation");
        expect(screen.queryByRole("heading", { level: 1, name: "Page not found" })).toBeNull();
        expect(screen.getByRole("dialog", { name: "Creation" })).toBeInTheDocument();
        expect(document.title).toBe("Creation — Genesis 1:1–2:3 | Biblical History | Gnosis");
    });

    it("renders the 404 page for an event not connected to the requested book", () => {
        renderBook("/biblical-history/exodus/creation");
        expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    });
});
