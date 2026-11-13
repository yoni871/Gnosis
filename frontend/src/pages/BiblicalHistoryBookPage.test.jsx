import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import BiblicalHistoryBookRedirect from "./BiblicalHistoryBookRedirect";
import BiblicalHistoryEventPage from "./BiblicalHistoryEventPage";

// The routes mirror App.jsx: the book route is the redirect, the event
// route is the study page.
function renderBook(path, authValue = { user: null, isAuthLoading: false, logout: vi.fn() }) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <ThemeProvider>
                <AuthContext.Provider value={authValue}>
                    <Routes>
                        <Route path="/biblical-history/:book" element={<BiblicalHistoryBookRedirect />} />
                        <Route path="/biblical-history/:book/:event" element={<BiblicalHistoryEventPage />} />
                    </Routes>
                </AuthContext.Provider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

function canonicalHref() {
    return document.querySelector('link[rel="canonical"]')?.getAttribute("href");
}

describe("BiblicalHistoryBookPage header", () => {
    it("shows the landing navbar signed out: maroon logo, Explore, Sign In / Start Exploring, no reader controls", async () => {
        const user = userEvent.setup();
        renderBook("/biblical-history/genesis/creation");
        expect(screen.getByRole("link", { name: "Gnosis home" })).toHaveAttribute("href", "/");
        expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", "/login");
        expect(screen.getByRole("link", { name: /Start Exploring/ })).toHaveAttribute("href", "/bible/Genesis/1");
        expect(screen.queryByRole("button", { name: /Account menu/ })).toBeNull();
        // The Explore dropdown carries its existing options.
        await user.click(screen.getByRole("button", { name: "Explore" }));
        expect(screen.getByRole("link", { name: /Bible & Commentary/ })).toHaveAttribute("href", "/bible/Genesis/1");
        expect(screen.getByRole("link", { name: /Biblical History/ })).toHaveAttribute("href", "/biblical-history");
        // No commentary-specific controls remain: no reader search, no
        // Side/Stack layout toggle, no BIBLE COMMENTARY wordmark.
        expect(screen.queryByPlaceholderText("Search for a word or phrase...")).toBeNull();
        expect(screen.queryByRole("button", { name: "Side" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Stack" })).toBeNull();
        expect(screen.queryByText("BIBLE COMMENTARY")).toBeNull();
    });

    it("shows the signed-in profile and name in the landing navbar", () => {
        renderBook("/biblical-history/genesis/creation", {
            user: { id: 1, first_name: "Test", last_name: "Reader" },
            isAuthLoading: false,
            logout: vi.fn(),
        });
        expect(screen.getByRole("link", { name: /Start Exploring/ })).toHaveAttribute("href", "/bible/Genesis/1");
        const trigger = screen.getByRole("button", { name: "Account menu for Test Reader" });
        expect(within(trigger).getByText("Test Reader")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Sign In" })).toBeNull();
    });
});

describe("BiblicalHistoryBookPage", () => {
    it("redirects /biblical-history/genesis to the Creation study page in a production build", () => {
        renderBook("/biblical-history/genesis");
        // The redirect lands on the first published event by
        // narrativeOrder, with its panel open.
        expect(screen.getByRole("dialog", { name: "Creation" })).toBeInTheDocument();
        expect(document.title).toBe("Creation — Genesis 1:1–2:3 | Biblical History | Gnosis");
        expect(canonicalHref()).toBe("https://studygnosis.com/biblical-history/genesis/creation");
        // The book shell is still behind the panel: heading, event list.
        expect(screen.getByRole("heading", { level: 1, name: "Genesis" })).toBeInTheDocument();
        expect(screen.getByText(/2 historical events/)).toBeInTheDocument();
        expect(screen.queryByText(/No historical events published yet/)).toBeNull();
        expect(screen.getByRole("link", { name: /Creation/ })).toHaveAttribute(
            "href", "/biblical-history/genesis/creation",
        );
        expect(screen.getByRole("link", { name: /Adam and Eve/ })).toHaveAttribute(
            "href", "/biblical-history/genesis/adam-and-eve",
        );
        // Breadcrumb: the book crumb links to the first event (never
        // the obsolete book-page URL), the open event is current.
        const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(breadcrumb).getByRole("link", { name: "All books" })).toHaveAttribute(
            "href", "/biblical-history#history-books",
        );
        expect(within(breadcrumb).getByRole("link", { name: "Genesis" })).toHaveAttribute(
            "href", "/biblical-history/genesis/creation",
        );
        expect(within(breadcrumb).getByText("Creation")).toHaveAttribute("aria-current", "page");
    });

    it("renders the published event panel for a direct Genesis / Adam and Eve link", () => {
        renderBook("/biblical-history/genesis/adam-and-eve");
        expect(screen.queryByRole("heading", { level: 1, name: "Page not found" })).toBeNull();
        expect(screen.getByRole("dialog", { name: "Adam and Eve" })).toBeInTheDocument();
        expect(document.title).toBe("Adam and Eve — Genesis 2:4–3:24 | Biblical History | Gnosis");
        expect(canonicalHref()).toBe("https://studygnosis.com/biblical-history/genesis/adam-and-eve");
        const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(breadcrumb).getByRole("link", { name: "Genesis" })).toHaveAttribute(
            "href", "/biblical-history/genesis/creation",
        );
        expect(within(breadcrumb).getByText("Adam and Eve")).toHaveAttribute("aria-current", "page");
    });

    it("keeps the Upcoming state for a book with no published events, with no redirect", () => {
        renderBook("/biblical-history/1-samuel");
        expect(screen.getByRole("heading", { level: 1, name: "1 Samuel" })).toBeInTheDocument();
        expect(screen.getByText(/No historical events published yet/)).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByRole("link", { name: /Read 1 Samuel 1 in the Bible/ })).toHaveAttribute(
            "href", "/bible/1%20Samuel/1",
        );
        // No event to open, so the book title stays plain current-page
        // text — and the canonical points at the index, never at a
        // book-page URL.
        const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(breadcrumb).queryByRole("link", { name: "1 Samuel" })).toBeNull();
        expect(within(breadcrumb).getByText("1 Samuel")).toHaveAttribute("aria-current", "page");
        expect(canonicalHref()).toBe("https://studygnosis.com/biblical-history");
        expect(document.title).toBe("Biblical History — 1 Samuel | Gnosis");
    });

    it("renders the 404 page for an unknown book slug", () => {
        renderBook("/biblical-history/not-a-book");
        expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    });

    it("renders the 404 page for an event not connected to the requested book", () => {
        renderBook("/biblical-history/exodus/creation");
        expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    });
});
