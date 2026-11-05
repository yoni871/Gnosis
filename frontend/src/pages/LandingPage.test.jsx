import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
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
                name: "Explore Scripture. Discover Its Depth.",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Discover the richness of Scripture, explore the wisdom of Christian thinkers, and grow in your understanding of God's Word.",
            ),
        ).toBeInTheDocument();

        // The hero action and remaining study links all lead to the reader.
        const startLinks = screen.getAllByRole("link", {
            name: "Start Studying",
        });
        expect(startLinks).toHaveLength(2);
        for (const link of screen.getAllByRole("link", { name: "Start Exploring →" })) expect(link).toHaveAttribute("href", "/bible/Genesis/1");
        expect(screen.getByText("SCRIPTURE • THEOLOGY • HISTORY")).toBeInTheDocument();
        startLinks.forEach((link) => {
            expect(link).toHaveAttribute("href", "/bible/Genesis/1");
        });

        const howLink = screen.getByRole("link", {
            name: "See How It Works",
        });
        expect(howLink).toHaveAttribute("href", "#how-it-works");
        expect(
            document.getElementById("how-it-works"),
        ).not.toBeNull();
    });

    test.each([false, true])("hero anchor respects motion preference (%s) and preserves its destination", async reduce => {
        const scrollIntoView = vi.fn();
        vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
        renderLanding(LOGGED_OUT);
        document.getElementById("how-it-works").scrollIntoView = scrollIntoView;
        await userEvent.setup().click(screen.getByRole("link", { name: "See How It Works" }));
        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: reduce ? "instant" : "smooth", block: "start" });
        expect(window.location.hash).toBe("#how-it-works");
    });

    test("hero image and copy share a stage inside main, with navigation outside main", () => {
        renderLanding(LOGGED_OUT);
        const shell = document.querySelector(".landing-hero-shell");
        const main = screen.getByRole("main");
        expect(main).toContainElement(shell);
        expect(main).not.toContainElement(screen.getByRole("banner"));
        expect(shell).toContainElement(screen.getByRole("heading", { level: 1 }));
        expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#landing-main");
        expect(shell).toContainElement(screen.getByRole("img", { name: /laptop and a phone/ }));
        expect(document.querySelectorAll(".landing-hero-img")).toHaveLength(1);
        const home = screen.getByRole("link", { name: "Gnosis home" });
        expect(home).toHaveAttribute("href", "/");
        expect(home.querySelector("img")).toHaveAttribute("src", "/gnosis.svg");
        expect(home.querySelector("img")).toHaveAttribute("width", "40");
        expect(home.querySelector("img")).toHaveAttribute("height", "40");
        expect(document.querySelector('a[href="#about"]')).toBeNull();
        for (const link of screen.getAllByRole("link", { name: /About Us/ })) {
            expect(link).toHaveAttribute("href", "/about");
        }
    });

    test("desktop center navigation has the reusable Explore disclosure and About", async () => {
        renderLanding(LOGGED_OUT);
        const primary = screen.getByRole("navigation", { name: "Primary" });
        const trigger = within(primary).getByRole("button", { name: "Explore" });
        expect(within(primary).getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
        await userEvent.setup().click(trigger);
        expect(within(primary).getByRole("link", { name: /Bible & Commentary/ })).toHaveAttribute("href", "/bible/Genesis/1");
    });

    test("mobile Explore closes independently before the whole navigation", async () => {
        const user = userEvent.setup();
        renderLanding(LOGGED_OUT);
        const toggle = screen.getByRole("button", { name: "Open menu" });
        await user.click(toggle);
        const mobile = screen.getByRole("navigation", { name: "Mobile" });
        const explore = within(mobile).getByRole("button", { name: "Explore" });
        await user.click(explore);
        within(mobile).getByRole("link", { name: /Bible & Commentary/ }).focus();
        await user.keyboard("{Escape}");
        expect(explore).toHaveFocus();
        expect(explore).toHaveAttribute("aria-expanded", "false");
        expect(mobile).toBeInTheDocument();
        await user.keyboard("{Escape}");
        expect(toggle).toHaveFocus();
        expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();
    });

    test("mobile Explore navigation closes the whole disclosure", async () => {
        const user = userEvent.setup();
        renderLanding(LOGGED_OUT);
        await user.click(screen.getByRole("button", { name: "Open menu" }));
        const mobile = screen.getByRole("navigation", { name: "Mobile" });
        await user.click(within(mobile).getByRole("button", { name: "Explore" }));
        await user.click(within(mobile).getByRole("link", { name: /Bible & Commentary/ }));
        expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();
    });

    test("the approved scene remains static while waiting for matching laptop animation assets", () => {
        const scrollListener = vi.spyOn(window, "addEventListener");
        renderLanding(LOGGED_OUT);
        expect(document.querySelector('.landing-hero-media')).not.toHaveAttribute('data-hero-motion');
        expect(scrollListener.mock.calls.some(([event]) => event === 'scroll')).toBe(false);
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
            "Rooted in Scripture. Made for thoughtful study.",
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

    test("logged-out header shows About, Sign In, Start Exploring →, and a working mobile menu", async () => {
        const user = userEvent.setup();
        renderLanding(LOGGED_OUT);

        const header = screen.getByRole("banner");
        expect(
            within(header).getByRole("link", { name: "About" }),
        ).toHaveAttribute("href", "/about");
        expect(
            within(header).getByRole("link", { name: "Sign In" }),
        ).toHaveAttribute("href", "/login");
        expect(
            within(header).getByRole("link", { name: "Start Exploring →" }),
        ).toHaveAttribute("href", "/bible/Genesis/1");
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
            within(mobileNav).getByRole("link", { name: "About" }),
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
            user: { first_name: "Sample", last_name: "Reader" },
            isAuthLoading: false,
            logout,
        });

        const header = screen.getByRole("banner");
        expect(
            within(header).queryByRole("link", { name: "Sign In" }),
        ).toBeNull();
        expect(
            within(header).queryByRole("link", {
                name: "Create account",
            }),
        ).toBeNull();
        expect(
            within(header).getByRole("link", {
                name: "Start Exploring →",
            }),
        ).toHaveAttribute("href", "/bible/Genesis/1");
        expect(
            within(header).getByText("Sample Reader"),
        ).toBeInTheDocument();
        expect(within(header).getByText("SR")).toBeInTheDocument();

        await user.click(
            within(header).getByRole("button", {
                name: "Account menu for Sample Reader",
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

    test("mobile toggle closes on a second click and Escape returns focus", async () => {
        const user = userEvent.setup();
        renderLanding(LOGGED_OUT);
        const toggle = screen.getByRole("button", { name: "Open menu" });
        await user.click(toggle);
        await user.click(toggle);
        expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();
        await user.click(toggle);
        const nav = screen.getByRole("navigation", { name: "Mobile" });
        within(nav).getByRole("link", { name: "Sign In" }).focus();
        await user.keyboard("{Escape}");
        expect(toggle).toHaveFocus();
        expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    test("mobile menu closes when focus or a pointer leaves the header", async () => {
        const user = userEvent.setup();
        renderLanding(LOGGED_OUT);
        const toggle = screen.getByRole("button", { name: "Open menu" });
        await user.click(toggle);
        const nav = screen.getByRole("navigation", { name: "Mobile" });
        within(nav).getByRole("link", { name: "Start Exploring →" }).focus();
        await user.tab();
        expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();
        await user.click(toggle);
        await user.click(screen.getByRole("heading", { level: 1 }));
        expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    test("mobile account actions use their own disclosure and restore focus", async () => {
        const user = userEvent.setup();
        const logout = vi.fn();
        renderLanding({ user: { first_name: "Sample", last_name: "Reader" }, isAuthLoading: false, logout });
        await user.click(screen.getByRole("button", { name: "Open menu" }));
        const nav = screen.getByRole("navigation", { name: "Mobile" });
        const account = within(nav).getByRole("button", { name: /Account menu/ });
        await user.click(account);
        within(nav).getByRole("button", { name: "Sign out" }).focus();
        await user.keyboard("{Escape}");
        expect(account).toHaveFocus();
        expect(account).toHaveAttribute("aria-expanded", "false");
        expect(nav).toBeInTheDocument();
        await user.click(account);
        await user.click(within(nav).getByRole("button", { name: "Sign out" }));
        expect(logout).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();
    });

    test("static social preview and responsive assets use the approved image directory", () => {
        const html = readFileSync("index.html", "utf8");
        expect(html).toContain('property="og:image" content="https://studygnosis.com/images/landing/sunset-hero-images/hero-1200.jpg"');
        expect(html).not.toContain('rel="canonical"');
        renderLanding(LOGGED_OUT);
        const image = screen.getByRole("img", { name: /laptop and a phone/ });
        expect(image).toHaveAttribute("width", "1672");
        expect(image).toHaveAttribute("height", "941");
        expect(image).toHaveAttribute("fetchpriority", "high");
        for (const source of image.closest("picture").querySelectorAll("source")) {
            expect(source.srcset).toContain("/images/landing/sunset-hero-images/hero-480.");
            expect(source.srcset).toContain("1672w");
        }
    });

    test("renders nothing in the header auth area while auth is loading", () => {
        renderLanding({
            user: null,
            isAuthLoading: true,
            logout: vi.fn(),
        });

        const header = screen.getByRole("banner");
        expect(
            within(header).queryByRole("link", { name: "Sign In" }),
        ).toBeNull();
        expect(
            within(header).queryByRole("link", {
                name: "Start Exploring →",
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
            "https://studygnosis.com/images/landing/sunset-hero-images/hero-1200.jpg",
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
        ).toHaveAttribute("href", "/about");
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
                name: "Explore Scripture. Discover Its Depth.",
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
                name: "Explore Scripture. Discover Its Depth.",
            }),
        ).toBeNull();
    });
});
