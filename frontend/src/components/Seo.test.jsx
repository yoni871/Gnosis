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
