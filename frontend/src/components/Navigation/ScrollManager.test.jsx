import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ScrollManager from "./ScrollManager";

function TestRoutes() {
    return (
        <>
            <ScrollManager />
            <Routes>
                <Route path="/" element={<Link to="/about">About</Link>} />
                <Route path="/about" element={<><Link to="/about?tab=mission">Tab</Link><Link to="/#explore">Explore</Link></>} />
                <Route path="/biblical-history" element={<section id="history-books"><h2>Explore by Scripture</h2></section>} />
                <Route path="/biblical-history/books" element={<Navigate to="/biblical-history#history-books" replace />} />
                <Route path="/biblical-history/:book" element={<Link to="/biblical-history#history-books">All books</Link>} />
            </Routes>
        </>
    );
}

describe("ScrollManager", () => {
    beforeEach(() => {
        vi.stubGlobal("scrollTo", vi.fn());
        vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })));
        // jsdom does not implement scrollIntoView; define it so the
        // anchor-scroll calls can be asserted.
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        delete window.HTMLElement.prototype.scrollIntoView;
    });

    test("scrolls to the top after normal page navigation", async () => {
        render(<MemoryRouter initialEntries={["/"]}><TestRoutes /></MemoryRouter>);
        await userEvent.click(screen.getByRole("link", { name: "About" }));
        expect(window.scrollTo).toHaveBeenCalledWith({
            top: 0,
            left: 0,
            behavior: "instant"
        });
    });

    test("does not interfere with same-page state or anchor navigation", async () => {
        render(<MemoryRouter initialEntries={["/about"]}><TestRoutes /></MemoryRouter>);
        await userEvent.click(screen.getByRole("link", { name: "Tab" }));
        await userEvent.click(screen.getByRole("link", { name: "Explore" }));
        expect(window.scrollTo).not.toHaveBeenCalled();
        expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    test("does not reset initial history-restored locations", () => {
        render(<MemoryRouter initialEntries={["/", "/about"]} initialIndex={1}><TestRoutes /></MemoryRouter>);
        expect(window.scrollTo).not.toHaveBeenCalled();
    });

    test("scrolls to #history-books on a direct visit", () => {
        render(<MemoryRouter initialEntries={["/biblical-history#history-books"]}><TestRoutes /></MemoryRouter>);
        expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
            behavior: "smooth",
            block: "start",
        });
        expect(window.scrollTo).not.toHaveBeenCalled();
    });

    test("scrolls to #history-books through the retired /books redirect", () => {
        render(<MemoryRouter initialEntries={["/biblical-history/books"]}><TestRoutes /></MemoryRouter>);
        expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
            behavior: "smooth",
            block: "start",
        });
        expect(window.scrollTo).not.toHaveBeenCalled();
    });

    test("scrolls to #history-books from the All books breadcrumb", async () => {
        render(<MemoryRouter initialEntries={["/biblical-history/genesis"]}><TestRoutes /></MemoryRouter>);
        await userEvent.click(screen.getByRole("link", { name: "All books" }));
        expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
            behavior: "smooth",
            block: "start",
        });
        expect(window.scrollTo).not.toHaveBeenCalled();
    });

    test("jumps instantly to #history-books when reduced motion is preferred", () => {
        vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query) => ({
            matches: query === "(prefers-reduced-motion: reduce)",
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })));
        render(<MemoryRouter initialEntries={["/biblical-history#history-books"]}><TestRoutes /></MemoryRouter>);
        expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
            behavior: "instant",
            block: "start",
        });
    });
});
