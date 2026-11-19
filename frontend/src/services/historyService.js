// Biblical History content loader.
//
// The only module that imports content — and it imports ONLY from the
// generated published-only directory (frontend/src/generated/history/),
// never from the source content tree (frontend/src/content/history/).
// The build script (scripts/build-history-content.js) validates the source
// tree and generates only `published` records there, so what is not
// generated cannot be bundled. Components never import a .md or content
// .json file directly.
//
// No API calls: the book list, chapter counts, and testament grouping come
// from the static frontend/src/data/bibleChapters.json manifest, so History
// pages work with the backend down.

import bibleChapters from "../data/bibleChapters.json";
import { chapterPath } from "../utils/seo";
import {
    slugifyBookName,
    formatScriptureRange,
    parseHistoryMarkdown,
    resolveHistoryFootnotes,
} from "../utils/historyContent";

export { slugifyBookName, formatScriptureRange };

// The manifest lists Old Testament books first (Genesis–Malachi) and New
// Testament books last (Matthew–Revelation), in canonical order.
const BOOK_NAMES = Object.keys(bibleChapters);
const OLD_TESTAMENT_COUNT = 39;

function eagerValues(modules) {
    return Object.entries(modules).map(([key, mod]) => ({
        key,
        value: mod && mod.default !== undefined ? mod.default : mod,
    }));
}

// Generated content, read once at module load. In a production build the
// directory holds only published records; with zero published records
// every glob matches nothing and every list is empty.
const generatedBooks = new Map();
for (const { value } of eagerValues(
    import.meta.glob("../generated/history/books/*.json", { eager: true }),
)) {
    if (value && typeof value.id === "string") generatedBooks.set(value.id, value);
}
const generatedEvents = new Map();
for (const { value } of eagerValues(
    import.meta.glob("../generated/history/events/*.json", { eager: true }),
)) {
    if (value && typeof value.id === "string") generatedEvents.set(value.id, value);
}
// Event prose is code-split per event and fetched only when its study page opens.
const eventMarkdownLoaders = import.meta.glob("../generated/history/events/*.md", {
    query: "?raw",
    import: "default",
});
// Generated categories, read once at module load like the events above.
// The generated book records carry a unified `entries` array (kind
// "event" | "category"); a category entry's categoryId resolves here.
const generatedCategories = new Map();
for (const { value } of eagerValues(
    import.meta.glob("../generated/history/categories/*.json", { eager: true }),
)) {
    if (value && typeof value.id === "string") generatedCategories.set(value.id, value);
}
// Category prose is code-split per category, like event prose.
const categoryMarkdownLoaders = import.meta.glob("../generated/history/categories/*.md", {
    query: "?raw",
    import: "default",
});
const generatedTopics = new Map();
for (const { value } of eagerValues(
    import.meta.glob("../generated/history/topics/*/*.json", { eager: true }),
)) {
    if (value && typeof value.id === "string") generatedTopics.set(value.id, value);
}
let generatedSources = {};
for (const { value } of eagerValues(
    import.meta.glob("../generated/history/sources.json", { eager: true }),
)) {
    if (value && typeof value === "object") generatedSources = value;
}

export function listBooks() {
    return BOOK_NAMES.map((title, index) => {
        const id = slugifyBookName(title);
        const generated = generatedBooks.get(id);
        // The generated book record carries a unified `entries` array
        // (kind "event" | "category"); both counts come from it.
        const entries = generated?.entries ?? [];
        const eventCount = entries.filter((entry) => entry.kind === "event").length;
        const categoryCount = entries.filter((entry) => entry.kind === "category").length;
        return {
            id,
            title,
            testament: index < OLD_TESTAMENT_COUNT ? "OT" : "NT",
            chapterCount: bibleChapters[title],
            eventCount,
            hasEvents: eventCount > 0,
            categoryCount,
            hasCategories: categoryCount > 0,
        };
    });
}

