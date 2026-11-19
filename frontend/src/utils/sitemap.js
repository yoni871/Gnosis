// Pure sitemap builder, shared by the generate-sitemap script and the
// tests. Keeping the XML construction here (no JSX, no browser APIs)
// lets the tests assert on the exact production output without running
// a build.
//
// The sitemap lists only public, canonical, indexable pages:
//  - every Bible chapter URL from the verified chapter manifest
//    (frontend/src/data/bibleChapters.json)
//  - any extra static public paths passed in (currently "/", "/about",
//    "/privacy", and "/trace-the-doctrine", the public landing, About,
//    Privacy, and Trace the Doctrine pages; /search, /login, /register
//    must never be indexed, so they are never passed here)
//  - Biblical History pages with published content, derived from the
//    published-only generated manifest (see historySitemapPaths):
//    the index, landing pages for books with published entries, and
//    published event and category URLs. Unpublished entries never
//    appear — the manifest is published-only by construction, and
//    the helper also checks each entry against it.
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
// event or category cannot appear by construction. `manifest` is the
// generated manifest.json ({ books: [bookId], events: [eventId],
// categories: [categoryId], ... }); `books` is the generated book
// records ({ id, entries: [{ kind, eventId | categoryId }] }).
// Returns ["/biblical-history",
// "/biblical-history/<book>",
// "/biblical-history/<book>/<event-slug>",
// "/biblical-history/<book>/<category-slug>", ...]: the index first,
// then each published book's landing page, events, and categories,
// all sorted deterministically (books in manifest order, slugs
// alphabetically within a book, events and categories interleaved by
// slug). A category URL is "/biblical-history/<book>/<category-slug>"
// where the slug is the category id minus the "category-" prefix, and a
// category is listed only when its id is in manifest.categories AND its
// book carries an entry for it — exactly like events. Returns []
// when nothing is published — a book with no published content gets no
// URL, and an event or category listed in no generated book (or not in
// the manifest) gets none either. With no categories in the manifest
// the output is exactly the event-only output.
export function historySitemapPaths(manifest, books) {
    const publishedBooks = [...(manifest?.books ?? [])].sort();
    if (publishedBooks.length === 0) return [];
    const publishedEvents = new Set(manifest?.events ?? []);
    const publishedCategories = new Set(manifest?.categories ?? []);
    const byId = new Map((books ?? []).map((book) => [book.id, book]));
    const paths = ["/biblical-history"];
    for (const bookId of publishedBooks) {
        const slugs = [...new Set(
            (byId.get(bookId)?.entries ?? [])
                .map((entry) => {
                    if (entry.kind === "event"
                        && typeof entry.eventId === "string"
                        && publishedEvents.has(entry.eventId)) {
                        return entry.eventId.replace(/^event-/, "");
                    }
                    if (entry.kind === "category"
                        && typeof entry.categoryId === "string"
                        && publishedCategories.has(entry.categoryId)) {
                        return entry.categoryId.replace(/^category-/, "");
                    }
                    return null;
                })
                .filter(Boolean),
        )].sort();
        if (slugs.length > 0) paths.push(`/biblical-history/${encodeURIComponent(bookId)}`);
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
