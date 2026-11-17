// Service tests. These run against the production-mode generated
// directory (npm test generates published-only content first), so the
// published events ARE present: Genesis has eight events and every
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
    getFirstPublishedEvent,
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
    it("marks every book except Genesis Upcoming in a production build (eight published events)", () => {
        const books = listBooks();
        const genesis = books.find((book) => book.id === "genesis");
        expect(genesis.eventCount).toBe(8);
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
        expect(events).toHaveLength(8);
        expect(events[0].id).toBe("event-creation");
        expect(events[0].title).toBe("Creation");
        expect(events[1].id).toBe("event-adam-and-eve");
        expect(events[1].title).toBe("Adam and Eve");
        expect(events[2].id).toBe("event-cain-and-abel");
        expect(events[2].title).toBe("Cain and Abel");
        expect(events[3].id).toBe("event-cains-descendants");
        expect(events[3].title).toBe("Cain's Descendants");
        expect(events[4].id).toBe("event-seth-early-generations");
        expect(events[4].title).toBe("Seth and the Early Generations");
        expect(events[5].id).toBe("event-humanitys-corruption");
        expect(events[5].title).toBe("Humanity's Corruption");
        expect(events[6].id).toBe("event-noah-ark");
        expect(events[6].title).toBe("Noah and the Ark");
        expect(events[7].id).toBe("event-great-flood");
        expect(events[7].title).toBe("The Great Flood");
        expect(getEvent("event-creation")).not.toBeNull();
        expect(getEvent("event-creation").title).toBe("Creation");
        expect(getEventBySlug("creation")).not.toBeNull();
        expect(getEventBySlug("creation").id).toBe("event-creation");
        expect(getEvent("event-adam-and-eve")).not.toBeNull();
        expect(getEvent("event-adam-and-eve").title).toBe("Adam and Eve");
        expect(getEventBySlug("adam-and-eve")).not.toBeNull();
        expect(getEventBySlug("adam-and-eve").id).toBe("event-adam-and-eve");
        expect(getEvent("event-cain-and-abel")).not.toBeNull();
        expect(getEvent("event-cain-and-abel").title).toBe("Cain and Abel");
        expect(getEventBySlug("cain-and-abel")).not.toBeNull();
        expect(getEventBySlug("cain-and-abel").id).toBe("event-cain-and-abel");
        expect(getEvent("event-cains-descendants")).not.toBeNull();
        expect(getEvent("event-cains-descendants").title).toBe("Cain's Descendants");
        expect(getEventBySlug("cains-descendants")).not.toBeNull();
        expect(getEventBySlug("cains-descendants").id).toBe("event-cains-descendants");
        expect(getEvent("event-seth-early-generations")).not.toBeNull();
        expect(getEvent("event-seth-early-generations").title).toBe("Seth and the Early Generations");
        expect(getEventBySlug("seth-early-generations")).not.toBeNull();
        expect(getEventBySlug("seth-early-generations").id).toBe("event-seth-early-generations");
        expect(getEvent("event-humanitys-corruption")).not.toBeNull();
        expect(getEvent("event-humanitys-corruption").title).toBe("Humanity's Corruption");
        expect(getEventBySlug("humanitys-corruption")).not.toBeNull();
        expect(getEventBySlug("humanitys-corruption").id).toBe("event-humanitys-corruption");
        expect(getEvent("event-noah-ark")).not.toBeNull();
        expect(getEvent("event-noah-ark").title).toBe("Noah and the Ark");
        expect(getEventBySlug("noah-ark")).not.toBeNull();
        expect(getEventBySlug("noah-ark").id).toBe("event-noah-ark");
        expect(getEvent("event-great-flood")).not.toBeNull();
        expect(getEvent("event-great-flood").title).toBe("The Great Flood");
        expect(getEventBySlug("great-flood")).not.toBeNull();
        expect(getEventBySlug("great-flood").id).toBe("event-great-flood");
        // No other book has generated content yet.
        expect(getBook("exodus")).toBeNull();
        expect(listEventsForBook("exodus")).toEqual([]);
    });
});

describe("getFirstPublishedEvent", () => {
    it("returns the first published event by narrative order for Genesis", () => {
        const first = getFirstPublishedEvent("genesis");
        expect(first).not.toBeNull();
        expect(first.id).toBe("event-creation");
        expect(first.title).toBe("Creation");
    });
    it("returns null for a book with no published events and for an unknown book", () => {
        expect(getFirstPublishedEvent("exodus")).toBeNull();
        expect(getFirstPublishedEvent("revelation")).toBeNull();
        expect(getFirstPublishedEvent("not-a-book")).toBeNull();
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
