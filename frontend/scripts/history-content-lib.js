// Biblical History content pipeline — validation + published-only generation.
//
// The governing plan (docs: Biblical History implementation plan §3.7) makes
// this the feature's load-bearing piece: unpublished content (draft /
// in-review / verified) is EXCLUDED from production bundles at build time,
// not merely hidden by frontend logic. A runtime-only status filter would
// still ship draft Markdown and JSON inside dist/ chunks, so the pipeline
// is two stages — validate, then generate only published records into a
// gitignored directory that the app loader reads. The loader never imports
// from the source content tree.
//
// This module is pure logic (no process exits, no console output): the CLI
// wrapper (build-history-content.js) and the tests both call it.
//
// Local dev preview is an explicit opt-in: the --include-unpublished CLI
// flag on build-history-content.js (passed only by the dev-only wrapper
// build-history-content-dev.js, run by the "predev" hook) also generates
// unpublished records so an author can preview a draft locally. No build
// path reads HISTORY_INCLUDE_UNPUBLISHED from the environment, so a stray
// flag can never leak drafts into a production bundle.

import { readdirSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

// Shared pure helpers (also used by the browser loader) — the single
// source of truth for slugs, Scripture labels, Markdown parsing, and
// word counts. This module adds the Node-only validation/generation.
import {
    HISTORY_STATUSES as STATUSES,
    HISTORY_DATE_TYPES as DATE_TYPES,
    HISTORY_CLAIM_CONFIDENCES as CLAIM_CONFIDENCES,
    HISTORY_CONNECTION_TYPES as CONNECTION_TYPES,
    HISTORY_WORD_RANGES as WORD_RANGES,
    slugifyBookName,
    countWords,
    parseHistoryMarkdown,
    findFootnoteKeys,
} from "../src/utils/historyContent.js";

export { STATUSES, DATE_TYPES, CLAIM_CONFIDENCES, CONNECTION_TYPES, WORD_RANGES };
export { slugifyBookName, countWords, parseHistoryMarkdown, findFootnoteKeys };

export const TOPIC_CATEGORIES = ["civilization", "person", "place", "culture", "period"];
export const TOPIC_CATEGORY_DIRS = {
    civilization: "civilizations",
    person: "people",
    place: "places",
    culture: "cultures",
    period: "periods",
};

function listFilesRecursive(dir) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listFilesRecursive(full));
        else if (entry.isFile()) out.push(full);
    }
    return out.sort();
}

