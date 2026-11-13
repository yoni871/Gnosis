// Shared SEO helpers for the Gnosis frontend.
//
// The canonical site URL is configurable at build time through
// VITE_SITE_URL so preview deployments can carry their own origin.
// Production defaults to the public site, https://studygnosis.com.
// The value is public bundle data (it appears in canonical URLs and
// Open Graph tags), never a secret.
//
// Chapter metadata intentionally avoids per-chapter claims the codebase
// cannot back: every chapter page serves Scripture text plus the classic
// commentary panel, so descriptions say exactly that and nothing more.
// Book display names follow ordinary Bible-reference convention: the
// book is "Psalms", but a chapter reference reads "Psalm 23".

const FALLBACK_SITE_URL = "https://studygnosis.com";

export function getSiteUrl() {
    const configured =
        typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_SITE_URL
            ? String(import.meta.env.VITE_SITE_URL).trim()
            : "";

    if (!configured) {
        return FALLBACK_SITE_URL;
    }

    return configured.replace(/\/+$/, "");
}

// The landing page's metadata. This is the site's public identity:
// Scripture as the foundation, with theology, history, and Christian
// thought as interconnected areas of exploration. It describes the
// platform's direction, not a feature list — it names no feature the
// site does not have. index.html carries these as the site-wide
// default, and the landing page sets them explicitly through <Seo>.
export const LANDING_TITLE =
    "Gnosis | Explore Scripture, Theology & Christian History";

export const LANDING_DESCRIPTION =
    "Explore Scripture alongside trusted commentary and discover the " +
    "connections between God\u2019s Word, theology, history, and " +
    "Christian thought.";

// Display name for a chapter reference. Only Psalms differs from its
// database name: the book is "Psalms", the reference is "Psalm 23".
export function chapterDisplayName(book) {
    return book === "Psalms" ? "Psalm" : book;
}

// Canonical path for a chapter page. Book names are percent-encoded
// ("1 Samuel" -> "1%20Samuel") so the URL is valid in sitemaps and
// canonical tags. Query parameters (?verse=, ?translation=,
// ?commentary=) are reader state, never part of the canonical URL.
export function chapterPath(book, chapter) {
    return `/bible/${encodeURIComponent(book)}/${chapter}`;
}

export function chapterUrl(book, chapter, siteUrl = getSiteUrl()) {
    return `${siteUrl}${chapterPath(book, chapter)}`;
}

export function chapterTitle(book, chapter) {
    return (
        `${chapterDisplayName(book)} ${chapter} ` +
        `Commentary & Bible Study | Gnosis`
    );
}

export function chapterDescription(book, chapter) {
    return (
        `Study ${chapterDisplayName(book)} ${chapter} verse by verse ` +
        `on Gnosis, with the Scripture text and classic Bible ` +
        `commentary to help you understand God\u2019s Word.`
    );
}

export function pageUrl(path, siteUrl = getSiteUrl()) {
    return `${siteUrl}${path}`;
}

// Biblical History helpers. Routes use book/event slugs
// (/biblical-history/genesis/creation); the book-only path
// (/biblical-history/genesis) is the redirect source — it sends books
// with published events to their first event and serves the Upcoming
// page for books without any. Reader links still go through
// chapterPath (display names).
export function historyPath(bookSlug, eventSlug) {
    if (eventSlug) return `/biblical-history/${bookSlug}/${eventSlug}`;
    if (bookSlug) return `/biblical-history/${bookSlug}`;
    return "/biblical-history";
}

export function historyIndexTitle() {
    return "Biblical History | Gnosis";
}

export function historyIndexDescription() {
    return (
        "Explore the ancient world behind the biblical story, book by book, " +
        "on Gnosis — historical context for the events of Scripture."
    );
}

export function historyBookTitle(bookTitle) {
    return `Biblical History — ${bookTitle} | Gnosis`;
}

export function historyBookDescription(bookTitle, eventCount) {
    const events =
        eventCount === 1
            ? "1 historical event"
            : `${eventCount} historical events`;
    return (
        `Historical context for the book of ${bookTitle} on Gnosis: ` +
        `${events} explored with the ancient world behind the text.`
    );
}

export function historyEventTitle(eventTitle, rangeLabel) {
    return rangeLabel
        ? `${eventTitle} — ${rangeLabel} | Biblical History | Gnosis`
        : `${eventTitle} | Biblical History | Gnosis`;
}

export function historyEventDescription(eventTitle, rangeLabel) {
    // Descriptions must not assert a date the date-axis does not support:
    // an unknown-dated event's description carries no year.
    return rangeLabel
        ? `Historical context for ${eventTitle} (${rangeLabel}) on Gnosis.`
        : `Historical context for ${eventTitle} on Gnosis.`;
}

// Trace the Doctrine helpers. The homepage introduces planned doctrine
// categories only — no study workspace or published study exists yet —
// so the description says exactly that and promises no content.
export function doctrineIndexTitle() {
    return "Trace the Doctrine | Gnosis";
}

export function doctrineIndexDescription() {
    return (
        "Explore how Christian doctrines have been understood, explained, " +
        "and debated throughout church history — beginning with the " +
        "biblical text. Planned studies on Gnosis, starting with the Trinity."
    );
}
