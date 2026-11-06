import { describe, expect, test } from "vitest";

import { readingStateLabel, readingStateUrl } from "./readingState";

const GENESIS_ESV = {
    book: "Genesis",
    chapter_number: 1,
    translation: "ESV",
    commentary_id: 3,
    verse_number: 5,
};

describe("readingStateUrl", () => {
    test("restores the exact spot: chapter, translation, commentary, and verse", () => {
        expect(readingStateUrl(GENESIS_ESV)).toBe(
            "/bible/Genesis/1?translation=ESV&commentary=3&verse=5",
        );
    });

    test("omits commentary and verse when none was saved", () => {
        expect(readingStateUrl({
            ...GENESIS_ESV,
            commentary_id: null,
            verse_number: null,
        })).toBe("/bible/Genesis/1?translation=ESV");
    });

    test("encodes book names with spaces", () => {
        expect(readingStateUrl({
            ...GENESIS_ESV,
            book: "1 John",
            chapter_number: 3,
        })).toBe("/bible/1%20John/3?translation=ESV&commentary=3&verse=5");
    });
});

describe("readingStateLabel", () => {
    test("names the chapter and translation", () => {
        expect(readingStateLabel(GENESIS_ESV)).toBe("Genesis 1 · ESV");
    });

    test("uses the display name for Psalms", () => {
        expect(readingStateLabel({
            ...GENESIS_ESV,
            book: "Psalms",
            chapter_number: 23,
        })).toBe("Psalm 23 · ESV");
    });
});