function readJson(file) {
    return JSON.parse(readFileSync(file, "utf8"));
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkScriptureRef(ref, where, bibleChapters, errors) {
    if (!isRecord(ref)) {
        errors.push(`${where}: must be an object with book, bookId, startChapter, endChapter.`);
        return;
    }
    const { book, bookId, startChapter, startVerse, endChapter, endVerse } = ref;
    if (typeof book !== "string" || !(book in bibleChapters)) {
        errors.push(`${where}: book "${book}" is not in bibleChapters.json.`);
        return;
    }
    if (bookId !== slugifyBookName(book)) {
        errors.push(`${where}: bookId "${bookId}" does not match slug "${slugifyBookName(book)}" for book "${book}".`);
    }
    const chapterCount = bibleChapters[book];
    const badChapter = (c) => !Number.isInteger(c) || c < 1 || c > chapterCount;
    if (badChapter(startChapter)) {
        errors.push(`${where}: startChapter ${startChapter} is outside 1..${chapterCount} for ${book}.`);
    }
    if (badChapter(endChapter)) {
        errors.push(`${where}: endChapter ${endChapter} is outside 1..${chapterCount} for ${book}.`);
    }
    const badVerse = (v) => v !== null && v !== undefined && (!Number.isInteger(v) || v < 1);
    if (badVerse(startVerse)) errors.push(`${where}: startVerse must be a positive integer or omitted.`);
    if (badVerse(endVerse)) errors.push(`${where}: endVerse must be a positive integer or omitted.`);
    if (Number.isInteger(startChapter) && Number.isInteger(endChapter)) {
        if (startChapter > endChapter) {
            errors.push(`${where}: startChapter ${startChapter} is after endChapter ${endChapter}.`);
        }
        if (startChapter === endChapter && startVerse != null && endVerse == null) {
            errors.push(`${where}: endVerse is required when startVerse is present in a same-chapter range.`);
        }
        if (
            startChapter === endChapter &&
            startVerse != null && endVerse != null && startVerse > endVerse
        ) {
            errors.push(`${where}: startVerse ${startVerse} is after endVerse ${endVerse}.`);
        }
    }
}

// Validate the whole source content tree. Returns { errors, warnings }.
// Fails closed: any error blocks generation (and therefore the build).
export function validateHistoryContent({ contentDir, bibleChapters }) {
    const errors = [];
    const warnings = [];
    const booksDir = path.join(contentDir, "books");
    const eventsDir = path.join(contentDir, "events");
    const topicsDir = path.join(contentDir, "topics");
    const sourcesFile = path.join(contentDir, "sources", "references.json");

    const seenIds = new Map(); // id -> where
    const claimId = (id, where) => {
        if (seenIds.has(id)) {
            errors.push(`${where}: id "${id}" is already used by ${seenIds.get(id)}.`);
        } else {
            seenIds.set(id, where);
        }
    };

    // --- Sources registry ---
    let sources = {};
    if (!existsSync(sourcesFile)) {
        errors.push(`sources/references.json: missing (the source registry is required).`);
    } else {
        try {
            sources = readJson(sourcesFile);
        } catch {
            errors.push(`sources/references.json: invalid JSON.`);
            sources = {};
        }
        for (const [key, source] of Object.entries(sources)) {
            if (!isRecord(source)) {
                errors.push(`sources/references.json: entry "${key}" must be an object.`);
                continue;
            }
            if (source.id !== key) {
                errors.push(`sources/references.json: entry "${key}" has id "${source.id}" — key and id must match.`);
            }
            claimId(key, `sources/references.json`);
            if (typeof source.title !== "string" || source.title.trim() === "") {
                errors.push(`sources/references.json: source "${key}" needs a title.`);
            }
            if (source.verification !== undefined
                && !["verified", "not-independently-verified"].includes(source.verification)) {
                errors.push(`sources/references.json: source "${key}" has unknown verification "${source.verification}".`);
            }
        }
    }

    // --- Books ---
    const books = new Map(); // bookId -> { data, file }
    for (const file of listFilesRecursive(booksDir)) {
        if (!file.endsWith(".json")) continue;
        const rel = path.relative(booksDir, file);
        let data;
        try {
            data = readJson(file);
        } catch {
            errors.push(`books/${rel}: invalid JSON.`);
            continue;
        }
        if (!isRecord(data)) {
            errors.push(`books/${rel}: must be a JSON object.`);
            continue;
        }
        const where = `books/${rel}`;
        if (typeof data.id !== "string" || data.id === "") {
            errors.push(`${where}: missing id.`);
            continue;
        }
        if (`${data.id}.json` !== path.basename(file)) {
            errors.push(`${where}: filename must be "${data.id}.json".`);
        }
        claimId(data.id, where);
        if (typeof data.title !== "string" || data.title.trim() === "") {
            errors.push(`${where}: missing title.`);
        }
        if (!["OT", "NT"].includes(data.testament)) {
            errors.push(`${where}: testament must be "OT" or "NT".`);
        }
        if (typeof data.introduction !== "string" || data.introduction.trim() === "") {
            errors.push(`${where}: missing introduction.`);
        }
        if (!Array.isArray(data.events)) {
            errors.push(`${where}: events must be an array.`);
            continue;
        }
        const orders = new Set();
        for (const entry of data.events) {
            if (!isRecord(entry) || typeof entry.eventId !== "string") {
                errors.push(`${where}: each events entry needs an eventId.`);
                continue;
            }
            if (!Number.isInteger(entry.narrativeOrder)) {
                errors.push(`${where}: event "${entry.eventId}" needs an integer narrativeOrder.`);
            } else if (orders.has(entry.narrativeOrder)) {
                errors.push(`${where}: narrativeOrder ${entry.narrativeOrder} is used twice.`);
            } else {
                orders.add(entry.narrativeOrder);
            }
            if (typeof entry.bookNote !== "string" || entry.bookNote.trim() === "") {
                errors.push(`${where}: event "${entry.eventId}" needs a bookNote.`);
            }
        }
        books.set(data.id, { data, file });
    }

    // --- Topics ---
    const topics = new Map(); // topicId -> { data, file }
    for (const file of listFilesRecursive(topicsDir)) {
        if (!file.endsWith(".json")) continue;
        const rel = path.relative(topicsDir, file);
        let data;
        try {
            data = readJson(file);
        } catch {
            errors.push(`topics/${rel}: invalid JSON.`);
            continue;
        }
        if (!isRecord(data)) {
            errors.push(`topics/${rel}: must be a JSON object.`);
            continue;
        }
        const where = `topics/${rel}`;
        if (typeof data.id !== "string" || data.id === "") {
            errors.push(`${where}: missing id.`);
            continue;
        }
        const prefix = data.id.split("-")[0];
        const slug = data.id.split("-").slice(1).join("-");
        if (!TOPIC_CATEGORIES.includes(prefix)) {
            errors.push(`${where}: id "${data.id}" must start with a topic category (${TOPIC_CATEGORIES.join(", ")}).`);
        }
        if (data.category !== prefix) {
            errors.push(`${where}: category "${data.category}" does not match id prefix "${prefix}".`);
        }
        const expectedDir = TOPIC_CATEGORY_DIRS[data.category];
        if (expectedDir && path.dirname(rel) !== expectedDir) {
            errors.push(`${where}: category "${data.category}" belongs in topics/${expectedDir}/.`);
        }
        if (`${slug}.json` !== path.basename(file)) {
            errors.push(`${where}: filename must be "${slug}.json".`);
        }
        claimId(data.id, where);
        if (typeof data.title !== "string" || data.title.trim() === "") {
            errors.push(`${where}: missing title.`);
        }
        if (!STATUSES.includes(data.status)) {
            errors.push(`${where}: status "${data.status}" is not one of ${STATUSES.join(", ")}.`);
        }
        if (!Array.isArray(data.sources)) {
            errors.push(`${where}: sources must be an array.`);
        } else {
            for (const key of data.sources) {
                if (!(key in sources)) errors.push(`${where}: source "${key}" is not in the registry.`);
            }
        }
        if (data.category === "place") {
            if (!["established", "proposed", "unknown"].includes(data.locationConfidence)) {
                errors.push(`${where}: locationConfidence must be established, proposed, or unknown.`);
            }
            const coords = data.coordinates ?? null;
            if (data.locationConfidence === "unknown" && coords !== null) {
                errors.push(`${where}: an unknown-confidence place must have coordinates null.`);
            }
            if (coords !== null) {
                if (data.locationConfidence !== "established" && data.locationConfidence !== "proposed") {
                    errors.push(`${where}: coordinates require established or proposed locationConfidence.`);
                }
                if (typeof coords.lat !== "number" || coords.lat < -90 || coords.lat > 90
                    || typeof coords.lon !== "number" || coords.lon < -180 || coords.lon > 180) {
                    errors.push(`${where}: coordinates must be lat in [-90, 90], lon in [-180, 180].`);
                }
                if (data.locationConfidence === "proposed"
                    && (!Array.isArray(data.alternativeIdentifications) || data.alternativeIdentifications.length === 0)) {
                    errors.push(`${where}: a proposed place must list alternativeIdentifications.`);
                }
            }
        }
        topics.set(data.id, { data, file });
    }

    // --- Events ---
    const events = new Map(); // eventId -> { data, file, mdFile }
    for (const file of listFilesRecursive(eventsDir)) {
        if (!file.endsWith(".json")) continue;
        const rel = path.relative(eventsDir, file);
        let data;
        try {
            data = readJson(file);
        } catch {
            errors.push(`events/${rel}: invalid JSON.`);
            continue;
        }
        if (!isRecord(data)) {
            errors.push(`events/${rel}: must be a JSON object.`);
            continue;
        }
        const where = `events/${rel}`;
        if (typeof data.id !== "string" || data.id === "") {
            errors.push(`${where}: missing id.`);
            continue;
        }
        if (!data.id.startsWith("event-")) {
            errors.push(`${where}: event id "${data.id}" must start with "event-".`);
        }
        const slug = data.id.replace(/^event-/, "");
        if (`${slug}.json` !== path.basename(file)) {
            errors.push(`${where}: filename must be "${slug}.json".`);
        }
        claimId(data.id, where);
        if (typeof data.title !== "string" || data.title.trim() === "") {
            errors.push(`${where}: missing title.`);
        }
        if (data.category !== "event") {
            errors.push(`${where}: category must be "event".`);
        }
        if (!STATUSES.includes(data.status)) {
            errors.push(`${where}: status "${data.status}" is not one of ${STATUSES.join(", ")}.`);
        }
        checkScriptureRef(data.primaryScripture, `${where}: primaryScripture`, bibleChapters, errors);
        // Date rules (date axis is its own enum — never the claim axis).
        const date = data.date;
        if (!isRecord(date)) {
            errors.push(`${where}: missing date object.`);
        } else {
            if (!DATE_TYPES.includes(date.type)) {
                errors.push(`${where}: date.type "${date.type}" is not one of ${DATE_TYPES.join(", ")}.`);
            }
            if (typeof date.label !== "string" || date.label.trim() === "") {
                errors.push(`${where}: date.label is required.`);
            }
            if (date.type === "traditional" && (typeof date.traditionalSystem !== "string" || !date.traditionalSystem.trim())) {
                errors.push(`${where}: date.type "traditional" requires traditionalSystem.`);
            }
            if (date.type !== "traditional" && date.traditionalSystem != null) {
                errors.push(`${where}: traditionalSystem must be present only when date.type is "traditional".`);
            }
            const yearsNull = date.yearStart == null && date.yearEnd == null;
            if (date.type === "unknown" && !yearsNull) {
                errors.push(`${where}: date.type "unknown" requires yearStart and yearEnd null.`);
            }
            if (date.type !== "unknown" && yearsNull) {
                errors.push(`${where}: date.type "${date.type}" requires yearStart and yearEnd.`);
            }
            if (date.yearStart != null && date.yearEnd != null && date.yearStart > date.yearEnd) {
                errors.push(`${where}: yearStart ${date.yearStart} is after yearEnd ${date.yearEnd}.`);
            }
        }
        // Reference resolution for locations/topics/relatedEvents is
        // checked after all events are collected (see below), so the
        // checks here only verify the fields are arrays.
        for (const field of ["locations", "topics", "relatedEvents"]) {
            if (!Array.isArray(data[field])) {
                errors.push(`${where}: ${field} must be an array.`);
            }
        }
        if (!Array.isArray(data.connections) || data.connections.length < 1) {
            errors.push(`${where}: connections must be a non-empty array (at least one passage).`);
        } else {
            data.connections.forEach((conn, i) => {
                const cwhere = `${where}: connections[${i}]`;
                if (!isRecord(conn)) {
                    errors.push(`${cwhere}: must be an object.`);
                    return;
                }
                checkScriptureRef(conn, cwhere, bibleChapters, errors);
                if (!CONNECTION_TYPES.includes(conn.type)) {
                    errors.push(`${cwhere}: type "${conn.type}" is not one of ${CONNECTION_TYPES.join(", ")}.`);
                }
                if (!CLAIM_CONFIDENCES.includes(conn.confidence)) {
                    errors.push(`${cwhere}: confidence "${conn.confidence}" is not one of ${CLAIM_CONFIDENCES.join(", ")}.`);
                }
                if (typeof conn.note !== "string" || conn.note.trim() === "") {
                    errors.push(`${cwhere}: note is required.`);
                }
            });
        }
        if (!Array.isArray(data.sources)) {
            errors.push(`${where}: sources must be an array.`);
        } else {
            for (const key of data.sources) {
                if (!(key in sources)) errors.push(`${where}: source "${key}" is not in the registry.`);
            }
            if (data.status === "published") {
                for (const key of data.sources) {
                    const source = sources[key];
                    if (source && source.verification === "not-independently-verified"
                        && !(isRecord(data.review) && data.review.editorialOverride === true)) {
                        errors.push(`${where}: published event cites not-independently-verified source "${key}" without a review.editorialOverride.`);
                    }
                }
            }
        }
        if (!isRecord(data.review) || typeof data.review.author !== "string"
            || typeof data.review.reviewer !== "string" || typeof data.review.lastReviewed !== "string"
            || typeof data.review.checklistVersion !== "string") {
            errors.push(`${where}: review needs author, reviewer, lastReviewed, checklistVersion.`);
        }
        const mdFile = file.replace(/\.json$/, ".md");
        if (!existsSync(mdFile)) {
            errors.push(`${where}: missing matching Markdown file ${path.basename(mdFile)}.`);
        } else {
            const mdText = readFileSync(mdFile, "utf8");
            // No raw HTML in Markdown (the renderer runs without rehype-raw too).
            if (/<[A-Za-z][^>]*>/.test(mdText) || /<\/[A-Za-z]+>/.test(mdText)) {
                errors.push(`events/${slug}.md: raw HTML tags are not allowed in History Markdown.`);
            }
            // Markdown links may only point at http(s), site-internal, or anchor targets.
            for (const m of mdText.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
                const url = m[1].trim();
                if (!/^(https?:\/\/|\/|#)/.test(url)) {
                    errors.push(`events/${slug}.md: link target "${url}" must be http(s), site-internal, or an anchor.`);
                }
            }
            for (const key of findFootnoteKeys(mdText)) {
                if (!(key in sources)) {
                    errors.push(`events/${slug}.md: footnote [^${key}] is not in the source registry.`);
                }
            }
            const parsed = parseHistoryMarkdown(mdText);
            const requiredHeadings = ["Overview", "Ancient World", "Why This Context Matters"];
            for (const heading of requiredHeadings) {
                if (!parsed.headings.includes(heading)) {
                    errors.push(`events/${slug}.md: missing required "## ${heading}" section.`);
                }
            }
            const counts = {
                overview: countWords(parsed.overview),
                ancientWorld: countWords(parsed.ancientWorld),
                whyItMatters: countWords(parsed.whyItMatters),
            };
            for (const [key, [min, max]] of Object.entries(WORD_RANGES)) {
                const n = counts[key];
                if (n === 0) continue; // Missing section already reported above.
                if (n < min || n > max) {
                    const low = Math.floor(min * 0.9);
                    const high = Math.ceil(max * 1.1);
                    if (n >= low && n <= high) {
                        warnings.push(`events/${slug}.md: ${key} is ${n} words (target ${min}–${max}) — outside the target, inside the ±10% warning band.`);
                    } else {
                        errors.push(`events/${slug}.md: ${key} is ${n} words (required ${min}–${max}).`);
                    }
                }
            }
        }
        events.set(data.id, { data, file, mdFile });
    }

    // Cross-checks that need the full event set.
    for (const [id, { data }] of events) {
        for (const related of data.relatedEvents ?? []) {
            if (!events.has(related)) {
                errors.push(`events/${id.replace(/^event-/, "")}.json: relatedEvents id "${related}" does not resolve to an event.`);
            }
        }
        for (const topicId of [...(data.topics ?? []), ...(data.locations ?? [])]) {
            if (!topics.has(topicId)) {
                errors.push(`events/${id.replace(/^event-/, "")}.json: topic/location id "${topicId}" does not resolve to a topic.`);
            }
        }
    }
    for (const [bookId, { data }] of books) {
        for (const entry of data.events ?? []) {
            if (!events.has(entry.eventId)) {
                errors.push(`books/${bookId}.json: eventId "${entry.eventId}" does not resolve to an event.`);
            }
        }
    }
    // Every event must be listed by at least one book, unless explicitly
    // marked orphan (an event with no book home cannot be reached).
    const listed = new Set();
    for (const { data } of books.values()) {
        for (const entry of data.events ?? []) listed.add(entry.eventId);
    }
    for (const [id, { data }] of events) {
        if (!listed.has(id) && data.orphan !== true) {
            errors.push(`events/${id.replace(/^event-/, "")}.json: event is not listed in any book file (mark orphan: true to allow).`);
        }
    }
    // Every Markdown file needs its JSON record (and vice versa is checked above).
    for (const file of listFilesRecursive(eventsDir)) {
        if (file.endsWith(".md")) {
            const jsonFile = file.replace(/\.md$/, ".json");
            if (!existsSync(jsonFile)) {
                errors.push(`events/${path.basename(file)}: no matching JSON record.`);
            }
        }
    }
    for (const file of listFilesRecursive(topicsDir)) {
        if (file.endsWith(".md")) {
            const jsonFile = file.replace(/\.md$/, ".json");
            if (!existsSync(jsonFile)) {
                errors.push(`topics/${path.basename(file)}: no matching JSON record.`);
            }
        }
        if (file.endsWith(".json")) {
            const mdFile = file.replace(/\.json$/, ".md");
            if (!existsSync(mdFile)) {
                errors.push(`topics/${path.basename(file)}: missing matching Markdown file.`);
            }
        }
    }

    return { errors, warnings, counts: { books: books.size, events: events.size, topics: topics.size, sources: Object.keys(sources).length } };
}

// Collect every non-published record (for the CI gate check): events and
// topics whose status is not "published", plus source-registry entries
// cited only by non-published records. The registry has no status field;
// "cited only by drafts" is what makes a source non-published for the
// gate — such a source can reach a bundle only through a draft record.
// Titles are included: a leaked Markdown file carries no id, but it
// carries its title, so the gate must be able to match on that too.
export function findNonPublishedRecords({ contentDir }) {
    const records = [];
    const citedByPublished = new Set();
    const citedByUnpublished = new Set();
    const scan = (dir, kind) => {
        for (const file of listFilesRecursive(dir)) {
            if (!file.endsWith(".json")) continue;
            try {
                const data = readJson(file);
                if (!isRecord(data) || typeof data.id !== "string") continue;
                const published = data.status === "published";
                const cited = published ? citedByPublished : citedByUnpublished;
                for (const key of data.sources ?? []) {
                    if (typeof key === "string") cited.add(key);
                }
                if (!published && data.status) {
                    records.push({
                        id: data.id,
                        kind,
                        status: data.status,
                        title: typeof data.title === "string" ? data.title : null,
                    });
                }
            } catch {
                // Invalid JSON is the validator's job, not the gate's.
            }
        }
    };
    scan(path.join(contentDir, "events"), "event");
    scan(path.join(contentDir, "topics"), "topic");
    let registry = {};
    try {
        registry = readJson(path.join(contentDir, "sources", "references.json"));
    } catch {
        // Invalid JSON is the validator's job, not the gate's.
    }
    for (const key of citedByUnpublished) {
        if (citedByPublished.has(key)) continue;
        const source = registry[key];
        records.push({
            id: key,
            kind: "source",
            status: "unpublished-only",
            title: isRecord(source) && typeof source.title === "string" ? source.title : null,
        });
    }
    return records;
}

// Collect every non-published record id (for the CI gate check).
export function findNonPublishedIds({ contentDir }) {
    return findNonPublishedRecords({ contentDir })
        .filter((record) => record.kind !== "source")
        .map(({ id, kind, status }) => ({ id, kind, status }));
}

// Dist-scan patterns for the internal research claims register, in its
// compiled forms. The generated-JSON check below (Object.hasOwn "claims")
// and the quoted-key dist check ('"claims":') catch the serialized
// forms; these two catch what a minified bundle actually contains:
//
// - UNQUOTED_CLAIMS_KEY: Rolldown inlines generated JSON with unquoted
//   keys, so a leaked register shows up as `claims:()=>u`,
//   `claims:[{...}]`, or `claims:u` — the quoted check never sees it
//   (dist/ has no .json assets). Anchored to `{` or `,` so ordinary
//   prose "claims" does not fire: prose "claims:" normally follows a
//   space or a quote, not an object-literal position.
//   TRADE-OFF, stated plainly: prose of the form `, claims: …` (a comma
//   immediately before "claims:") DOES trip this pattern — the anchor
//   cannot tell a comma in code from a comma in prose. No current
//   Biblical History content has that shape (grep: zero "claims:"
//   occurrences in the content tree), and the failure message names the
//   unquoted-key shape so the author can tell a prose false positive
//   from a real leak. Do not "fix" this by dropping the `,` anchor:
//   minified object literals separate keys with commas, so the anchor
//   is what catches `claims:` after the first key.
// - CLAIM_ID: claim ids (clm-ae-028, clm-ae-030b, clm-cre-014, …) exist
//   only in the internal register; they never appear in public prose.
//   Any occurrence in a built asset is a leak of register content,
//   whatever key shape carried it.
const UNQUOTED_CLAIMS_KEY = /(?:^|[{,])\s*claims\s*:/;
const CLAIM_ID = /clm-[a-z]+-\d+[a-z]?/;

// The publication gate, shared by the postbuild CLI (check-history-gate.js)
// and the Vite build plugin (history-gate-plugin.js). Checks the generated
// manifest AND dist/ for any non-published record — its id, its title, or
// a draft-only source entry. It also checks, on EVERY run (including the
// all-published path, where the non-published early return below would
// otherwise stand the gate down), that no generated event/topic JSON
// carries the internal research claims register and that no built asset
// contains the register in serialized ("claims":), compiled (unquoted
// claims: key), or fragmentary (bare claim id) form. Returns
// { failures, nonPublished }.
//
// This NEVER skips: a manifest generated with unpublished content is
// itself a failure, not a reason to stand down — a dev-flag build is not
// a production build, and the gate's job is to prove the production
// artifact is clean.
export function checkHistoryGate({ contentDir, generatedDir, distDir }) {
    const failures = [];
    const nonPublished = findNonPublishedRecords({ contentDir });

    // Claims detector — runs before the non-published early return, so it
    // also fires on the publication path (everything published, nothing
    // non-published left to match on): if a published event ever shipped
    // its claims register, the id/title checks below would be silent by
    // design. Match the literal serialized key '"claims":', not the bare
    // word "claims": public prose contains it (conn-ae-018's note,
    // "…this note claims it for the Genesis 2–3 reversal…").
    for (const dir of [path.join(generatedDir, "events"), path.join(generatedDir, "topics")]) {
        for (const file of listFilesRecursive(dir)) {
            if (!file.endsWith(".json")) continue;
            let parsed = null;
            try {
                parsed = JSON.parse(readFileSync(file, "utf8"));
            } catch {
                failures.push(`generated ${path.relative(generatedDir, file)} is not valid JSON.`);
                continue;
            }
            if (isRecord(parsed) && Object.hasOwn(parsed, "claims")) {
                failures.push(
                    `generated ${path.relative(generatedDir, file)} carries the internal "claims" register ` +
                        `(id "${typeof parsed.id === "string" ? parsed.id : "?"}") — research claims never ship.`,
                );
            }
        }
    }

    function* textFiles(dir) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) yield* textFiles(full);
            else if (/\.(js|css|html|json|txt|xml|map)$/.test(entry.name)) yield full;
        }
    }
    if (existsSync(distDir)) {
        for (const file of textFiles(distDir)) {
            const text = readFileSync(file, "utf8");
            if (text.includes('"claims":')) {
                failures.push(`dist/${path.relative(distDir, file)} contains a serialized "claims": key — the internal claims register never ships.`);
            }
            if (UNQUOTED_CLAIMS_KEY.test(text)) {
                failures.push(`dist/${path.relative(distDir, file)} contains an unquoted claims: key (compiled form of the internal claims register) — the internal claims register never ships.`);
            }
            if (CLAIM_ID.test(text)) {
                failures.push(`dist/${path.relative(distDir, file)} contains an internal claim id (clm-…) — the internal claims register never ships.`);
            }
        }
    }

    if (nonPublished.length === 0) {
        return { failures, nonPublished };
    }

    const manifestPath = path.join(generatedDir, "manifest.json");
    if (!existsSync(manifestPath)) {
        failures.push("generated manifest is missing — run the History content build first.");
    } else {
        let manifest = null;
        try {
            manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        } catch {
            failures.push("generated manifest is not valid JSON.");
        }
        if (manifest !== null) {
            if (manifest.includeUnpublished === true) {
                failures.push(
                    "generated manifest was built with unpublished content (includeUnpublished is true) — " +
                        "a production build must be published-only.",
                );
            }
            const listedEvents = new Set(manifest.events ?? []);
            const listedTopics = new Set(manifest.topics ?? []);
            const listedSources = new Set(manifest.sources ?? []);
            for (const record of nonPublished) {
                if (record.kind === "event" && listedEvents.has(record.id)) {
                    failures.push(`manifest lists non-published id "${record.id}" (status ${record.status}).`);
                } else if (record.kind === "topic" && listedTopics.has(record.id)) {
                    failures.push(`manifest lists non-published id "${record.id}" (status ${record.status}).`);
                } else if (record.kind === "source" && listedSources.has(record.id)) {
                    failures.push(`manifest lists non-published source "${record.id}" (cited only by unpublished records).`);
                }
            }
        }
    }

    // No non-published id, title, or source entry may appear in any built asset.
    if (existsSync(distDir)) {
        for (const file of textFiles(distDir)) {
            const text = readFileSync(file, "utf8");
            for (const record of nonPublished) {
                if (text.includes(record.id)) {
                    failures.push(`dist/${path.relative(distDir, file)} contains non-published ${record.kind} id "${record.id}" (status ${record.status}).`);
                }
                if (record.title && text.includes(record.title)) {
                    failures.push(`dist/${path.relative(distDir, file)} contains non-published ${record.kind} title "${record.title}" (id "${record.id}").`);
                }
            }
        }
    }
    return { failures, nonPublished };
}

