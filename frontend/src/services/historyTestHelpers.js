// Test-only inventory helpers for the Biblical History content tests.
//
// These read the canonical input — the source tree itself
// (categories/*.json, events/*.json, topics/*.json, books/*.json,
// sources/references.json) — never the generator's output. The generated
// manifest is the output under test, so expectations must NOT be derived
// from it: this code path shares nothing with `generateHistoryContent`
// (different module, no import from it), so a generator bug that drops a
// published record still fails the test — the tree-derived list and the
// generated manifest would differ. This is the same independence the old
// hardcoded lists had; it only removes the hand-maintained copy of them.
//
// Imports only node:fs / node:path. Do NOT import the generator, the
// validator, or the gate from here — that would defeat the independence
// above.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

function listJsonFiles(dir) {
    // Mirrors history-content-lib's listFilesRecursive: recursive, sorted.
    if (!existsSync(dir)) return [];
    const out = [];
    const walk = (current) => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
        }
    };
    walk(dir);
    return out.sort();
}

function readRecord(file) {
    try {
        const data = JSON.parse(readFileSync(file, "utf8"));
        if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
        if (typeof data.id !== "string") return null;
        return data;
    } catch {
        // Invalid JSON is the validator's job, not the helper's.
        return null;
    }
}

function readRecords(dir) {
    const records = [];
    for (const file of listJsonFiles(dir)) {
        const record = readRecord(file);
        if (record) records.push(record);
    }
    return records;
}

function readRegistry(contentDir) {
    try {
        const data = JSON.parse(readFileSync(path.join(contentDir, "sources", "references.json"), "utf8"));
        return data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
    } catch {
        return {};
    }
}

// Reads the source tree into an inventory object:
//   { events, categories, topics, books, sources }
// events / categories / topics are the parsed record objects (id, status,
// title, sources, ...), in sorted-filename order. books are the parsed
// book objects with a SYNTHESIZED status (the source files carry none):
// "published" when at least one entry resolves to a published record,
// "in-review" when at least one entry resolves to an in-review record and
// none is published, "draft" otherwise. That mirrors the generator's rule
// that a book enters the published manifest only when it has at least one
// included entry, so publishedIds(tree.books) / includedIds(tree.books)
// work exactly like the record lists. sources is the registry dict.
export function readTreeInventory(contentDir) {
    const events = readRecords(path.join(contentDir, "events"));
    const topics = readRecords(path.join(contentDir, "topics"));
    const categories = readRecords(path.join(contentDir, "categories"));
    const sources = readRegistry(contentDir);
    const statusById = new Map();
    for (const record of [...events, ...topics, ...categories]) {
        statusById.set(record.id, record.status);
    }
    const books = [];
    for (const file of listJsonFiles(path.join(contentDir, "books"))) {
        const book = readRecord(file);
        if (!book) continue;
        const entryStatuses = (book.entries ?? [])
            .map((entry) => statusById.get(entry.eventId ?? entry.categoryId))
            .filter((status) => typeof status === "string");
        const status = entryStatuses.includes("published")
            ? "published"
            : entryStatuses.includes("in-review")
                ? "in-review"
                : "draft";
        books.push({ ...book, status });
    }
    return { events, categories, topics, books, sources };
}

// Sorted ids of the records with status === "published".
export function publishedIds(records) {
    return [...new Set(records.filter((record) => record.status === "published").map((record) => record.id))].sort();
}

// Sorted ids of every record, whatever its status — the local-dev
// opt-in (HISTORY_INCLUDE_UNPUBLISHED) set. The proposal sketch says
// "published + in-review", but the opt-in includes draft records too:
// the fixtures flip Creation to "draft" and the dev manifest still
// ships it, so published+in-review would drop it.
export function allIds(records) {
    return [...new Set(records.map((record) => record.id))].sort();
}

// The event/category/topic records with status === "published".
export function publishedRecords(tree) {
    return [...tree.events, ...tree.topics, ...tree.categories].filter((record) => record.status === "published");
}

// Every event/category/topic record, whatever its status — the dev
// opt-in record set.
export function allRecords(tree) {
    return [...tree.events, ...tree.topics, ...tree.categories];
}

// Sorted union of the `sources` arrays over the given records. Called
// with publishedRecords(tree) for production generation, and with
// allRecords(tree) for the HISTORY_INCLUDE_UNPUBLISHED path.
export function citedSourceIds(records) {
    const cited = new Set();
    for (const record of records) {
        for (const key of record.sources ?? []) {
            if (typeof key === "string") cited.add(key);
        }
    }
    return [...cited].sort();
}

// Mirrors findNonPublishedRecords in history-content-lib.js: every
// non-published event/topic/category (in scan order — events, topics,
// categories, each in sorted-filename order) with its title, followed by
// the registry sources cited only by non-published records (in
// first-citation order). The order is the lib's scan order, NOT sorted
// by id — the test compares against the lib's output exactly.
export function nonPublishedRecords(tree) {
    const records = [];
    const citedByPublished = new Set();
    const citedByUnpublished = new Set();
    const scan = (list, kind) => {
        for (const record of list) {
            const cited = record.status === "published" ? citedByPublished : citedByUnpublished;
            for (const key of record.sources ?? []) {
                if (typeof key === "string") cited.add(key);
            }
            if (record.status !== "published" && record.status) {
                records.push({
                    id: record.id,
                    kind,
                    status: record.status,
                    title: typeof record.title === "string" ? record.title : null,
                });
            }
        }
    };
    scan(tree.events, "event");
    scan(tree.topics, "topic");
    scan(tree.categories, "category");
    for (const key of citedByUnpublished) {
        if (citedByPublished.has(key)) continue;
        const source = tree.sources[key];
        records.push({
            id: key,
            kind: "source",
            status: "unpublished-only",
            title: source !== null && typeof source === "object" && typeof source.title === "string" ? source.title : null,
        });
    }
    return records;
}

// Mirrors findNonPublishedIds in history-content-lib.js: the
// non-published event/topic/category records without their titles.
export function nonPublishedIds(tree) {
    return nonPublishedRecords(tree)
        .filter((record) => record.kind !== "source")
        .map(({ id, kind, status }) => ({ id, kind, status }));
}

// The parsed book object for a book id, or null.
export function bookById(tree, id) {
    return tree.books.find((book) => book.id === id) ?? null;
}
