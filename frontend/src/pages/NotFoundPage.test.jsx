import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import NotFoundPage from "./NotFoundPage";

function renderNotFound() {
    return render(
        <MemoryRouter initialEntries={["/nonexistent-page-xyz"]}>
            <ThemeProvider>
                <AuthContext.Provider value={{ user: null, isAuthLoading: false, logout: vi.fn() }}>
                    <NotFoundPage />
                </AuthContext.Provider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

test("unknown route shows a 404 page with a way home", () => {
    renderNotFound();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found");
    expect(screen.getByText(/does not exist/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the homepage" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Start exploring Scripture" })).toHaveAttribute(
        "href",
        "/bible/Genesis/1",
    );
    // The site header and footer render, so the visitor can navigate onward.
    expect(screen.getAllByRole("link", { name: "Gnosis home" })).toHaveLength(2);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
});
