// Pure sitemap builder, shared by the generate-sitemap script and the
// tests. Keeping the XML construction here (no JSX, no browser APIs)
// lets the tests assert on the exact production output without running
// a build.
//
// The sitemap lists only public, canonical, indexable pages:
//  - every Bible chapter URL from the verified chapter manifest
//    (frontend/src/data/bibleChapters.json)
//  - any extra static public paths passed in (currently "/" and "/about",
//    the public landing and About pages; /search, /login, /register must never
//    be indexed, so they are never passed here)
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
