import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ScrollManager from "./ScrollManager";

function TestRoutes() {
    return (
        <>
            <ScrollManager />
            <Routes>
                <Route path="/" element={<Link to="/about">About</Link>} />
                <Route path="/about" element={<><Link to="/about?tab=mission">Tab</Link><Link to="/#explore">Explore</Link></>} />
            </Routes>
        </>
    );
}

describe("ScrollManager", () => {
    beforeEach(() => vi.stubGlobal("scrollTo", vi.fn()));

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
    });

    test("does not reset initial history-restored locations", () => {
        render(<MemoryRouter initialEntries={["/", "/about"]} initialIndex={1}><TestRoutes /></MemoryRouter>);
        expect(window.scrollTo).not.toHaveBeenCalled();
    });
});
