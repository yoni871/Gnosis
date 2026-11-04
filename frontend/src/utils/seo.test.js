import { describe, expect, test } from "vitest";

import {
    chapterDescription,
    chapterDisplayName,
    chapterPath,
    chapterTitle,
    chapterUrl,
    getSiteUrl,
    pageUrl,
} from "./seo";

describe("getSiteUrl", () => {
    test("defaults to the production site when no build-time URL is set", () => {
        expect(getSiteUrl()).toBe("https://studygnosis.com");
    });
});

describe("chapterDisplayName", () => {
    test("uses the singular reference form for Psalms", () => {
        expect(chapterDisplayName("Psalms")).toBe("Psalm");
    });

    test("leaves other book names unchanged", () => {
        expect(chapterDisplayName("Isaiah")).toBe("Isaiah");
        expect(chapterDisplayName("1 Samuel")).toBe("1 Samuel");
    });
});

describe("chapterPath", () => {
    test("percent-encodes book names with spaces", () => {
        expect(chapterPath("1 Samuel", 3)).toBe("/bible/1%20Samuel/3");
    });

    test("never carries query parameters", () => {
        expect(chapterPath("Genesis", 1)).toBe("/bible/Genesis/1");
    });
});

describe("chapterUrl", () => {
    test("builds the absolute canonical chapter URL", () => {
        expect(chapterUrl("Psalms", 23)).toBe(
            "https://studygnosis.com/bible/Psalms/23",
        );
    });
});

describe("chapterTitle", () => {
    test("matches the Psalm 23 example title", () => {
        expect(chapterTitle("Psalms", 23)).toBe(
            "Psalm 23 Commentary & Bible Study | Gnosis",
        );
    });

    test("uses the same template for every chapter", () => {
        expect(chapterTitle("Romans", 8)).toBe(
            "Romans 8 Commentary & Bible Study | Gnosis",
        );
        expect(chapterTitle("Isaiah", 53)).toBe(
            "Isaiah 53 Commentary & Bible Study | Gnosis",
        );
    });
});

describe("chapterDescription", () => {
    test("is unique per chapter and names the chapter", () => {
        expect(chapterDescription("Psalms", 23)).toBe(
            "Study Psalm 23 verse by verse on Gnosis, with the " +
                "Scripture text and classic Bible commentary to help " +
                "you understand God\u2019s Word.",
        );
        expect(chapterDescription("Psalms", 24)).not.toBe(
            chapterDescription("Psalms", 23),
        );
    });

    test("claims only features the reader actually has", () => {
        const description = chapterDescription("Genesis", 1);
        expect(description).not.toMatch(/Matthew Henry|Jamieson/);
    });
});

describe("pageUrl", () => {
    test("builds absolute URLs for non-chapter pages", () => {
        expect(pageUrl("/login")).toBe("https://studygnosis.com/login");
    });
});