export function getBook(bookId) {
    const generated = generatedBooks.get(bookId);
    if (!generated) return null;
    return generated;
}

export function getBookTitle(bookId) {
    const name = BOOK_NAMES.find((title) => slugifyBookName(title) === bookId);
    return name ?? null;
}

// Events for one book, in narrative order (the book file's narrativeOrder
// drives the timeline — never a date). Reads the unified `entries` array,
// kind === "event".
export function listEventsForBook(bookId) {
    const book = generatedBooks.get(bookId);
    if (!book) return [];
    return [...(book.entries ?? [])]
        .filter((entry) => entry.kind === "event")
        .sort((a, b) => a.narrativeOrder - b.narrativeOrder)
        .map((entry) => {
            const event = generatedEvents.get(entry.eventId);
            if (!event) return null;
            return { ...event, bookNote: entry.bookNote, narrativeOrder: entry.narrativeOrder };
        })
        .filter(Boolean);
}

// Categories for one book, in narrative order — the mirror of
// listEventsForBook over kind === "category" entries.
export function listCategoriesForBook(bookId) {
    const book = generatedBooks.get(bookId);
    if (!book) return [];
    return [...(book.entries ?? [])]
        .filter((entry) => entry.kind === "category")
        .sort((a, b) => a.narrativeOrder - b.narrativeOrder)
        .map((entry) => {
            const category = generatedCategories.get(entry.categoryId);
            if (!category) return null;
            return { ...category, bookNote: entry.bookNote, narrativeOrder: entry.narrativeOrder };
        })
        .filter(Boolean);
}

// The book's mixed timeline: every entry in narrative order, each
// resolved to its event or category record and tagged with its kind.
// Unresolvable entries are skipped, as listEventsForBook does.
export function listBookEntries(bookId) {
    const book = generatedBooks.get(bookId);
    if (!book) return [];
    return [...(book.entries ?? [])]
        .sort((a, b) => a.narrativeOrder - b.narrativeOrder)
        .map((entry) => {
            const record = entry.kind === "category"
                ? generatedCategories.get(entry.categoryId)
                : entry.kind === "event"
                    ? generatedEvents.get(entry.eventId)
                    : undefined;
            if (!record) return null;
            return { ...record, kind: entry.kind, bookNote: entry.bookNote, narrativeOrder: entry.narrativeOrder };
        })
        .filter(Boolean);
}

// First published event for a book, in narrative order — the book's
// landing event now that the book URL redirects to it (see
// BiblicalHistoryBookRedirect). Null when the book has no published
// events: such books redirect to the homepage, where they are marked
// Coming Soon, instead of redirecting to an event that does not exist.
export function getFirstPublishedEvent(bookId) {
    const events = listEventsForBook(bookId);
    return events.length > 0 ? events[0] : null;
}

export function buildBookTimeline(bookId) {
    // Category-aware mixed timeline: events and categories interleaved
    // in narrative order.
    return listBookEntries(bookId);
}

export function getEvent(eventId) {
    return generatedEvents.get(eventId) ?? null;
}

export function getEventBySlug(eventSlug) {
    return getEvent(`event-${eventSlug}`);
}

export function eventSlug(eventId) {
    return String(eventId).replace(/^event-/, "");
}

export function getCategory(categoryId) {
    return generatedCategories.get(categoryId) ?? null;
}

export function getCategoryBySlug(slug) {
    return getCategory(`category-${slug}`);
}

export function categorySlug(categoryId) {
    return String(categoryId).replace(/^category-/, "");
}

export function getTopic(topicId) {
    return generatedTopics.get(topicId) ?? null;
}

export function getSource(sourceId) {
    return generatedSources[sourceId] ?? null;
}

export function listSources() {
    return Object.values(generatedSources);
}

// Every book that carries this event (for the cross-book connection chips).
export function getBooksForEvent(eventId) {
    const books = [];
    for (const book of generatedBooks.values()) {
        if ((book.entries ?? []).some((entry) => entry.kind === "event" && entry.eventId === eventId)) books.push(book);
    }
    return books;
}

