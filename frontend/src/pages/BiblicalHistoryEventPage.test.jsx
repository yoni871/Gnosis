// Event study page tests: the routes mirror App.jsx — the book route
// is the redirect, the event route is the standalone study page, and
// the index is the homepage. These pin the header, the redirect, the
// SEO, the 404s, and event-to-event navigation through the timeline.
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import BiblicalHistoryBookRedirect from "./BiblicalHistoryBookRedirect";
import BiblicalHistoryEventPage from "./BiblicalHistoryEventPage";
import BiblicalHistoryIndexPage from "./BiblicalHistoryIndexPage";

function renderStudy(path, authValue = { user: null, isAuthLoading: false, logout: vi.fn() }) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <ThemeProvider>
                <AuthContext.Provider value={authValue}>
                    <Routes>
                        <Route path="/biblical-history" element={<BiblicalHistoryIndexPage />} />
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

describe("BiblicalHistoryEventPage header", () => {
    it("shows the landing navbar signed out: maroon logo, Explore, Sign In / Start Exploring, no reader controls", async () => {
        const user = userEvent.setup();
        renderStudy("/biblical-history/genesis/creation");
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
        renderStudy("/biblical-history/genesis/creation", {
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

describe("BiblicalHistoryEventPage", () => {
    it("redirects /biblical-history/genesis to the Creation study page in a production build", () => {
        renderStudy("/biblical-history/genesis");
        // The redirect lands on the first published event by
        // narrativeOrder, as a standalone page — no book shell behind
        // it, no dialog, no backdrop.
        expect(screen.getByRole("heading", { level: 1, name: "Creation" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.querySelector(".history-panel-backdrop")).toBeNull();
        expect(screen.queryByRole("heading", { level: 1, name: "Genesis" })).toBeNull();
        expect(screen.queryByText(/historical events/)).toBeNull();
        expect(screen.queryByText(/Events in Genesis/)).toBeNull();
        expect(screen.queryByText(/No historical events published yet/)).toBeNull();
        expect(document.title).toBe("Creation — Genesis 1:1–2:3 | Biblical History | Gnosis");
        expect(canonicalHref()).toBe("https://studygnosis.com/biblical-history/genesis/creation");
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

    it("renders the published event page for a direct Genesis / Adam and Eve link", () => {
        renderStudy("/biblical-history/genesis/adam-and-eve");
        expect(screen.queryByRole("heading", { level: 1, name: "Page not found" })).toBeNull();
        expect(screen.getByRole("heading", { level: 1, name: "Adam and Eve" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.title).toBe("Adam and Eve — Genesis 2:4–3:24 | Biblical History | Gnosis");
        expect(canonicalHref()).toBe("https://studygnosis.com/biblical-history/genesis/adam-and-eve");
        const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(breadcrumb).getByRole("link", { name: "Genesis" })).toHaveAttribute(
            "href", "/biblical-history/genesis/creation",
        );
        expect(within(breadcrumb).getByText("Adam and Eve")).toHaveAttribute("aria-current", "page");
    });

    it("redirects a book with no published events to the homepage, where it is marked Coming Soon", async () => {
        renderStudy("/biblical-history/1-samuel");
        // No Upcoming page any more: the book URL lands on the index
        // book directory, opened at 1 Samuel, with its Coming Soon chip
        // focused — and nothing else claims the book has events.
        expect(screen.getByRole("heading", { level: 1, name: "Discover the History Behind Scripture." })).toBeInTheDocument();
        expect(screen.queryByText(/No historical events published yet/)).toBeNull();
        expect(screen.queryByRole("heading", { level: 1, name: "Page not found" })).toBeNull();
        expect(screen.getByRole("button", { name: /Close Books/ })).toHaveAttribute("aria-expanded", "true");
        const chip = document.querySelector('[data-history-book="1-samuel"]');
        expect(chip).not.toBeNull();
        expect(chip).toHaveTextContent("Coming Soon");
        expect(chip.tagName).not.toBe("A");
        await waitFor(() => expect(chip).toHaveFocus());
        expect(document.activeElement).not.toBe(document.body);
        // The homepage keeps its own indexable metadata.
        expect(document.title).toBe("Biblical History | Gnosis");
        expect(canonicalHref()).toBe("https://studygnosis.com/biblical-history");
    });

    it("renders the 404 page for an unknown book slug", () => {
        renderStudy("/biblical-history/not-a-book");
        expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    });

    it("renders the 404 page for an event not connected to the requested book", () => {
        renderStudy("/biblical-history/exodus/creation");
        expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    });

    it("navigates Creation → Adam and Eve → Creation through the timeline", async () => {
        const user = userEvent.setup();
        renderStudy("/biblical-history/genesis/creation");
        expect(screen.getByRole("heading", { level: 1, name: "Creation" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /Adam and Eve/ }));
        await waitFor(() => expect(
            screen.getByRole("heading", { level: 1, name: "Adam and Eve" }),
        ).toBeInTheDocument());
        expect(document.title).toBe("Adam and Eve — Genesis 2:4–3:24 | Biblical History | Gnosis");
        expect(canonicalHref()).toBe("https://studygnosis.com/biblical-history/genesis/adam-and-eve");
        await user.click(screen.getByRole("button", { name: /^Creation/ }));
        await waitFor(() => expect(
            screen.getByRole("heading", { level: 1, name: "Creation" }),
        ).toBeInTheDocument());
        expect(canonicalHref()).toBe("https://studygnosis.com/biblical-history/genesis/creation");
    });

    it("returns to the index after closing the Adam and Eve page — focus lands on the Genesis entry", async () => {
        const user = userEvent.setup();
        renderStudy("/biblical-history/genesis/adam-and-eve");
        expect(screen.getByRole("heading", { level: 1, name: "Adam and Eve" })).toBeInTheDocument();
        await user.click(screen.getByTestId("history-study-close"));
        await waitFor(() => expect(
            screen.getByRole("heading", { level: 1, name: "Discover the History Behind Scripture." }),
        ).toBeInTheDocument());
        // Close lands on the index book directory with the directory
        // open at the book that was open — Adam and Eve is a Genesis
        // event, so its entry is the Genesis entry, not a hardcoded
        // target.
        const genesisEntry = document.querySelector('[data-history-book="genesis"]');
        expect(genesisEntry).not.toBeNull();
        await waitFor(() => expect(genesisEntry).toHaveFocus());
        expect(document.activeElement).not.toBe(document.body);
    });
});
