// Pure sitemap builder, shared by the generate-sitemap script and the
// tests. Keeping the XML construction here (no JSX, no browser APIs)
// lets the tests assert on the exact production output without running
// a build.
//
// The sitemap lists only public, canonical, indexable pages:
//  - every Bible chapter URL from the verified chapter manifest
//    (frontend/src/data/bibleChapters.json)
//  - any extra static public paths passed in (currently "/", "/about",
//    and "/privacy", the public landing, About, and Privacy pages;
//    /search, /login, /register must never be indexed, so they are
//    never passed here)
//  - Biblical History pages with published content, derived from the
//    published-only generated manifest (see historySitemapPaths):
//    the index, book pages with published content, and published event
//    URLs. Unpublished events never appear — the manifest is
//    published-only by construction, and the helper additionally
//    requires each event id to be listed in it.
//
// lastmod, changefreq, and priority are deliberately omitted: no
// per-chapter modification date exists, and Google ignores changefreq
// and priority. Guessing at them would add noise, not signal.

function escapeXml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function chapterUrls(siteUrl, chapterCounts) {
    const urls = [];

    for (const [book, count] of Object.entries(chapterCounts)) {
        for (let chapter = 1; chapter <= count; chapter += 1) {
            urls.push(
                `${siteUrl}/bible/${encodeURIComponent(book)}/${chapter}`,
            );
        }
    }

    return urls;
}

// Biblical History sitemap paths, derived from the PUBLISHED-ONLY
// generated manifest — never from the source tree, so an unpublished
// event cannot appear by construction. `manifest` is the generated
// manifest.json ({ books: [bookId], events: [eventId], ... }); `books`
// is the generated book records ({ id, events: [{ eventId }] }).
// Returns ["/biblical-history", "/biblical-history/books", "/biblical-history/<book>",
// "/biblical-history/<book>/<event-slug>", ...]: the index first, then
// each published book with its published events, all sorted
// deterministically. Returns [] when nothing is published — a book with
// no published content gets no URL, and an event listed in no generated
// book (or not in the manifest) gets none either.
export function historySitemapPaths(manifest, books) {
    const publishedBooks = [...(manifest?.books ?? [])].sort();
    if (publishedBooks.length === 0) return [];
    const publishedEvents = new Set(manifest?.events ?? []);
    const byId = new Map((books ?? []).map((book) => [book.id, book]));
    const paths = ["/biblical-history", "/biblical-history/books"];
    for (const bookId of publishedBooks) {
        paths.push(`/biblical-history/${encodeURIComponent(bookId)}`);
        const slugs = (byId.get(bookId)?.events ?? [])
            .map((entry) => entry.eventId)
            .filter((id) => typeof id === "string" && publishedEvents.has(id))
            .map((id) => id.replace(/^event-/, ""))
            .sort();
        for (const slug of slugs) {
            paths.push(`/biblical-history/${encodeURIComponent(bookId)}/${encodeURIComponent(slug)}`);
        }
    }
    return paths;
}

export function buildSitemapXml(siteUrl, chapterCounts, extraPaths = []) {
    const urls = [
        ...chapterUrls(siteUrl, chapterCounts),
        ...extraPaths.map((path) => `${siteUrl}${path}`),
    ];

    const entries = urls
        .map((url) => `  <url>\n    <loc>${escapeXml(url)}</loc>\n  </url>`)
        .join("\n");

    return (
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `${entries}\n` +
        `</urlset>\n`
    );
}
