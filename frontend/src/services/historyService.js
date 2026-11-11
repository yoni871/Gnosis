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
// Event prose is code-split per event and fetched only when its panel opens.
const eventMarkdownLoaders = import.meta.glob("../generated/history/events/*.md", {
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
        return {
            id,
            title,
            testament: index < OLD_TESTAMENT_COUNT ? "OT" : "NT",
            chapterCount: bibleChapters[title],
            eventCount: generated ? generated.events.length : 0,
            hasEvents: Boolean(generated && generated.events.length > 0),
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
// drives the timeline — never a date).
export function listEventsForBook(bookId) {
    const book = generatedBooks.get(bookId);
    if (!book) return [];
    return [...book.events]
        .sort((a, b) => a.narrativeOrder - b.narrativeOrder)
        .map((entry) => {
            const event = generatedEvents.get(entry.eventId);
            if (!event) return null;
            return { ...event, bookNote: entry.bookNote, narrativeOrder: entry.narrativeOrder };
        })
        .filter(Boolean);
}

export function buildBookTimeline(bookId) {
    return listEventsForBook(bookId);
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
        if (book.events.some((entry) => entry.eventId === eventId)) books.push(book);
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
    return {
        overview: resolveHistoryFootnotes(parsed.overview, known),
        ancientWorld: resolveHistoryFootnotes(parsed.ancientWorld, known),
        ancientWorldSubsections: parsed.ancientWorldSubsections.map((sub) => ({
            heading: sub.heading,
            ...resolveHistoryFootnotes(sub.body, known),
        })),
        whyItMatters: resolveHistoryFootnotes(parsed.whyItMatters, known),
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
