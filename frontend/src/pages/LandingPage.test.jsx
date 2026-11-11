import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router-dom";

import App from "../App";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
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
            <ThemeProvider>
                <AuthContext.Provider value={authValue}>
                    <LandingPage />
                </AuthContext.Provider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

describe("LandingPage", () => {
    test("introduces the purpose immediately after the hero with the approved pillars", () => {
        renderLanding(LOGGED_OUT);
        const purpose = screen.getByRole("region", { name: "A Deeper Way to Explore Christian Knowledge." });
        expect(document.querySelector(".landing-hero-shell").nextElementSibling).toBe(purpose);
        expect(within(purpose).getByText("THE PURPOSE BEHIND GNOSIS")).toBeInTheDocument();
        expect(within(purpose).getByText("Scripture is our starting point. Gnosis seeks to bring together biblical study, theology, and history—making centuries of Christian knowledge more accessible and interconnected.")).toBeInTheDocument();
        for (const name of ["01 — SCRIPTURE", "02 — THEOLOGY", "03 — HISTORY"]) {
            expect(within(purpose).getByRole("heading", { level: 3, name })).toBeInTheDocument();
        }
        for (const text of ["The foundation of everything we explore.", "Understanding the faith through Scripture and centuries of Christian thought.", "Discovering the people, events, and civilizations that shaped the biblical world and the history of Christianity."]) {
            expect(within(purpose).getByText(text)).toBeInTheDocument();
        }
        expect(within(purpose).queryByRole("img")).toBeNull();
    });

    test("Bible and commentary follows the purpose section and links to the real reader", () => {
        renderLanding(LOGGED_OUT);
        const section = screen.getByRole("region", { name: "Scripture and Wisdom, Side by Side." });
        expect(document.querySelector(".landing-purpose").nextElementSibling).toBe(section);
        expect(within(section).getByRole("link", { name: "Explore Scripture →" })).toHaveAttribute("href", "/bible/Genesis/1");
        expect(within(section).getByRole("img", { name: /actual Gnosis reader/ })).toHaveAttribute("loading", "lazy");
        expect(within(section).getAllByRole("listitem")).toHaveLength(3);
        expect(within(section).getByRole("img", { name: "Gnosis mobile Scripture view showing John 1 in the KJV" })).toHaveAttribute("src", "/images/landing/bible-commentary/mobile-scripture-856.jpg");
        const devices = within(section).getByRole("figure", { name: "Gnosis on one laptop and one smartphone" });
        expect(within(devices).getAllByRole("img")).toHaveLength(2);
        for (const badge of ["KJV Bible", "Trusted Commentaries", "Smooth Study Experience"]) expect(within(section).queryByText(badge)).toBeNull();
    });

    test("Beyond the Text follows the showcase and labels its connections as planned", () => {
        renderLanding(LOGGED_OUT);
        const section = screen.getByRole("region", { name: "One Passage. A World of Understanding." });
        expect(document.querySelector(".landing-bible").nextElementSibling).toBe(section);
        expect(within(section).getByText("BEYOND THE TEXT")).toBeInTheDocument();
        expect(within(section).getByText("Explore the connections between Scripture, the historical world, and centuries of Christian thought.")).toBeInTheDocument();
        expect(within(section).getByText("The Gnosis Vision")).toBeInTheDocument();
        expect(within(section).getByText("Planned connections")).toBeInTheDocument();
        expect(within(section).queryByRole("link")).toBeNull();
        expect(within(section).queryByRole("button")).toBeNull();
    });

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
        expect(screen.getByRole("link", { name: "Explore the Bible →" })).toHaveAttribute("href", "/bible/Genesis/1");
        for (const link of screen.getAllByRole("link", { name: "Start Exploring →" })) expect(link).toHaveAttribute("href", "/bible/Genesis/1");
        expect(screen.getByText("SCRIPTURE • THEOLOGY • HISTORY")).toBeInTheDocument();

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
        const home = within(screen.getByRole("banner")).getByRole("link", { name: "Gnosis home" });
        expect(home).toHaveAttribute("href", "/");
        expect(home.querySelector("img")).toHaveAttribute("src", "/gnosis.svg");
        expect(home.querySelector("img")).toHaveAttribute("width", "40");
        expect(home.querySelector("img")).toHaveAttribute("height", "40");
        expect(document.querySelector('a[href="#about"]')).toBeNull();
        for (const link of screen.getAllByRole("link", { name: "About" })) {
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

    test("the approved scene stays static when browser motion APIs are unavailable", () => {
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
            "Scripture and Wisdom, Side by Side.",
            "A Deeper Way to Explore Christian Knowledge.",
            "One Passage. A World of Understanding.",
            "Every Journey Begins with a Passage.",
        ]) {
            expect(
                screen.getByRole("heading", { level: 2, name: heading }),
            ).toBeInTheDocument();
        }

        for (const card of [
            "Read with Understanding",
            "Explore Different Perspectives",
            "Stay Focused on Scripture",
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
        // No Profile item: it had no handler and no /profile route, so it
        // was removed (UI audit P1-2). The menu is Settings -> Sign out.
        expect(within(header).queryByRole("button", { name: "Profile" })).toBeNull();
        expect(within(header).getByRole("link", { name: "Settings" })).toBeVisible();
        expect(within(header).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
        expect(within(header).queryByText("Continue studying")).toBeNull();
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

    test("static homepage metadata, favicon, and social preview use the approved values", () => {
        const html = readFileSync("index.html", "utf8");
        // Initial HTML carries the homepage's own metadata so crawlers
        // that do not run JavaScript still see the platform identity.
        expect(html).toContain(
            "<title>Gnosis | Explore Scripture, Theology & Christian History</title>",
        );
        expect(html).toContain(
            'content="Explore Scripture alongside trusted commentary and discover the connections between God\u2019s Word, theology, history, and Christian thought."',
        );
        expect(html).toContain(
            'property="og:title" content="Gnosis | Explore Scripture, Theology & Christian History"',
        );
        expect(html).toContain(
            'name="twitter:title" content="Gnosis | Explore Scripture, Theology & Christian History"',
        );
        expect(html).toContain('property="og:site_name" content="Gnosis"');
        expect(html).toContain(
            'property="og:image" content="https://studygnosis.com/images/landing/sunset-hero-images/hero-1200.jpg"',
        );
        expect(html).toContain(
            '<meta property="og:image:width" content="1200" />',
        );
        expect(html).toContain(
            '<meta property="og:image:height" content="675" />',
        );
        expect(html).toContain(
            'property="og:image:alt" content="A laptop and a phone showing the Gnosis Bible study app, resting on desert sand at sunset"',
        );
        // The WebSite block is static here and managed at runtime by
        // <Seo> through the same data-seo-jsonld node.
        const jsonLdMatch = html.match(
            /<script type="application\/ld\+json" data-seo-jsonld>([\s\S]*?)<\/script>/,
        );
        expect(jsonLdMatch).not.toBeNull();
        expect(JSON.parse(jsonLdMatch[1])).toMatchObject({
            "@type": "WebSite",
            name: "Gnosis",
            url: "https://studygnosis.com/",
            description: LANDING_DESCRIPTION,
        });
        // Raster favicon for Google Search (SVG is not a supported
        // search favicon format); the SVG stays for browsers.
        expect(html).toContain(
            '<link rel="icon" type="image/svg+xml" sizes="any" href="/gnosis.svg" />',
        );
        expect(html).toContain(
            '<link rel="icon" type="image/png" sizes="192x192" href="/favicon.png" />',
        );
        expect(html).toContain(
            '<link rel="apple-touch-icon" href="/favicon.png" />',
        );
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
            document.querySelector('meta[property="og:image:width"]'),
        ).toHaveAttribute("content", "1200");
        expect(
            document.querySelector('meta[property="og:image:height"]'),
        ).toHaveAttribute("content", "675");
        expect(
            document.querySelector('meta[property="og:image:alt"]'),
        ).toHaveAttribute(
            "content",
            "A laptop and a phone showing the Gnosis Bible study app, resting on desert sand at sunset",
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

    test("the six closing passage cards use valid chapter routes, with one integrated CTA", () => {
        renderLanding(LOGGED_OUT);
        const explore = screen.getByRole("region", { name: "Every Journey Begins with a Passage." });
        const list = within(explore).getByRole("list", { name: "Choose a passage" });
        const links = within(list).getAllByRole("link");
        expect(links).toHaveLength(6);
        expect(links.map(link => link.getAttribute("href"))).toEqual([
            "/bible/Genesis/1", "/bible/Psalms/23", "/bible/Isaiah/53",
            "/bible/John/1", "/bible/Romans/8", "/bible/Revelation/21",
        ]);
        for (const subtitle of ["In the Beginning", "The Lord Is My Shepherd", "The Suffering Servant", "The Word Became Flesh", "Life in the Spirit", "All Things Made New"]) {
            expect(within(list).getByText(subtitle)).toBeInTheDocument();
        }
        expect(list.querySelectorAll("img, svg")).toHaveLength(0);
        expect(within(explore).getByText("Or begin wherever Scripture leads you.")).toBeInTheDocument();
        expect(within(explore).getByRole("link", { name: "Explore the Bible →" })).toHaveAttribute("href", "/bible/Genesis/1");
        expect(document.querySelector(".landing-beyond").nextElementSibling).toBe(explore);
        expect(explore.nextElementSibling).toBeNull();
        expect(document.querySelectorAll(".landing-passages, .landing-final-cta, .landing-commentaries, .landing-about, .landing-how")).toHaveLength(0);
        expect(document.getElementById("how-it-works")).toHaveClass("landing-bible");
    });

    test("footer links only to routes that exist: Privacy yes, Terms no", () => {
        renderLanding(LOGGED_OUT);

        const footer = screen.getByRole("contentinfo");
        expect(
            within(footer).getByRole("link", { name: "Privacy" }),
        ).toHaveAttribute("href", "/privacy");
        expect(within(footer).queryByText("Terms")).toBeNull();
        const logo = within(footer).getByRole("link", { name: "Gnosis home" });
        expect(logo).toHaveAttribute("href", "/");
        expect(logo.querySelector("img")).toHaveAttribute("src", "/gnosis.svg");
        expect(within(footer).getByText("Explore Scripture. Discover Its Depth.")).toBeInTheDocument();
        expect(within(footer).getByText("© 2026 Gnosis. All rights reserved.")).toBeInTheDocument();
        expect(within(footer).getByRole("link", { name: "Bible & Commentary" })).toHaveAttribute("href", "/bible/Genesis/1");
        expect(
            within(footer).getByRole("link", { name: "About" }),
        ).toHaveAttribute("href", "/about");
        expect(
            within(footer).getByRole("link", { name: "Sign In" }),
        ).toHaveAttribute("href", "/login");
        expect(
            within(footer).getByRole("link", {
                name: "Create Account",
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

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    };
}

const LOGGED_IN = {
    sessionVersion: 1,
    user: {
        id: 1,
        first_name: "Test",
        last_name: "User",
        email: "test@example.invalid",
    },
    token: "test-token",
    isAuthenticated: true,
    isAuthLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
};

const SAVED_ROW = {
    user_id: 1,
    book_id: 2,
    chapter_number: 1,
    translation: "ESV",
    commentary_id: 3,
    verse_number: 5,
    updated_at: "2026-11-06T19:00:00.000Z",
    book: "Genesis",
};

describe("LandingPage Continue reading", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    // The hero is the only place the Continue button lives; other
    // sections link to the reader too, so scope every CTA query to it.
    function hero() {
        return screen.getByRole("region", {
            name: "Explore Scripture. Discover Its Depth.",
        });
    }

    test("offers the saved position back to a logged-in reader", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(SAVED_ROW)));

        renderLanding(LOGGED_IN);

        const link = await within(hero()).findByRole("link", {
            name: "Continue Reading →",
        });
        expect(link).toHaveAttribute(
            "href",
            "/bible/Genesis/1?translation=ESV&commentary=3&verse=5",
        );
        expect(within(link).getByText(/Genesis 1:5 · ESV/)).toBeInTheDocument();
        expect(link).toHaveAccessibleDescription("Genesis 1:5 · ESV");
        expect(link.querySelector(".landing-continue-subtitle")).toHaveTextContent("Genesis 1:5 · ESV");
        expect(within(hero()).queryByText(/Pick up where you left off/)).toBeNull();
        expect(link.querySelectorAll(".landing-continue-subtitle")).toHaveLength(1);
        expect(document.querySelectorAll("#landing-reading-location")).toHaveLength(1);
        expect(document.querySelector(".landing-continue-note")).toBeNull();
        expect(
            within(hero()).queryByRole("link", { name: "Start Exploring →" }),
        ).toBeNull();
    });

    test("keeps Start Exploring when nothing is saved yet", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(
            { error: "No saved reading position." },
            404,
        )));

        renderLanding(LOGGED_IN);

        expect(
            await within(hero()).findByRole("link", { name: "Start Exploring →" }),
        ).toHaveAttribute("href", "/bible/Genesis/1");
        expect(
            within(hero()).queryByRole("link", { name: "Continue Reading →" }),
        ).toBeNull();
    });

    test("never offers to continue for logged-out readers", async () => {
        const fetchMock = vi.fn(() => {
            throw new Error("fetch must not be called for guests");
        });
        vi.stubGlobal("fetch", fetchMock);

        renderLanding(LOGGED_OUT);

        expect(
            await within(hero()).findByRole("link", { name: "Start Exploring →" }),
        ).toHaveAttribute("href", "/bible/Genesis/1");
        expect(
            within(hero()).queryByRole("link", { name: "Continue Reading →" }),
        ).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
