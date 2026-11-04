import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import App from "../App";
import AuthContext from "../context/AuthContext";
import LandingPage from "./LandingPage";
import {
    LANDING_TITLE,
    LANDING_DESCRIPTION,
} from "../utils/seo";

const LOGGED_OUT = {
    user: null,
    isAuthLoading: false,
    logout: vi.fn(),
};

function renderLanding(authValue) {
    return render(
        <MemoryRouter>
            <AuthContext.Provider value={authValue}>
                <LandingPage />
            </AuthContext.Provider>
        </MemoryRouter>,
    );
}

describe("LandingPage", () => {
    test("renders the hero with the approved copy and CTA destinations", () => {
        renderLanding(LOGGED_OUT);

        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Study Scripture with clarity and depth",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Read the Bible alongside trusted classic commentary. Explore each verse, take notes, and keep your study organized.",
            ),
        ).toBeInTheDocument();

        // Hero, final CTA, and footer each link to the reader.
        const startLinks = screen.getAllByRole("link", {
            name: "Start Studying",
        });
        expect(startLinks).toHaveLength(3);
        startLinks.forEach((link) => {
            expect(link).toHaveAttribute("href", "/bible/Genesis/1");
        });

        const howLink = screen.getByRole("link", {
            name: "See how it works",
        });
        expect(howLink).toHaveAttribute("href", "#how-it-works");
        expect(
            document.getElementById("how-it-works"),
        ).not.toBeNull();
    });

    test("has exactly one H1 and the approved section headings", () => {
        renderLanding(LOGGED_OUT);

        expect(
            screen.getAllByRole("heading", { level: 1 }),
        ).toHaveLength(1);

        for (const heading of [
            "Scripture and commentary, side by side",
            "How it works",
            "Trusted classic commentary",
            "About Us",
            "Explore Scripture",
            "Start studying today",
        ]) {
            expect(
                screen.getByRole("heading", { level: 2, name: heading }),
            ).toBeInTheDocument();
        }

        for (const card of [
            "Verse-by-verse insight",
            "Notes and highlights",
            "Focused study",
            "Matthew Henry",
            "Jamieson, Fausset & Brown",
        ]) {
            expect(
                screen.getByRole("heading", { level: 3, name: card }),
            ).toBeInTheDocument();
        }
    });

    test("logged-out header shows About Us, Sign in, Create account, and a working mobile menu", async () => {
        const user = userEvent.setup();
        renderLanding(LOGGED_OUT);

        const header = screen.getByRole("banner");
        expect(
            within(header).getByRole("link", { name: "About Us" }),
        ).toHaveAttribute("href", "#about");
        expect(
            within(header).getByRole("link", { name: "Sign in" }),
        ).toHaveAttribute("href", "/login");
        expect(
            within(header).getByRole("link", { name: "Create account" }),
        ).toHaveAttribute("href", "/register");
        expect(
            within(header).queryByLabelText(/Account menu/),
        ).toBeNull();

        const menuButton = within(header).getByRole("button", {
            name: "Open menu",
        });
        await user.click(menuButton);
        expect(
            within(header).getByRole("button", { name: "Close menu" }),
        ).toBeInTheDocument();
        const mobileNav = within(header).getByRole("navigation", {
            name: "Mobile",
        });
        expect(mobileNav).toBeInTheDocument();

        await user.click(
            within(mobileNav).getByRole("link", { name: "About Us" }),
        );
        expect(
            within(header).queryByRole("navigation", { name: "Mobile" }),
        ).toBeNull();

        await user.click(
            within(header).getByRole("button", { name: "Open menu" }),
        );
        await user.keyboard("{Escape}");
        expect(
            within(header).queryByRole("navigation", { name: "Mobile" }),
        ).toBeNull();
    });

    test("logged-in header shows the account chip and sign-out works", async () => {
        const user = userEvent.setup();
        const logout = vi.fn();
        renderLanding({
            user: { first_name: "Yonatan", last_name: "Demissie" },
            isAuthLoading: false,
            logout,
        });

        const header = screen.getByRole("banner");
        expect(
            within(header).queryByRole("link", { name: "Sign in" }),
        ).toBeNull();
        expect(
            within(header).queryByRole("link", {
                name: "Create account",
            }),
        ).toBeNull();
        expect(
            within(header).getByRole("link", {
                name: "Start Studying",
            }),
        ).toHaveAttribute("href", "/bible/Genesis/1");
        expect(
            within(header).getByText("Yonatan Demissie"),
        ).toBeInTheDocument();
        expect(within(header).getByText("YD")).toBeInTheDocument();

        await user.click(
            within(header).getByRole("button", {
                name: "Account menu for Yonatan Demissie",
            }),
        );
        expect(
            within(header).getByRole("link", {
                name: "Continue studying",
            }),
        ).toHaveAttribute("href", "/bible/Genesis/1");
        await user.click(
            within(header).getByRole("button", { name: "Sign out" }),
        );
        expect(logout).toHaveBeenCalledTimes(1);
    });

    test("renders nothing in the header auth area while auth is loading", () => {
        renderLanding({
            user: null,
            isAuthLoading: true,
            logout: vi.fn(),
        });

        const header = screen.getByRole("banner");
        expect(
            within(header).queryByRole("link", { name: "Sign in" }),
        ).toBeNull();
        expect(
            within(header).queryByRole("link", {
                name: "Create account",
            }),
        ).toBeNull();
    });

    test("sets homepage SEO: title, description, canonical, social tags, JSON-LD", () => {
        renderLanding(LOGGED_OUT);

        expect(document.title).toBe(LANDING_TITLE);
        expect(
            document.querySelector('meta[name="description"]'),
        ).toHaveAttribute("content", LANDING_DESCRIPTION);
        expect(
            document.querySelector('link[rel="canonical"]'),
        ).toHaveAttribute("href", "https://studygnosis.com/");
        expect(
            document.querySelector('meta[property="og:image"]'),
        ).toHaveAttribute(
            "content",
            "https://studygnosis.com/images/landing/hero-1200.jpg",
        );
        expect(
            document.querySelector('meta[name="twitter:card"]'),
        ).toHaveAttribute("content", "summary_large_image");

        const script = document.querySelector(
            'script[type="application/ld+json"]',
        );
        expect(script).not.toBeNull();
        const jsonLd = JSON.parse(script.textContent);
        expect(jsonLd["@type"]).toBe("WebSite");
        expect(jsonLd.name).toBe("Gnosis");
        expect(jsonLd.url).toBe("https://studygnosis.com/");
    });

    test("Explore Scripture links to real chapter routes", () => {
        renderLanding(LOGGED_OUT);

        const explore = screen.getByRole("region", {
            name: "Explore Scripture",
        });
        const links = within(explore).getAllByRole("link");
        expect(links).toHaveLength(8);
        expect(links.map((link) => link.getAttribute("href"))).toEqual([
            "/bible/Genesis/1",
            "/bible/Psalms/1",
            "/bible/Psalms/23",
            "/bible/Isaiah/53",
            "/bible/Matthew/5",
            "/bible/John/1",
            "/bible/Romans/8",
            "/bible/Philippians/4",
        ]);
    });

    test("footer links only to routes that exist: no Privacy or Terms", () => {
        renderLanding(LOGGED_OUT);

        const footer = screen.getByRole("contentinfo");
        expect(
            within(footer).queryByText("Privacy"),
        ).toBeNull();
        expect(within(footer).queryByText("Terms")).toBeNull();
        expect(
            within(footer).getByRole("link", { name: "About Us" }),
        ).toHaveAttribute("href", "#about");
        expect(
            within(footer).getByRole("link", { name: "Sign in" }),
        ).toHaveAttribute("href", "/login");
        expect(
            within(footer).getByRole("link", {
                name: "Create account",
            }),
        ).toHaveAttribute("href", "/register");
    });
});

describe("App routing with the landing page", () => {
    test("renders the landing page at / instead of redirecting", () => {
        window.history.pushState({}, "", "/");
        render(<App />);

        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Study Scripture with clarity and depth",
            }),
        ).toBeInTheDocument();
        expect(window.location.pathname).toBe("/");
    });

    test("preserves the study route without redirecting it", () => {
        window.history.pushState({}, "", "/bible/Genesis/1");
        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise(() => {})),
        );
        // jsdom elements have no scrollTo; the reader calls it on mount.
        Element.prototype.scrollTo = vi.fn();
        render(<App />);

        expect(window.location.pathname).toBe("/bible/Genesis/1");
        expect(
            screen.queryByRole("heading", {
                level: 1,
                name: "Study Scripture with clarity and depth",
            }),
        ).toBeNull();
    });
});
