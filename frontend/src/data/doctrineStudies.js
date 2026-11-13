// Normalized placeholder data for the Trace the Doctrine study
// workspace (Phase 1: The Trinity, frontend UI only).
//
// These are DEMONSTRATION entries, not research: the five theologians
// named here are historical figures, but the LINK between each of them
// and Genesis 1:26 — and every quotation, source title, and writing
// date attached to that link — is UNVERIFIED and pending research.
// Nothing in this file may be presented as a verified fact: every
// quotation, source title, and writing date is null or explicitly
// pending, and every interpretation carries `placeholder: true` and
// `demonstration: true`.
//
// The shape is deliberately the same normalized shape a future
// DB-backed service can replace: passages, figures, works, and
// interpretations are separate entities joined by ids, and
// `passageInterpretations` maps a passage to its interpretations in
// explicit PROVISIONAL order. Passages other than Genesis 1:26 start
// with empty arrays — no fake entries, no implied relationship.

export const DEMONSTRATION_NOTICE =
    "Demonstration data — the theologian entries are placeholders " +
    "pending research. The passage-to-theologian relationships, " +
    "quotations, source titles, and writing dates are not verified.";

export const DATE_PENDING_LABEL = "Date pending verification";
export const TITLE_PENDING_LABEL = "Title pending verification";
export const QUOTATION_PENDING_LABEL = "Quotation pending verification";
export const EXPLANATION_PENDING_LABEL = "Explanation pending verification";

export const passages = [
    {
        id: "gen-1-26",
        book: "Genesis",
        startChapter: 1,
        startVerse: 26,
        endChapter: 1,
        endVerse: 26,
        label: "Genesis 1:26",
    },
    {
        id: "john-1-1",
        book: "John",
        startChapter: 1,
        startVerse: 1,
        endChapter: 1,
        endVerse: 3,
        label: "John 1:1–3",
    },
    {
        id: "matt-28-19",
        book: "Matthew",
        startChapter: 28,
        startVerse: 19,
        endChapter: 28,
        endVerse: 19,
        label: "Matthew 28:19",
    },
    {
        id: "2cor-13-14",
        book: "2 Corinthians",
        startChapter: 13,
        startVerse: 14,
        endChapter: 13,
        endVerse: 14,
        label: "2 Corinthians 13:14",
    },
];

// Historical figures only. Naming a figure asserts nothing about what
// that figure wrote about any passage — the relationship lives on the
// interpretation, which is marked demonstration.
export const figures = [
    { id: "justin-martyr", name: "Justin Martyr" },
    { id: "irenaeus", name: "Irenaeus" },
    { id: "tertullian", name: "Tertullian" },
    { id: "athanasius", name: "Athanasius" },
    { id: "augustine", name: "Augustine" },
];

// A work's date means when that specific work was written — never a
// birth or death date. No title or date is known yet: `title` is null
// and `date.status` is "pending" until research verifies them. A
// verified work carries
// `{ status: "verified", label: "c. AD 180", certainty: "approximate" | "range" }`.
export const works = [
    {
        id: "justin-martyr-work",
        figureId: "justin-martyr",
        title: null,
        date: { status: "pending", label: DATE_PENDING_LABEL },
        placeholder: true,
        demonstration: true,
    },
    {
        id: "irenaeus-work",
        figureId: "irenaeus",
        title: null,
        date: { status: "pending", label: DATE_PENDING_LABEL },
        placeholder: true,
        demonstration: true,
    },
    {
        id: "tertullian-work",
        figureId: "tertullian",
        title: null,
        date: { status: "pending", label: DATE_PENDING_LABEL },
        placeholder: true,
        demonstration: true,
    },
    {
        id: "athanasius-work",
        figureId: "athanasius",
        title: null,
        date: { status: "pending", label: DATE_PENDING_LABEL },
        placeholder: true,
        demonstration: true,
    },
    {
        id: "augustine-work",
        figureId: "augustine",
        title: null,
        date: { status: "pending", label: DATE_PENDING_LABEL },
        placeholder: true,
        demonstration: true,
    },
];

// The `order` field is an explicit PROVISIONAL order within a passage:
// it sequences the demonstration entries for display only and asserts
// no chronology or priority. Quotation, explanation, and citation are
// null until research supplies verified text.
export const interpretations = [
    {
        id: "gen-1-26-justin-martyr",
        figureId: "justin-martyr",
        workId: "justin-martyr-work",
        passageId: "gen-1-26",
        quotation: null,
        explanation: null,
        citation: null,
        placeholder: true,
        demonstration: true,
        order: 0,
    },
    {
        id: "gen-1-26-irenaeus",
        figureId: "irenaeus",
        workId: "irenaeus-work",
        passageId: "gen-1-26",
        quotation: null,
        explanation: null,
        citation: null,
        placeholder: true,
        demonstration: true,
        order: 1,
    },
    {
        id: "gen-1-26-tertullian",
        figureId: "tertullian",
        workId: "tertullian-work",
        passageId: "gen-1-26",
        quotation: null,
        explanation: null,
        citation: null,
        placeholder: true,
        demonstration: true,
        order: 2,
    },
    {
        id: "gen-1-26-athanasius",
        figureId: "athanasius",
        workId: "athanasius-work",
        passageId: "gen-1-26",
        quotation: null,
        explanation: null,
        citation: null,
        placeholder: true,
        demonstration: true,
        order: 3,
    },
    {
        id: "gen-1-26-augustine",
        figureId: "augustine",
        workId: "augustine-work",
        passageId: "gen-1-26",
        quotation: null,
        explanation: null,
        citation: null,
        placeholder: true,
        demonstration: true,
        order: 4,
    },
];

// Passage id -> interpretation ids, in provisional display order.
// Only Genesis 1:26 has demonstration entries; every other passage
// starts empty, and the UI renders an honest empty state for it.
export const passageInterpretations = {
    "gen-1-26": [
        "gen-1-26-justin-martyr",
        "gen-1-26-irenaeus",
        "gen-1-26-tertullian",
        "gen-1-26-athanasius",
        "gen-1-26-augustine",
    ],
    "john-1-1": [],
    "matt-28-19": [],
    "2cor-13-14": [],
};

const byId = (entities) => new Map(entities.map((entity) => [entity.id, entity]));
const passageById = byId(passages);
const figureById = byId(figures);
const workById = byId(works);
const interpretationById = byId(interpretations);

export function getPassage(id) {
    return passageById.get(id) ?? null;
}

export function getFigure(id) {
    return figureById.get(id) ?? null;
}

export function getWork(id) {
    return workById.get(id) ?? null;
}

export function getInterpretation(id) {
    return interpretationById.get(id) ?? null;
}

// Interpretations for a passage, in explicit provisional order.
// Unknown passage ids and passages with no entries both return [].
export function getInterpretationsForPassage(passageId) {
    const ids = passageInterpretations[passageId] ?? [];
    return ids
        .map((id) => interpretationById.get(id))
        .filter(Boolean)
        .sort((a, b) => a.order - b.order);
}

// Display label for a work's writing date. A pending date renders its
// pending label; a verified date renders its label (and only a verified
// date ever renders a year).
export function getWorkDateLabel(work) {
    if (!work?.date) return DATE_PENDING_LABEL;
    if (work.date.status === "verified") return work.date.label;
    return DATE_PENDING_LABEL;
}

// Display label for a work's title. No title is ever invented: until
// research verifies one, the pending label is shown.
export function getWorkTitleLabel(work) {
    if (!work || work.title == null || work.title === "") return TITLE_PENDING_LABEL;
    return work.title;
}