// Every book that carries this category — the mirror of getBooksForEvent
// over kind === "category" entries.
export function getBooksForCategory(categoryId) {
    const books = [];
    for (const book of generatedBooks.values()) {
        if ((book.entries ?? []).some((entry) => entry.kind === "category" && entry.categoryId === categoryId)) books.push(book);
    }
    return books;
}

// Load one event's prose and split it into its contract sections, with
// [^source-id] footnotes resolved to numbered links into the sources list.
export async function loadEventSections(eventId) {
    const slug = eventSlug(eventId);
    const loader = eventMarkdownLoaders[`../generated/history/events/${slug}.md`];
    if (!loader) return null;
    const mdText = await loader();
    const parsed = parseHistoryMarkdown(mdText);
    const known = Object.keys(generatedSources);
    // One shared footnote list threads through every section so footnote
    // numbers run continuously through the event instead of restarting
    // at 1 in each section (editorial fix, 2026-11-11).
    const footnotes = [];
    return {
        overview: resolveHistoryFootnotes(parsed.overview, known, footnotes),
        ancientWorld: resolveHistoryFootnotes(parsed.ancientWorld, known, footnotes),
        ancientWorldSubsections: parsed.ancientWorldSubsections.map((sub) => ({
            heading: sub.heading,
            ...resolveHistoryFootnotes(sub.body, known, footnotes),
        })),
        whyItMatters: resolveHistoryFootnotes(parsed.whyItMatters, known, footnotes),
    };
}

// Load one category's prose and split it into its contract sections —
// the mirror of loadEventSections over the category Markdown loaders,
// with the same three sections and the same shared continuous footnote
// numbering. A category's fullRange is never used here (and never passed
// to the companion): the companion passage is always primaryScripture,
// chosen by the study page.
export async function loadCategorySections(categoryId) {
    const slug = categorySlug(categoryId);
    const loader = categoryMarkdownLoaders[`../generated/history/categories/${slug}.md`];
    if (!loader) return null;
    const mdText = await loader();
    const parsed = parseHistoryMarkdown(mdText);
    const known = Object.keys(generatedSources);
    // One shared footnote list threads through every section so footnote
    // numbers run continuously through the category instead of restarting
    // at 1 in each section (editorial fix, 2026-11-11).
    const footnotes = [];
    return {
        overview: resolveHistoryFootnotes(parsed.overview, known, footnotes),
        ancientWorld: resolveHistoryFootnotes(parsed.ancientWorld, known, footnotes),
        ancientWorldSubsections: parsed.ancientWorldSubsections.map((sub) => ({
            heading: sub.heading,
            ...resolveHistoryFootnotes(sub.body, known, footnotes),
        })),
        whyItMatters: resolveHistoryFootnotes(parsed.whyItMatters, known, footnotes),
    };
}

// Reader links target the range's START chapter and verse (the About page
// pattern): chapterPath handles the encoding, so History never hand-builds
// a /bible/… string. No translation param — the reader applies its own
// default or the reader's saved preference.
export function readerLinkFor(ref) {
    if (!ref) return null;
    const to = chapterPath(ref.book, ref.startChapter);
    return ref.startVerse !== null && ref.startVerse !== undefined
        ? `${to}?verse=${ref.startVerse}`
        : to;
}

// A date label is not a confidence label: the date axis renders through
// this helper only, with the uncertainty class always stated as text.
export function formatHistoryDateLabel(date) {
    if (!date) return "";
    switch (date.type) {
        case "established":
            return `${date.label} — Established`;
        case "approximate":
            return `${date.label} — Approximate`;
        case "traditional":
            return date.traditionalSystem
                ? `${date.label} — Traditional (${date.traditionalSystem})`
                : `${date.label} — Traditional`;
        case "proposed":
            return `${date.label} — Proposed`;
        case "unknown":
        default:
            return "No established date";
    }
}
