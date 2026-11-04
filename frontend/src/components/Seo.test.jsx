import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import Seo from "./Seo";

function metaContent(attr, value) {
    return document.head
        .querySelector(`meta[${attr}="${value}"]`)
        ?.getAttribute("content");
}

function canonicalHref() {
    return document.head
        .querySelector('link[rel="canonical"]')
        ?.getAttribute("href");
}

describe("Seo", () => {
    test("sets the title, description, canonical, and Open Graph tags", () => {
        render(
            <Seo
                title="Psalm 23 Commentary & Bible Study | Gnosis"
                description="Study Psalm 23 verse by verse on Gnosis."
                canonical="https://studygnosis.com/bible/Psalms/23"
                ogType="article"
            />,
        );

        expect(document.title).toBe(
            "Psalm 23 Commentary & Bible Study | Gnosis",
        );
        expect(metaContent("name", "description")).toBe(
            "Study Psalm 23 verse by verse on Gnosis.",
        );
        expect(metaContent("name", "robots")).toBe("index, follow");
        expect(metaContent("property", "og:title")).toBe(
            "Psalm 23 Commentary & Bible Study | Gnosis",
        );
        expect(metaContent("property", "og:type")).toBe("article");
        expect(metaContent("property", "og:url")).toBe(
            "https://studygnosis.com/bible/Psalms/23",
        );
        expect(canonicalHref()).toBe(
            "https://studygnosis.com/bible/Psalms/23",
        );
    });

    test("supports ogImage, twitterCard, and JSON-LD, and clears them when removed", () => {
        const { rerender } = render(
            <Seo
                title="Gnosis | Bible Study & Verse-by-Verse Commentary"
                description="Study Scripture with Gnosis."
                canonical="https://studygnosis.com/"
                ogImage="https://studygnosis.com/images/landing/hero-1200.jpg"
                twitterCard="summary_large_image"
                jsonLd={{
                    "@context": "https://schema.org",
                    "@type": "WebSite",
                    name: "Gnosis",
                    url: "https://studygnosis.com/",
                }}
            />,
        );

        expect(metaContent("property", "og:image")).toBe(
            "https://studygnosis.com/images/landing/hero-1200.jpg",
        );
        expect(metaContent("name", "twitter:image")).toBe(
            "https://studygnosis.com/images/landing/hero-1200.jpg",
        );
        expect(metaContent("name", "twitter:card")).toBe(
            "summary_large_image",
        );
        const script = document.head.querySelector(
            'script[type="application/ld+json"]',
        );
        expect(JSON.parse(script.textContent)).toMatchObject({
            "@type": "WebSite",
            name: "Gnosis",
        });

        rerender(
            <Seo
                title="Log in | Gnosis"
                description="Log in to Gnosis."
                canonical="https://studygnosis.com/login"
                robots="noindex, nofollow"
            />,
        );

        // Navigating away must not leave the previous page's social
        // image or structured data behind.
        expect(
            document.head.querySelector('meta[property="og:image"]'),
        ).toBeNull();
        expect(
            document.head.querySelector('meta[name="twitter:image"]'),
        ).toBeNull();
        expect(metaContent("name", "twitter:card")).toBe("summary");
        expect(
            document.head.querySelector(
                'script[type="application/ld+json"]',
            ),
        ).toBeNull();
    });

    test("supports noindex pages and replaces prior tags on navigation", () => {
        const { rerender } = render(
            <Seo
                title="Psalm 23 Commentary & Bible Study | Gnosis"
                description="Study Psalm 23 verse by verse on Gnosis."
                canonical="https://studygnosis.com/bible/Psalms/23"
            />,
        );

        rerender(
            <Seo
                title="Log in | Gnosis"
                description="Log in to Gnosis."
                canonical="https://studygnosis.com/login"
                robots="noindex, nofollow"
            />,
        );

        expect(document.title).toBe("Log in | Gnosis");
        expect(metaContent("name", "robots")).toBe("noindex, nofollow");
        expect(canonicalHref()).toBe("https://studygnosis.com/login");
        // Upsert, never append: exactly one canonical link survives.
        expect(
            document.head.querySelectorAll('link[rel="canonical"]').length,
        ).toBe(1);
    });
});
