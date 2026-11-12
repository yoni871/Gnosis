// Biblical History — shared pure content helpers.
//
// These functions are used by BOTH the Node build script
// (frontend/scripts/history-content-lib.js) and the browser content loader
// (frontend/src/services/historyService.js), so they live here and depend
// on nothing Node- or browser-specific. Keep them that way: no `fs`, no
// `window`, no imports beyond this file.

export const HISTORY_STATUSES = ["draft", "in-review", "verified", "published"];
export const HISTORY_DATE_TYPES = ["established", "approximate", "traditional", "proposed", "unknown"];
export const HISTORY_CLAIM_CONFIDENCES = ["established", "probable", "debated", "traditional", "unknown"];
export const HISTORY_CONNECTION_TYPES = [
    "direct-account",
    "historical-setting",
    "prophetic-reference",
    "thematic",
    "background",
];

// Word-count ranges for event prose (plan §3.9 check 6). A ±10% band is a
// warning; outside it is a failure.
export const HISTORY_WORD_RANGES = {
    overview: [80, 150],
    ancientWorld: [200, 400],
    whyItMatters: [50, 100],
};

// The event panel's sections, in order (plan §2.2).
export const HISTORY_SECTIONS = [
    { id: "overview", label: "Overview" },
    { id: "ancient-world", label: "Ancient World" },
    { id: "scripture", label: "Scripture" },
];

// "1 Samuel" -> "1-samuel"; "Song of Solomon" -> "song-of-solomon".
export function slugifyBookName(name) {
    return String(name)
        .toLowerCase()
        .replace(/['\u2019]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

// Derive every Scripture display label from the four range fields —
// labels are never stored in JSON, so a label can never disagree with
// its range (plan §3.3):
//   Genesis 1:1–2:3   (multi-chapter, verses on both ends)
//   Genesis 1:1–31    (same chapter, both verses)
//   2 Kings 18–19     (whole chapters)
//   Genesis 1         (one whole chapter)
export function formatScriptureRange(ref) {
    if (!ref || typeof ref.book !== "string") return "";
    const { book, startChapter, startVerse, endChapter, endVerse } = ref;
    const hasStartVerse = startVerse !== null && startVerse !== undefined;
    const hasEndVerse = endVerse !== null && endVerse !== undefined;
    if (startChapter === endChapter) {
        if (hasStartVerse && hasEndVerse) {
            return startVerse === endVerse
                ? `${book} ${startChapter}:${startVerse}`
                : `${book} ${startChapter}:${startVerse}–${endVerse}`;
        }
        if (hasStartVerse) return `${book} ${startChapter}:${startVerse}`;
        return `${book} ${startChapter}`;
    }
    const start = hasStartVerse ? `${startChapter}:${startVerse}` : `${startChapter}`;
    const end = hasEndVerse ? `${endChapter}:${endVerse}` : `${endChapter}`;
    return `${book} ${start}–${end}`;
}

// Rough word count for Markdown prose: strip formatting, footnotes, and
// link markup, then count whitespace-separated tokens.
export function countWords(text) {
    if (!text) return 0;
    const stripped = String(text)
        .replace(/\[\^[^\]]+\]/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[#>*_`~]/g, " ")
        .replace(/<[^>]*>/g, " ");
    return stripped.split(/\s+/).filter(Boolean).length;
}

// Split event Markdown into its contract sections. Headings are the
// contract: a missing or renamed ## heading fails validation.
export function parseHistoryMarkdown(mdText) {
    const text = String(mdText ?? "");
    const sections = {};
    const headingPattern = /^## (.+)$/gm;
    const headings = [...text.matchAll(headingPattern)];
    for (let i = 0; i < headings.length; i += 1) {
        const name = headings[i][1].trim();
        const start = headings[i].index + headings[i][0].length;
        const end = i + 1 < headings.length ? headings[i + 1].index : text.length;
        sections[name] = text.slice(start, end).trim();
    }
    // Ancient World subsections (### headings) become expandable sections.
    const ancientWorld = sections["Ancient World"] ?? "";
    const subsections = [];
    const subPattern = /^### (.+)$/gm;
    const subs = [...ancientWorld.matchAll(subPattern)];
    for (let i = 0; i < subs.length; i += 1) {
        const heading = subs[i][1].trim();
        const start = subs[i].index + subs[i][0].length;
        const end = i + 1 < subs.length ? subs[i + 1].index : ancientWorld.length;
        subsections.push({ heading, body: ancientWorld.slice(start, end).trim() });
    }
    return {
        overview: sections.Overview ?? "",
        ancientWorld,
        ancientWorldSubsections: subsections,
        whyItMatters: sections["Why This Context Matters"] ?? "",
        headings: Object.keys(sections),
    };
}

// Footnote keys cited in prose: [^source-id].
export function findFootnoteKeys(mdText) {
    return [...String(mdText ?? "").matchAll(/\[\^([^\]]+)\]/g)].map((m) => m[1]);
}

// Replace [^source-id] footnote references with numbered links to the
// sources list (anchors `#source-<id>`), in first-citation order. The
// renderer turns these into ordinary links; the sources list carries the
// matching ids. Returns { markdown, footnotes: [{ key, number }] }.
// Pass an existing `footnotes` array (from an earlier section) to keep
// numbering continuous across sections instead of restarting at 1 —
// loadEventSections threads one array through the whole event.
export function resolveHistoryFootnotes(mdText, knownSourceIds = [], existingFootnotes = null) {
    const footnotes = existingFootnotes ?? [];
    const markdown = String(mdText ?? "").replace(/\[\^([^\]]+)\]/g, (match, key) => {
        let entry = footnotes.find((f) => f.key === key);
        if (!entry) {
            entry = { key, number: footnotes.length + 1, known: knownSourceIds.includes(key) };
            footnotes.push(entry);
        }
        return `[${entry.number}](#source-${key})`;
    });
    return { markdown, footnotes };
}
