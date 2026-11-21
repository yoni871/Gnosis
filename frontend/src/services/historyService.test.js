// Service tests. These run against the production-mode generated
// directory (npm test generates published-only content first), so the
// published events ARE present: Genesis has ten events and every
// other book is "Upcoming". Dev-mode loading is covered by the content-lib
// tests (which generate into temp dirs) and the local dev-flag preview.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bookById, readTreeInventory } from "./historyTestHelpers";
import {
    buildBookTimeline,
    categorySlug,
    formatHistoryDateLabel,
    formatScriptureRange,
    getBook,
    getBookTitle,
    getBooksForCategory,
    getCategory,
    getCategoryBySlug,
    getEvent,
    getEventBySlug,
    getFirstPublishedEvent,
    listBookEntries,
    listBooks,
    listCategoriesForBook,
    listEventsForBook,
    loadCategorySections,
    readerLinkFor,
    slugifyBookName,
} from "./historyService";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoContentDir = path.resolve(here, "../content/history");

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
    it("marks every book except Genesis Upcoming in a production build (ten published events)", () => {
        const books = listBooks();
        const genesis = books.find((book) => book.id === "genesis");
        expect(genesis.eventCount).toBe(10);
        expect(genesis.hasEvents).toBe(true);
        const rest = books.filter((book) => book.id !== "genesis");
        expect(rest).toHaveLength(65);
        expect(rest.every((book) => book.eventCount === 0 && !book.hasEvents)).toBe(true);
    });
    it("reports four categories for Genesis, seven for Exodus, seven for Leviticus, nine for Numbers, ten for Deuteronomy, twelve for Joshua, and zero for every other book", () => {
        const books = listBooks();
        const genesis = books.find((book) => book.id === "genesis");
        expect(genesis.categoryCount).toBe(4);
        expect(genesis.hasCategories).toBe(true);
        const exodus = books.find((book) => book.id === "exodus");
        expect(exodus.categoryCount).toBe(7);
        expect(exodus.hasCategories).toBe(true);
        const leviticus = books.find((book) => book.id === "leviticus");
        expect(leviticus.categoryCount).toBe(7);
        expect(leviticus.hasCategories).toBe(true);
        const numbers = books.find((book) => book.id === "numbers");
        expect(numbers.categoryCount).toBe(9);
        expect(numbers.hasCategories).toBe(true);
        const deuteronomy = books.find((book) => book.id === "deuteronomy");
        expect(deuteronomy.categoryCount).toBe(10);
        expect(deuteronomy.hasCategories).toBe(true);
        const joshua = books.find((book) => book.id === "joshua");
        expect(joshua.categoryCount).toBe(12);
        expect(joshua.hasCategories).toBe(true);
        const rest = books.filter((book) => book.id !== "genesis" && book.id !== "exodus" && book.id !== "leviticus" && book.id !== "numbers" && book.id !== "deuteronomy" && book.id !== "joshua");
        expect(rest).toHaveLength(60);
        expect(rest.every((book) => book.categoryCount === 0 && !book.hasCategories)).toBe(true);
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
        expect(events).toHaveLength(10);
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
        expect(events[8].id).toBe("event-noahs-sacrifice-and-covenant");
        expect(events[8].title).toBe("Noah's Sacrifice and God's Covenant");
        expect(events[9].id).toBe("event-noah-and-his-sons");
        expect(events[9].title).toBe("Noah and His Sons");
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
        expect(getEvent("event-noahs-sacrifice-and-covenant")).not.toBeNull();
        expect(getEvent("event-noahs-sacrifice-and-covenant").title).toBe("Noah's Sacrifice and God's Covenant");
        expect(getEventBySlug("noahs-sacrifice-and-covenant")).not.toBeNull();
        expect(getEventBySlug("noahs-sacrifice-and-covenant").id).toBe("event-noahs-sacrifice-and-covenant");
        expect(getEvent("event-noah-and-his-sons")).not.toBeNull();
        expect(getEvent("event-noah-and-his-sons").title).toBe("Noah and His Sons");
        expect(getEventBySlug("noah-and-his-sons")).not.toBeNull();
        expect(getEventBySlug("noah-and-his-sons").id).toBe("event-noah-and-his-sons");
        // Exodus has generated content now (seven published categories, no events yet).
        expect(getBook("exodus")).toEqual({
            "entries": [
                {
                    "bookNote": "Exodus 1:1–4:31 tells of Israel's oppression in Egypt, the birth and early life of Moses, his flight to Midian, and God's call from the burning bush. No independently established date is assigned.",
                    "categoryId": "category-oppression-and-moses-early-life",
                    "kind": "category",
                    "narrativeOrder": 15
                },
                {
                    "bookNote": "Exodus 5:1–11:10 tells of Moses and Aaron before Pharaoh, the ten plagues, and Pharaoh's hardened refusal to let Israel go. No independently established date is assigned.",
                    "categoryId": "category-pharaoh-and-the-ten-plagues",
                    "kind": "category",
                    "narrativeOrder": 16
                },
                {
                    "bookNote": "Exodus 12:1–15:21 tells of the Passover, the exodus from Egypt, the crossing of the sea, and the song of Moses and Miriam. No independently established date is assigned.",
                    "categoryId": "category-passover-and-the-exodus",
                    "kind": "category",
                    "narrativeOrder": 17
                },
                {
                    "bookNote": "Exodus 15:22–18:27 tells of Israel's journey in the wilderness: the bitter water at Marah, manna and quail, water from the rock, the battle with Amalek, and Jethro's counsel. No independently established date is assigned.",
                    "categoryId": "category-israel-in-the-wilderness",
                    "kind": "category",
                    "narrativeOrder": 18
                },
                {
                    "bookNote": "Exodus 19:1–24:18 tells of Israel's arrival at Sinai, the covenant, the Ten Words, the Book of the Covenant, and the ratification of the covenant. No independently established date is assigned.",
                    "categoryId": "category-covenant-and-gods-law",
                    "kind": "category",
                    "narrativeOrder": 19
                },
                {
                    "bookNote": "Exodus 25:1–34:35 tells of the instructions for the tabernacle, the golden calf, the breaking and renewal of the covenant, and the second tablets. No independently established date is assigned.",
                    "categoryId": "category-tabernacle-and-israels-rebellion",
                    "kind": "category",
                    "narrativeOrder": 20
                },
                {
                    "bookNote": "Exodus 35:1–40:38 tells of the building of the tabernacle, its furnishing, and the glory of the LORD filling it. No independently established date is assigned.",
                    "categoryId": "category-building-the-tabernacle",
                    "kind": "category",
                    "narrativeOrder": 21
                }
            ],
            "id": "exodus",
            "introduction": "Exodus tells of Israel's deliverance from Egypt, the covenant at Sinai, and the dwelling of God among his people. Biblical History presents the passage alongside carefully qualified ancient cultural and literary context.",
            "testament": "OT",
            "title": "Exodus"
        });
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

describe("category lookups in a production build (twenty-seven categories published)", () => {
    it("strips the category- prefix for slugs, and leaves other ids alone", () => {
        expect(categorySlug("category-patriarchs")).toBe("patriarchs");
        expect(categorySlug("category-primeval-origins")).toBe("primeval-origins");
        expect(categorySlug("patriarchs")).toBe("patriarchs");
    });
    it("returns null for unknown categories, by id and by slug", () => {
        expect(getCategory("category-patriarchs")).toBeNull();
        expect(getCategoryBySlug("patriarchs")).toBeNull();
        expect(getCategory("category-primeval-origins")).toBeNull();
    });
    it("lists the four published categories for Genesis and the seven for Exodus, none for other books", () => {
        const categories = listCategoriesForBook("genesis");
        expect(categories.map((category) => category.id)).toEqual([
            "category-nations-and-babel",
            "category-abraham-and-sarah",
            "category-isaac-jacob-and-esau",
            "category-joseph-and-israel-in-egypt",
        ]);
        expect(categories.map((category) => category.narrativeOrder)).toEqual([11, 12, 13, 14]);
        const exodusCategories = listCategoriesForBook("exodus");
        expect(exodusCategories.map((category) => category.id)).toEqual([
            "category-oppression-and-moses-early-life",
            "category-pharaoh-and-the-ten-plagues",
            "category-passover-and-the-exodus",
            "category-israel-in-the-wilderness",
            "category-covenant-and-gods-law",
            "category-tabernacle-and-israels-rebellion",
            "category-building-the-tabernacle",
        ]);
        expect(exodusCategories.map((category) => category.narrativeOrder)).toEqual([15, 16, 17, 18, 19, 20, 21]);
        expect(exodusCategories.every((category) => category.status === "published")).toBe(true);
        expect(exodusCategories.every((category) => !("claims" in category) && !("review" in category))).toBe(true);
        expect(exodusCategories[0].sources).toEqual([
            "source-augustine-city-of-god",
            "source-bdb-lexicon",
            "source-bible-gateway-kjv",
            "source-bible-hub-interlinear",
            "source-bible-odyssey-moses",
            "source-calvin-harmony-of-the-law",
            "source-charles-jubilees",
            "source-clarke-commentary",
            "source-hoffmeier-out-of-egypt",
            "source-jfb-commentary",
            "source-josephus-antiquities",
            "source-jvl-kenite",
            "source-keil-delitzsch-exodus",
            "source-merneptah-stele",
            "source-nets-septuagint-exodus",
            "source-philo-life-of-moses",
            "source-sinuhe-gardiner",
        ]);
        expect(exodusCategories[1].sources).toEqual([
            "source-augustine-city-of-god",
            "source-bdb-lexicon",
            "source-bible-gateway-kjv",
            "source-bible-hub-interlinear",
            "source-bible-odyssey-plagues",
            "source-calvin-harmony-of-the-law",
            "source-calvin-romans",
            "source-charles-jubilees",
            "source-clarke-commentary",
            "source-ipuwer-papyrus",
            "source-jfb-commentary",
            "source-josephus-antiquities",
            "source-keil-delitzsch-exodus",
            "source-merneptah-stele",
            "source-nets-septuagint-exodus",
            "source-philo-life-of-moses",
        ]);
        expect(exodusCategories[2].sources).toEqual([
            "source-augustine-city-of-god",
            "source-bdb-lexicon",
            "source-bible-gateway-kjv",
            "source-bible-odyssey-passover",
            "source-biblicaltraining-exodus",
            "source-calvin-harmony-of-the-law",
            "source-charles-jubilees",
            "source-clarke-commentary",
            "source-hoffmeier-out-of-egypt",
            "source-jfb-commentary",
            "source-josephus-antiquities",
            "source-keil-delitzsch-exodus",
            "source-merneptah-stele",
            "source-nets-septuagint-exodus",
            "source-noegel-hidden-waters",
            "source-overstreet-red-sea-crossing",
            "source-philo-life-of-moses",
            "source-philo-questions-exodus",
        ]);
        expect(exodusCategories[3].sources).toEqual([
            "source-augustine-city-of-god",
            "source-bdb-lexicon",
            "source-bible-gateway-kjv",
            "source-bible-hub-interlinear",
            "source-biblicaltraining-exodus",
            "source-biblicaltraining-numbers",
            "source-calvin-harmony-of-the-law",
            "source-charles-jubilees",
            "source-clarke-commentary",
            "source-defoliart-insects-as-food-ch21",
            "source-jfb-commentary",
            "source-josephus-antiquities",
            "source-keil-delitzsch-exodus",
            "source-merneptah-stele",
            "source-nets-septuagint-exodus",
            "source-philo-life-of-moses",
            "source-sarna-exodus",
        ]);
        expect(exodusCategories[4].sources).toEqual([
            "source-augustine-city-of-god",
            "source-bdb-lexicon",
            "source-bible-gateway-kjv",
            "source-bible-hub-interlinear",
            "source-bible-odyssey-covenant",
            "source-calvin-harmony-of-the-law",
            "source-charles-jubilees",
            "source-clarke-commentary",
            "source-hammurabi-code",
            "source-jfb-commentary",
            "source-josephus-antiquities",
            "source-keil-delitzsch-exodus",
            "source-lucas-covenant-treaty-prophecy",
            "source-merneptah-stele",
            "source-nets-septuagint-exodus",
            "source-philo-decalogue",
            "source-philo-life-of-moses",
            "source-talmud-shabbat",
        ]);
        expect(exodusCategories[5].sources).toEqual([
            "source-augustine-city-of-god",
            "source-bdb-lexicon",
            "source-bible-gateway-kjv",
            "source-bible-odyssey-golden-calf",
            "source-biblicaltraining-exodus",
            "source-biblicaltraining-mount-sinai",
            "source-calvin-harmony-of-the-law",
            "source-charles-jubilees",
            "source-clarke-commentary",
            "source-jfb-commentary",
            "source-josephus-antiquities",
            "source-keil-delitzsch-exodus",
            "source-merneptah-stele",
            "source-nets-septuagint-exodus",
            "source-philo-life-of-moses",
        ]);
        expect(exodusCategories[6].sources).toEqual([
            "source-augustine-city-of-god",
            "source-bdb-lexicon",
            "source-bible-gateway-kjv",
            "source-calvin-harmony-of-the-law",
            "source-charles-jubilees",
            "source-clarke-commentary",
            "source-jfb-commentary",
            "source-josephus-antiquities",
            "source-keil-delitzsch-exodus",
            "source-merneptah-stele",
            "source-nets-septuagint-exodus",
            "source-philo-life-of-moses",
            "source-sarna-exodus",
            "source-timna-tent-shrine",
        ]);
        expect(exodusCategories[0].bookNote).toBe("Exodus 1:1–4:31 tells of Israel's oppression in Egypt, the birth and early life of Moses, his flight to Midian, and God's call from the burning bush. No independently established date is assigned.");
        expect(exodusCategories[1].bookNote).toBe("Exodus 5:1–11:10 tells of Moses and Aaron before Pharaoh, the ten plagues, and Pharaoh's hardened refusal to let Israel go. No independently established date is assigned.");
        expect(exodusCategories[2].bookNote).toBe("Exodus 12:1–15:21 tells of the Passover, the exodus from Egypt, the crossing of the sea, and the song of Moses and Miriam. No independently established date is assigned.");
        expect(exodusCategories[3].bookNote).toBe("Exodus 15:22–18:27 tells of Israel's journey in the wilderness: the bitter water at Marah, manna and quail, water from the rock, the battle with Amalek, and Jethro's counsel. No independently established date is assigned.");
        expect(exodusCategories[4].bookNote).toBe("Exodus 19:1–24:18 tells of Israel's arrival at Sinai, the covenant, the Ten Words, the Book of the Covenant, and the ratification of the covenant. No independently established date is assigned.");
        expect(exodusCategories[5].bookNote).toBe("Exodus 25:1–34:35 tells of the instructions for the tabernacle, the golden calf, the breaking and renewal of the covenant, and the second tablets. No independently established date is assigned.");
        expect(exodusCategories[6].bookNote).toBe("Exodus 35:1–40:38 tells of the building of the tabernacle, its furnishing, and the glory of the LORD filling it. No independently established date is assigned.");
        expect(listCategoriesForBook("not-a-book")).toEqual([]);
    });
    it("returns no books for an unknown category", () => {
        expect(getBooksForCategory("category-patriarchs")).toEqual([]);
    });
    it("returns null sections for an unknown category", async () => {
        await expect(loadCategorySections("category-patriarchs")).resolves.toBeNull();
    });
    it("listBookEntries is the mixed event-and-category timeline", () => {
        // Expected entries come from the source tree's book files; the
        // service reads the generated (published-only) content, so in a
        // production build every entry is included and the two agree.
        const tree = readTreeInventory(repoContentDir);
        const genesisBook = bookById(tree, "genesis");
        const exodusBook = bookById(tree, "exodus");
        const entries = listBookEntries("genesis");
        expect(entries).toHaveLength(genesisBook.entries.length);
        expect(entries.map((entry) => entry.id)).toEqual(
            genesisBook.entries.map((entry) => entry.eventId ?? entry.categoryId),
        );
        expect(entries.map((entry) => entry.kind)).toEqual(genesisBook.entries.map((entry) => entry.kind));
        expect(entries.map((entry) => entry.narrativeOrder)).toEqual(genesisBook.entries.map((entry) => entry.narrativeOrder));
        expect(entries[0].bookNote).toContain("Genesis 1:1");
        const exodusEntries = listBookEntries("exodus");
        expect(exodusEntries).toHaveLength(exodusBook.entries.length);
        expect(exodusEntries.map((entry) => entry.id)).toEqual(
            exodusBook.entries.map((entry) => entry.eventId ?? entry.categoryId),
        );
        expect(exodusEntries.map((entry) => entry.kind)).toEqual(exodusBook.entries.map((entry) => entry.kind));
        expect(exodusEntries.map((entry) => entry.narrativeOrder)).toEqual(exodusBook.entries.map((entry) => entry.narrativeOrder));
        expect(exodusEntries.every((entry) => entry.status === "published")).toBe(true);
        expect(listBookEntries("not-a-book")).toEqual([]);
    });
    it("buildBookTimeline is the same mixed list as listBookEntries", () => {
        expect(buildBookTimeline("genesis")).toEqual(listBookEntries("genesis"));
        expect(buildBookTimeline("exodus")).toEqual(listBookEntries("exodus"));
    });
});

// Fixture-based category tests. The generated category directory now
// holds the thirty-seven published categories (four Genesis, seven Exodus, seven Leviticus, nine Numbers, ten Deuteronomy),
// and Exodus itself is a real category-only book — but the positive
// paths below still run against fixture records, so the loader's sort
// and the service's lookups are exercised on records the test controls.
// This block
// writes fixture records into the generated directory, re-imports the
// service fresh so its eager globs pick them up, and deletes every
// fixture file afterwards — the manifest and the real book files are
// never touched, so no other test file can observe the fixtures except
// through the fixture book below.
//
// The fixture book is Judges, and it carries ONLY category entries —
// never an event entry. That keeps Judges event-less (no first
// published event, still a Coming Soon chip, still redirecting to the
// homepage), so the selector, index, and event-page tests are
// unaffected even if they import the service while the fixtures exist.
// Judges is used (not Joshua) because the fixture's beforeAll deletes
// the book file and afterAll never restores it — now that the real
// books/joshua.json exists it must not be deleted.
// True event+category interleaving in one book is therefore NOT covered
// here: the sort is one comparator over the unified entries array, and
// it is covered for events (Genesis, above) and for categories (below),
// with the interleaved case covered by the sitemap fixture tests.
describe("category fixtures (generated-content globs)", () => {
    const generatedDir = path.join(process.cwd(), "src", "generated", "history");
    const categoriesDir = path.join(generatedDir, "categories");
    const fixtureCategoryA = {
        id: "category-primeval-origins",
        title: "Primeval Origins",
        category: "category",
        status: "published",
        primaryScripture: { book: "Genesis", bookId: "genesis", startChapter: 1, startVerse: 1, endChapter: 2, endVerse: 3 },
        fullRange: { book: "Genesis", bookId: "genesis", startChapter: 1, startVerse: 1, endChapter: 11, endVerse: 32 },
        era: "primeval",
        date: { type: "unknown", label: "No established date", yearStart: null, yearEnd: null },
        locations: [],
        topics: [],
        relatedEvents: ["event-creation"],
        connections: [],
        sources: [],
        review: {},
    };
    const fixtureCategoryB = {
        id: "category-patriarchal-era",
        title: "The Patriarchal Era",
        category: "category",
        status: "published",
        primaryScripture: { book: "Genesis", bookId: "genesis", startChapter: 12, startVerse: 1, endChapter: 12, endVerse: 3 },
        fullRange: { book: "Genesis", bookId: "genesis", startChapter: 12, startVerse: 1, endChapter: 50, endVerse: 26 },
        era: "patriarchal",
        date: { type: "unknown", label: "No established date", yearStart: null, yearEnd: null },
        locations: [],
        topics: [],
        relatedEvents: [],
        connections: [],
        sources: [],
        review: {},
    };
    const fixtureMarkdown = [
        "## Overview",
        "",
        "Primeval origins overview prose. [^source-test-alpha]",
        "",
        "## Ancient World",
        "",
        "### Primeval stories and divine sovereignty",
        "",
        "Ancient world subsection prose. [^source-test-beta]",
        "",
        "## Why This Context Matters",
        "",
        "Why primeval origins matter prose. [^source-test-alpha]",
        "",
    ].join("\n");
    const fixtureBook = {
        id: "judges",
        title: "Judges",
        testament: "OT",
        introduction: "Fixture book: categories only, no events.",
        entries: [
            // Deliberately out of narrative order in the file: the
            // loader must sort by narrativeOrder, not file order.
            { kind: "category", categoryId: "category-patriarchal-era", narrativeOrder: 2, bookNote: "The patriarchal era in brief." },
            { kind: "category", categoryId: "category-primeval-origins", narrativeOrder: 1, bookNote: "The primeval era in brief." },
        ],
    };
    const fixturePaths = [
        path.join(categoriesDir, "category-primeval-origins.json"),
        path.join(categoriesDir, "category-patriarchal-era.json"),
        path.join(categoriesDir, "primeval-origins.md"),
        path.join(generatedDir, "books", "judges.json"),
    ];

    let svc;
    beforeAll(async () => {
        // Self-healing: a previous crashed run may have left fixtures
        // behind; remove them before writing fresh ones.
        for (const file of fixturePaths) rmSync(file, { force: true });
        mkdirSync(categoriesDir, { recursive: true });
        writeFileSync(fixturePaths[0], JSON.stringify(fixtureCategoryA, null, 2));
        writeFileSync(fixturePaths[1], JSON.stringify(fixtureCategoryB, null, 2));
        writeFileSync(fixturePaths[2], fixtureMarkdown);
        writeFileSync(fixturePaths[3], JSON.stringify(fixtureBook, null, 2));
        // Fresh module instance: the service reads the generated globs
        // once at import time, so the fixtures must exist first. The
        // query string forces Vite to re-transform the module — without
        // it, the cached transform keeps the stale (pre-fixture) glob
        // expansion even after vi.resetModules().
        vi.resetModules();
        svc = await import("./historyService?category-fixture");
    });
    afterAll(() => {
        for (const file of fixturePaths) rmSync(file, { force: true });
    });

    it("resolves a fixture category by id and by slug", () => {
        expect(svc.getCategory("category-primeval-origins")).toEqual(fixtureCategoryA);
        expect(svc.getCategoryBySlug("primeval-origins")).toEqual(fixtureCategoryA);
        expect(svc.getCategory("category-patriarchal-era")).toEqual(fixtureCategoryB);
        expect(svc.categorySlug("category-patriarchal-era")).toBe("patriarchal-era");
        expect(svc.getCategory("category-no-such")).toBeNull();
    });
    it("lists the fixture book's categories in narrative order, not file order", () => {
        const categories = svc.listCategoriesForBook("judges");
        expect(categories.map((category) => category.id)).toEqual([
            "category-primeval-origins",
            "category-patriarchal-era",
        ]);
        expect(categories[0].bookNote).toBe("The primeval era in brief.");
        expect(categories[0].narrativeOrder).toBe(1);
        expect(categories[1].bookNote).toBe("The patriarchal era in brief.");
        expect(categories[1].narrativeOrder).toBe(2);
        // The fresh module instance still sees the real generated
        // content: Genesis carries its four published categories.
        expect(svc.listCategoriesForBook("genesis").map((category) => category.id)).toEqual([
            "category-nations-and-babel",
            "category-abraham-and-sarah",
            "category-isaac-jacob-and-esau",
            "category-joseph-and-israel-in-egypt",
        ]);
    });
    it("listBookEntries tags each entry with its kind and narrative order", () => {
        const entries = svc.listBookEntries("judges");
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ id: "category-primeval-origins", kind: "category", narrativeOrder: 1 });
        expect(entries[1]).toMatchObject({ id: "category-patriarchal-era", kind: "category", narrativeOrder: 2 });
        expect(svc.buildBookTimeline("judges")).toEqual(entries);
    });
    it("finds the books carrying a fixture category", () => {
        const books = svc.getBooksForCategory("category-primeval-origins");
        expect(books.map((book) => book.id)).toEqual(["judges"]);
        expect(svc.getBooksForCategory("category-no-such")).toEqual([]);
    });
    it("loads a fixture category's sections with continuous footnote numbering", async () => {
        const sections = await svc.loadCategorySections("category-primeval-origins");
        expect(sections).not.toBeNull();
        expect(sections.overview.markdown).toContain("Primeval origins overview prose.");
        expect(sections.overview.markdown).toContain("[1](#source-source-test-alpha)");
        expect(sections.ancientWorldSubsections).toHaveLength(1);
        expect(sections.ancientWorldSubsections[0].heading).toBe("Primeval stories and divine sovereignty");
        expect(sections.ancientWorldSubsections[0].markdown).toContain("[2](#source-source-test-beta)");
        // The same source cited again in Why It Matters keeps its first
        // number instead of restarting at 1.
        expect(sections.whyItMatters.markdown).toContain("[1](#source-source-test-alpha)");
        expect(sections.whyItMatters.markdown).toContain("Why primeval origins matter prose.");
        await expect(svc.loadCategorySections("category-no-such")).resolves.toBeNull();
    });
});