// Validate, then write only the included records into the generated
// directory. Returns { manifest, warnings }. Throws Error on validation
// failure (fail closed — the build must not proceed).
//
// Internal editorial metadata never ships: the source tree keeps the
// full review record (review.notes, reviewer history, editorial
// overrides), the research claims register (claims — including
// unverified claims such as clm-ae-028 and clm-ae-030b, which no UI
// renders), and source verification (verification, verificationDetail)
// for research and validation, but none of it reaches generated output.
// Validation reads the override from the SOURCES first (check 10), and
// nothing at runtime reads review, claims, or verification fields — the public
// Sources list renders author/title/details/link only, and the panel
// badge renders from status only — so stripping here, at generation
// time, is safe. It covers every build path (prebuild, the Vite gate
// plugin, dev-flag generation) because they all go through this function.
function stripInternalMetadata(data) {
    const publicData = { ...data };
    delete publicData.review;
    delete publicData.claims;
    return publicData;
}

function stripSourceInternal(source) {
    const publicSource = { ...source };
    delete publicSource.verification;
    delete publicSource.verificationDetail;
    return publicSource;
}

export function generateHistoryContent({ contentDir, outputDir, includeUnpublished, bibleChapters }) {
    const { errors, warnings } = validateHistoryContent({ contentDir, bibleChapters });
    if (errors.length > 0) {
        throw new Error(`History content validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    }

    const include = (status) => status === "published" || (includeUnpublished && STATUSES.includes(status));
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(path.join(outputDir, "books"), { recursive: true });
    mkdirSync(path.join(outputDir, "events"), { recursive: true });
    mkdirSync(path.join(outputDir, "topics"), { recursive: true });

    const manifest = {
        generatedAt: new Date().toISOString(),
        includeUnpublished: Boolean(includeUnpublished),
        events: [],
        topics: [],
        books: [],
        sources: [],
    };

    // Events (JSON + Markdown) and topics. The JSON is re-serialized
    // without the internal review record and claims register (see
    // stripInternalMetadata): the source file keeps them, the generated
    // copy must not.
    const copyPair = (srcJson, destDir) => {
        const base = path.basename(srcJson, ".json");
        const data = stripInternalMetadata(readJson(srcJson));
        writeFileSync(path.join(destDir, `${base}.json`), JSON.stringify(data, null, 2));
        const md = srcJson.replace(/\.json$/, ".md");
        if (existsSync(md)) {
            writeFileSync(path.join(destDir, `${base}.md`), readFileSync(md, "utf8"));
        }
    };
    for (const file of listFilesRecursive(path.join(contentDir, "events"))) {
        if (!file.endsWith(".json")) continue;
        const data = readJson(file);
        if (include(data.status)) {
            copyPair(file, path.join(outputDir, "events"));
            manifest.events.push(data.id);
        }
    }
    for (const file of listFilesRecursive(path.join(contentDir, "topics"))) {
        if (!file.endsWith(".json")) continue;
        const data = readJson(file);
        if (include(data.status)) {
            const destDir = path.join(outputDir, "topics", path.basename(path.dirname(file)));
            mkdirSync(destDir, { recursive: true });
            copyPair(file, destDir);
            manifest.topics.push(data.id);
        }
    }

    // Books: only books with at least one included event, with their event
    // lists filtered to the included events. A book with no included event
    // renders as "Upcoming" from bibleChapters.json alone.
    const includedEvents = new Set(manifest.events);
    for (const file of listFilesRecursive(path.join(contentDir, "books"))) {
        if (!file.endsWith(".json")) continue;
        const data = readJson(file);
        const kept = (data.events ?? []).filter((e) => includedEvents.has(e.eventId));
        if (kept.length === 0) continue;
        writeFileSync(
            path.join(outputDir, "books", path.basename(file)),
            JSON.stringify({ ...data, events: kept }, null, 2),
        );
        manifest.books.push(data.id);
    }

    // Sources registry: only sources cited by an included event or topic.
    // Verification fields are internal editorial records — they stay in
    // the source registry and never reach the generated copy.
    const cited = new Set();
    for (const file of listFilesRecursive(path.join(outputDir, "events"))) {
        if (!file.endsWith(".json")) continue;
        for (const key of readJson(file).sources ?? []) cited.add(key);
    }
    for (const file of listFilesRecursive(path.join(outputDir, "topics"))) {
        if (!file.endsWith(".json")) continue;
        for (const key of readJson(file).sources ?? []) cited.add(key);
    }
    const registry = readJson(path.join(contentDir, "sources", "references.json"));
    const filtered = {};
    for (const key of [...cited].sort()) {
        if (registry[key]) {
            filtered[key] = stripSourceInternal(registry[key]);
            manifest.sources.push(key);
        }
    }
    writeFileSync(path.join(outputDir, "sources.json"), JSON.stringify(filtered, null, 2));

    manifest.events.sort();
    manifest.topics.sort();
    manifest.books.sort();
    manifest.sources.sort();
    writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return { manifest, warnings };
}
