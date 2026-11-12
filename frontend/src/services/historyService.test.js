// Service tests. These run against the production-mode generated
// directory (npm test generates published-only content first), so the
// published Creation event IS present: Genesis has one event and every
// other book is "Upcoming". Dev-mode loading is covered by the content-lib
// tests (which generate into temp dirs) and the local dev-flag preview.
import { describe, expect, it } from "vitest";
import {
    formatHistoryDateLabel,
    formatScriptureRange,
    getBook,
    getBookTitle,
    getEvent,
    getEventBySlug,
    listBooks,
    listEventsForBook,
    readerLinkFor,
    slugifyBookName,
} from "./historyService";

describe("formatScriptureRange", () => {
    it("renders a multi-chapter range with verses", () => {
        expect(formatScriptureRange({
            book: "Genesis", startChapter: 1, startVerse: 1, endChapter: 2, endVerse: 3,
        })).toBe("Genesis 1:1–2:3");
    });
    it("collapses a same-chapter verse range", () => {
        expect(formatScriptureRange({
            book: "Genesis", startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 31,
        })).toBe("Genesis 1:1–31");
    });
    it("renders whole chapters without verses", () => {
        expect(formatScriptureRange({
            book: "2 Kings", startChapter: 18, startVerse: null, endChapter: 19, endVerse: null,
        })).toBe("2 Kings 18–19");
    });
    it("renders a single whole chapter", () => {
        expect(formatScriptureRange({
            book: "Genesis", startChapter: 1, startVerse: null, endChapter: 1, endVerse: null,
        })).toBe("Genesis 1");
    });
    it("renders a single verse", () => {
        expect(formatScriptureRange({
            book: "Genesis", startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 1,
        })).toBe("Genesis 1:1");
    });
});

describe("slugifyBookName", () => {
    it("slugifies numbered and spaced books", () => {
        expect(slugifyBookName("1 Samuel")).toBe("1-samuel");
        expect(slugifyBookName("Song of Solomon")).toBe("song-of-solomon");
        expect(slugifyBookName("Psalms")).toBe("psalms");
        expect(slugifyBookName("2 Chronicles")).toBe("2-chronicles");
    });
});

describe("listBooks", () => {
    it("lists all 66 books, OT then NT", () => {
        const books = listBooks();
        expect(books).toHaveLength(66);
        expect(books.filter((book) => book.testament === "OT")).toHaveLength(39);
        expect(books.filter((book) => book.testament === "NT")).toHaveLength(27);
        expect(books[0].title).toBe("Genesis");
        expect(books[38].title).toBe("Malachi");
        expect(books[39].title).toBe("Matthew");
        expect(books[65].title).toBe("Revelation");
    });
    it("marks every book except Genesis Upcoming in a production build (one published event)", () => {
        const books = listBooks();
        const genesis = books.find((book) => book.id === "genesis");
        expect(genesis.eventCount).toBe(1);
        expect(genesis.hasEvents).toBe(true);
        const rest = books.filter((book) => book.id !== "genesis");
        expect(rest).toHaveLength(65);
        expect(rest.every((book) => book.eventCount === 0 && !book.hasEvents)).toBe(true);
    });
});

describe("book/event lookups in a production build", () => {
    it("resolves display names from slugs", () => {
        expect(getBookTitle("genesis")).toBe("Genesis");
        expect(getBookTitle("2-kings")).toBe("2 Kings");
        expect(getBookTitle("song-of-solomon")).toBe("Song of Solomon");
        expect(getBookTitle("not-a-book")).toBeNull();
    });
    it("returns the generated book, events, and event for Genesis", () => {
        const book = getBook("genesis");
        expect(book).not.toBeNull();
        expect(book.id).toBe("genesis");
        const events = listEventsForBook("genesis");
        expect(events).toHaveLength(1);
        expect(events[0].id).toBe("event-creation");
        expect(events[0].title).toBe("Creation");
        expect(getEvent("event-creation")).not.toBeNull();
        expect(getEvent("event-creation").title).toBe("Creation");
        expect(getEventBySlug("creation")).not.toBeNull();
        expect(getEventBySlug("creation").id).toBe("event-creation");
        // No other book has generated content yet.
        expect(getBook("exodus")).toBeNull();
        expect(listEventsForBook("exodus")).toEqual([]);
    });
});

describe("readerLinkFor", () => {
    it("targets the range start chapter and verse", () => {
        expect(readerLinkFor({
            book: "Genesis", startChapter: 1, startVerse: 1, endChapter: 2, endVerse: 3,
        })).toBe("/bible/Genesis/1?verse=1");
    });
    it("omits the verse param for whole-chapter ranges", () => {
        expect(readerLinkFor({
            book: "2 Kings", startChapter: 18, startVerse: null, endChapter: 19, endVerse: null,
        })).toBe("/bible/2%20Kings/18");
    });
    it("percent-encodes spaced book names (1 Samuel)", () => {
        expect(readerLinkFor({
            book: "1 Samuel", startChapter: 1, startVerse: null, endChapter: 1, endVerse: null,
        })).toBe("/bible/1%20Samuel/1");
    });
});

describe("formatHistoryDateLabel", () => {
    it("never renders a bare year for an unknown date", () => {
        expect(formatHistoryDateLabel({ type: "unknown", label: "No established date" }))
            .toBe("No established date");
    });
    it("labels established dates", () => {
        expect(formatHistoryDateLabel({ type: "established", label: "701 BCE" }))
            .toBe("701 BCE — Established");
    });
    it("labels approximate and proposed dates", () => {
        expect(formatHistoryDateLabel({ type: "approximate", label: "c. 13th century BCE" }))
            .toBe("c. 13th century BCE — Approximate");
        expect(formatHistoryDateLabel({ type: "proposed", label: "c. 1400 BCE" }))
            .toBe("c. 1400 BCE — Proposed");
    });
    it("names the traditional system", () => {
        expect(formatHistoryDateLabel({ type: "traditional", label: "c. 4004 BCE", traditionalSystem: "Ussher chronology" }))
            .toBe("c. 4004 BCE — Traditional (Ussher chronology)");
    });
});
