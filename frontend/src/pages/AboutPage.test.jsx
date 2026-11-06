import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import AboutPage from "./AboutPage";
import App from "../App";

function renderAbout(auth = { user: null, isAuthLoading: false, logout: vi.fn() }) {
    return render(<MemoryRouter initialEntries={["/about"]}><AuthContext.Provider value={auth}><AboutPage /></AuthContext.Provider></MemoryRouter>);
}

describe("About Gnosis", () => {
    test("has a clear reading hierarchy, honest purpose, and no content photographs", () => {
        const { container } = renderAbout();
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("About Gnosis");
        for (const name of ["Why the Name Gnosis?", "Gnosis in Scripture", "Our Mission", "Our Vision"]) {
            expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
        }
        expect(screen.getByText(/not connected to Gnosticism or its teachings/)).toBeInTheDocument();
        expect(screen.getByText(/not inspired Scripture, an error-free authority/)).toBeInTheDocument();
        expect(screen.getByText(/Today, Gnosis brings Scripture/)).toBeInTheDocument();
        expect(container.querySelector("main img, main picture, main video")).toBeNull();
        const home = within(screen.getByRole("banner")).getByRole("link", { name: "Gnosis home" });
        expect(home).toHaveAttribute("href", "/");
        expect(home.querySelector("img")).toHaveAttribute("src", "/gnosis.svg");
        expect(home.querySelector("img")).toHaveAttribute("width", "40");
        expect(home.querySelector("img")).toHaveAttribute("height", "40");
        expect(home.querySelector("img")).toHaveAttribute("alt", "");
        expect(container.querySelector('[itemtype*="Organization"]')).toBeNull();
    });

    test("public navigation and all study CTAs have valid destinations", () => {
        renderAbout();
        expect(screen.getByRole("link", { name: "Explore Scripture →" })).toHaveAttribute("href", "/bible/Genesis/1");
        for (const link of screen.getAllByRole("link", { name: "About Us" })) expect(link).toHaveAttribute("href", "/about");
        for (const link of within(screen.getByRole("navigation", { name: "On this page" })).getAllByRole("link")) {
            expect(document.querySelector(link.getAttribute("href"))).toBeInTheDocument();
        }
        expect(screen.getByRole("banner")).toBeInTheDocument();
        expect(screen.getByRole("main")).toBeInTheDocument();
        expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    });

    test("sets distinct indexable metadata without a homepage canonical or photograph", () => {
        renderAbout();
        expect(document.title).toBe("About Gnosis | Scripture, Commentary & Thoughtful Study");
        expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
        expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute("href", "https://studygnosis.com/about");
        expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
        expect(document.head.querySelector('meta[property="og:url"]')).toHaveAttribute("content", "https://studygnosis.com/about");
        expect(document.head.querySelector('meta[property="og:title"]')).toHaveAttribute("content", document.title);
        expect(document.head.querySelector('meta[name="twitter:title"]')).toHaveAttribute("content", document.title);
        expect(document.head.querySelector('meta[name="twitter:card"]')).toHaveAttribute("content", "summary");
        const description = document.head.querySelector('meta[name="description"]').content;
        expect(description).toContain("Christian Bible study application");
        expect(document.head.querySelector('meta[property="og:description"]')).toHaveAttribute("content", description);
        expect(document.head.querySelector('meta[name="twitter:description"]')).toHaveAttribute("content", description);
        expect(document.head.querySelector('meta[property="og:image"]')).toBeNull();
        expect(document.head.querySelector('[data-seo-jsonld]')).toBeNull();
    });

    test("supports mobile disclosure and Escape focus on the About page", async () => {
        const user = userEvent.setup();
        renderAbout();
        const toggle = screen.getByRole("button", { name: "Open menu" });
        await user.click(toggle);
        within(screen.getByRole("navigation", { name: "Mobile" })).getByRole("link", { name: "About Us" }).focus();
        await user.keyboard("{Escape}");
        expect(toggle).toHaveFocus();
        expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    test("preserves authenticated header actions without changing the auth contract", async () => {
        const user = userEvent.setup();
        const logout = vi.fn();
        renderAbout({ user: { first_name: "Sample", last_name: "Reader" }, isAuthLoading: false, logout });
        const header = screen.getByRole("banner");
        expect(within(header).queryByRole("link", { name: "Sign in" })).toBeNull();
        await user.click(within(header).getByRole("button", { name: /Account menu/ }));
        await user.click(within(header).getByRole("button", { name: "Sign out" }));
        expect(logout).toHaveBeenCalledTimes(1);
    });

    test("direct /about navigation and an application remount preserve the route", () => {
        window.history.replaceState({}, "", "/about");
        const first = render(<App />);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("About Gnosis");
        first.unmount();
        render(<App />);
        expect(window.location.pathname).toBe("/about");
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("About Gnosis");
        const config = JSON.parse(readFileSync("vercel.json", "utf8"));
        expect(config.rewrites).toContainEqual({ source: "/(.*)", destination: "/index.html" });
    });
});

test("all four Scripture cards preserve complete KJV text, Greek and exact verse destinations", async () => {
    const { GNOSIS_PASSAGES } = await import("./aboutContent");
    renderAbout();
    const cards = document.querySelectorAll('.about-scripture-card');
    expect(cards).toHaveLength(4);
    GNOSIS_PASSAGES.forEach((passage,index) => {
        expect(cards[index].querySelector('blockquote').textContent).toBe(passage.quotation);
        expect(cards[index].querySelector('.about-knowledge').textContent).toBe('knowledge');
        expect(cards[index].querySelector('[lang="grc"]').textContent).toBe(passage.greek);
        expect(cards[index].querySelector('a')).toHaveAttribute('href',`/bible/${encodeURIComponent(passage.book)}/${passage.chapter}?verse=${passage.verse}&translation=KJV`);
    });
    expect(screen.getByText(/not a list of features currently available/)).toBeInTheDocument();
    expect(screen.queryByText('A Place to Pursue Deeper Understanding.')).toBeNull();
});
