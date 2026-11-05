# Gnosis SEO Foundation

What this covers: the SEO infrastructure for studygnosis.com as of the
SEO-foundation change — audit findings, what was implemented, the plan
for making chapter content indexable in initial HTML, landing-page
implementation, and the remaining Google Search Console steps.

Status: the foundation in this document is implemented and tested. The
landing page is implemented (see section 4), and
chapter content is NOT yet in the initial HTML (see "Indexable chapter
content"). Nothing here has been submitted to Google; Search Console
verification and sitemap submission are still open steps.

## 1. Audit findings

Findings are stated against latest main before the SEO change
(frontend: React 19 / Vite 8 / react-router-dom 7 SPA, served by Vercel
with an SPA-fallback rewrite; backend: Express on a separate Vercel
project; database: Neon Postgres).

1. **No metadata at all.** `frontend/index.html` carried only
   `<title>Gnosis</title>` — no description, no Open Graph tags, no
   canonical, no robots directive. No code anywhere updated
   `document.title`, so every chapter page shared one generic title.
2. **Chapter navigation was invisible to crawlers.** The chapter
   selector's previous/next controls were `<button>` elements calling
   `navigate()`. Crawlers follow `<a href>` anchors; they do not click
   buttons. Chapter-to-chapter discovery therefore depended entirely on
   external links — there was no sitemap either.
3. **No sitemap, no robots.txt.** Neither file existed anywhere in the
   repo or the production build.
4. **Every URL served the same shell.** The Vercel SPA-fallback rewrite
   (`/(.*)` → `/index.html`) means every chapter URL returns the same
   HTML shell with no chapter content and generic metadata. Googlebot
   does render JavaScript (see section 5), but chapter content arrives
   only after client-side API calls to a separate origin.
5. **Query parameters could create duplicate pages.** The reader keeps
   state in `?verse=`, `?translation=`, and `?commentary=`, and search
   results live at `/search?q=`. No canonical tag existed to collapse
   those variants onto one URL.
6. **Heading structure is acceptable and was left alone.** Chapter
   pages already render a `<section>` with the book name as an `<h2>`
   and verses in `<p>` elements, under the brand `<h1>` in the header.
   Promoting the chapter title to `<h1>` would mean demoting the brand
   heading; that is a presentation decision for the landing-page work,
   not something this change rewrites.
7. **CORS is open (`app.use(cors())`)**, so a crawler rendering a
   chapter page can successfully call the backend API origin. This is
   required for any JavaScript-rendered indexing to work.
8. **Pre-existing lint errors are untouched.** `StudyPage.jsx` and
   `SearchResultsPage.jsx` have `react-hooks/set-state-in-effect`
   errors on main. They are unrelated to SEO, CI does not gate on lint,
   and this change does not fix or worsen them.

## 2. What was implemented

All paths are under `frontend/` unless noted.

### Dynamic metadata (`src/components/Seo.jsx`, `src/utils/seo.js`)

- A dependency-free `<Seo>` component sets `document.title` plus
  description, robots, canonical, Open Graph (`og:title`,
  `og:description`, `og:type`, `og:url`, `og:site_name`), and Twitter
  card tags, creating each tag once and updating it in place on route
  changes. No new library was added: the site needs a dozen tags, not
  a metadata framework.
- Chapter pages (`StudyPage`) render `<Seo>` with:
  - Title: `{Book} {Chapter} Commentary & Bible Study | Gnosis`
    (e.g. `Psalm 23 Commentary & Bible Study | Gnosis` — the book
    "Psalms" uses its ordinary reference form "Psalm" in titles and
    descriptions; see `chapterDisplayName`).
  - Description: `Study {Book} {Chapter} verse by verse on Gnosis,
    with the Scripture text and classic Bible commentary to help you
    understand God's Word.` — unique per chapter, and it claims only
    what the page actually serves (Scripture text plus the classic
    commentary panel: Matthew Henry and Jamieson-Fausset-Brown).
  - Canonical: the clean `https://studygnosis.com/bible/:book/:chapter`
    URL, percent-encoded (`1%20Samuel`), with no query string.
  - `og:type` `article`, robots `index, follow`.
- `/login`, `/register`, and `/search` render `<Seo>` with robots
  `noindex, nofollow` and clean canonicals (`/search` without `?q=`).
  Search results must not appear in search results, and auth pages
  must never be indexed.
- `index.html` carries the site-wide default metadata (the
  landing page's title and description — see section 4). It carries no
  canonical tag on purpose: the shell is served for every route, so a
  static canonical would point every chapter URL at the wrong address.

### Crawlable chapter navigation

- `ChapterSelector` previous/next controls are now real `<Link>`
  anchors to `/bible/:book/:chapter` (with an `aria-label` and a
  disabled placeholder at the first/last chapter). The reader page
  already syncs its state from URL parameters, so following the link is
  all navigation needs. The chapter dropdown still uses buttons — it is
  picker UI, not crawler navigation, and is unchanged.

### Sitemap (`scripts/generate-sitemap.js`, `src/utils/sitemap.js`)

- `public/sitemap.xml` lists exactly the public, canonical, indexable
  pages: **1,189 Bible chapter URLs plus the homepage (1,190 total).**
  `/login`, `/register`, and
  `/search` are excluded by design.
- Chapter counts are verified, not guessed. The manifest
  (`src/data/bibleChapters.json`) was counted from
  `backend/src/bsb.xlsx` — the same file the production Bible import
  reads — replicating the importer's parsing (skip the first 3 header
  rows, `Book Chapter:Verse` references, `Psalm` → `Psalms`): **66
  books, 1,189 chapters, 31,102 verses, no chapter gaps, exact match
  with `backend/src/data/bible_books.json`.**
- The generator is dependency-free Node, runs on every deploy via the
  `prebuild` script, and the generated file is committed so it is
  reviewable and present in builds that skip npm hooks
  (`npm run build:check` in CI). If Bible data ever changes, recount
  from the import source, update the manifest, and the next deploy
  picks the new pages up automatically.
- `lastmod`, `changefreq`, and `priority` are omitted deliberately: no
  per-chapter modification date exists, and Google ignores changefreq
  and priority. The file is a single sitemap (1,190 URLs, far under the
  50,000 URL / 50 MB limits), so no sitemap index is needed.
- Serving: files in `public/` are copied to the build root, and Vercel
  serves static files before the SPA-fallback rewrite applies. The
  production build was verified to contain `dist/sitemap.xml` and
  `dist/robots.txt` at root, so `https://studygnosis.com/sitemap.xml`
  resolves without a rewrite rule.

### Robots.txt (`public/robots.txt`)

- Allows all crawlers on public pages, disallows `/login`, `/register`,
  and `/search`, references the sitemap, and blocks no JavaScript,
  stylesheets, or images (crawlers need them to render chapter pages).
- Query-parameter variants are deliberately NOT blocked: blocking them
  would stop crawlers from reaching the canonical tag on chapter
  pages. Duplicates are handled by the canonical URL instead.
- Follow-up: when the email-verification work lands its
  `/verify-email` route, add `Disallow: /verify-email` here.

### Site URL configuration

- Canonical and sitemap URLs use `VITE_SITE_URL` when set (so preview
  deployments can carry their own origin) and default to
  `https://studygnosis.com`. The value is public bundle data, never a
  secret. `robots.txt` references the production sitemap URL directly,
  as the format requires an absolute URL; if the domain ever changes,
  update it together with the default.

### Tests

- `src/utils/seo.test.js` — titles, descriptions, encoding, canonical
  form, and the Psalms → Psalm rule.
- `src/components/Seo.test.jsx` — tags are set, and navigating from a
  chapter to a noindex page replaces (never duplicates) them.
- `src/utils/sitemap.test.js` — builder output, the verified manifest
  totals (66 books, 1,189 chapters), the exact 1,190-URL production
  list with no duplicates, spaces, query strings, or auth/search URLs,
  and byte-equality between the committed `public/sitemap.xml` and the
  generator output.
- `src/components/Navigation/ChapterSelector.test.jsx` — prev/next are
  real links with correct hrefs, following one changes the route, and
  boundary chapters render no link.
- Full frontend suite: **136/136 pass**; production build
  (`npm run build:check`) passes with `dist/sitemap.xml` and
  `dist/robots.txt` present.

## 3. Keyword mapping

Keywords are used naturally in titles and descriptions, never stuffed,
and no page claims a feature it does not have.

- Primary keywords map to chapter pages through the shared template:
  "Bible commentary", "online Bible study", "Bible verse
  explanation", and "verse-by-verse Bible study" are covered by the
  title/description wording on every chapter page.
- "Matthew Henry commentary" and "Jamieson-Fausset-Brown commentary"
  are NOT named in chapter descriptions: per-chapter commentary
  coverage was verified at book level (both commentaries ship
  whole-book entries), but naming a specific commentator on a chapter
  page would overclaim for that chapter. These keywords belong to the
  future landing page, which can introduce both commentaries by name,
  and to the commentary UI itself.
- Long-tail keywords map directly: `Psalm 23 commentary`,
  `Isaiah 53 explanation`, `Romans 8 commentary`,
  `Genesis 1 Bible study` are exactly the chapter titles and
  descriptions this change generates, and the `[Book] [Chapter]
  commentary` / `[Book] [Chapter] explained` pattern is the template
  itself, applied to all 1,189 chapters.

## 4. Landing page (built)

The landing page now exists at `/` (`src/pages/LandingPage.jsx`),
and the preparation items from the SEO foundation are done:

1. **Routing.** The `/` route renders `<LandingPage />`; the old
   redirect to `/bible/Genesis/1` is gone, and the reader stays at
   `/bible/:book/:chapter`.
2. **Metadata.** The landing page sets `LANDING_TITLE` and
   `LANDING_DESCRIPTION` from `src/utils/seo.js` explicitly through
   `<Seo>`, with canonical `https://studygnosis.com/`, Open Graph
   and Twitter tags, and `WebSite` JSON-LD.
3. **Sitemap.** `scripts/generate-sitemap.js` passes `["/"]` as
   `extraPaths`, so `public/sitemap.xml` lists 1,189 chapter URLs
   plus the homepage (1,190 total, homepage last).
4. **Content.** The page introduces Gnosis and its purpose,
   highlights Bible study features (Scripture text, verse-by-verse
   commentary including Matthew Henry and Jamieson-Fausset-Brown,
   notes and highlights), and links crawlers to the reader through
   `Start Studying` (`/bible/Genesis/1`) and the Explore Scripture
   passage links. Its `og:image` is a raster hero asset
   (`/images/landing/sunset-hero-images/hero-1200.jpg`); the `/gnosis.svg` logo is an
   SVG, which social previews handle poorly, so it is not used as
   the social image.

The initial HTML also supplies the hero social-image URL and large Twitter
card for crawlers that do not execute JavaScript. These are site-wide
fallbacks; route-specific canonical, social metadata, and homepage WebSite
JSON-LD still require rendering. No static homepage canonical or WebSite
JSON-LD is inserted into the shared chapter HTML shell.

Landing navigation uses disclosure buttons with Escape focus restoration,
outside-click and focus-leave dismissal. The narrow layout keeps copy above
the untouched hero; overlay copy starts at 1200px to avoid clipping the
laptop at tablet widths. Image delivery uses WebP with JPEG fallback,
`100vw` sizes, explicit dimensions, and high hero fetch priority. There
are no below-the-fold raster images or new dependencies.

## 5. Indexable chapter content (prerendering plan)

### The question

Can Google reliably index individual Bible chapters from this React
SPA? The honest answer: partially, and not promptly. Googlebot does
render JavaScript (it runs a modern Chrome and waits for rendering),
and this site's setup is favorable to that — open CORS, no
JavaScript/asset blocking, unique URLs, canonicals, and now a full
sitemap plus crawlable prev/next links. But rendering is deferred to a
second indexing wave, each of the 1,189 chapter URLs needs its own
render plus API round-trips, and any render failure or timeout leaves
that chapter indexed with shell-only content. Changing
`document.title` alone was never sufficient; the metadata in this
change fixes titles and descriptions for rendered crawls, but chapter
*content* still is not in the initial HTML.

### Recommendation: build-time prerendering (Phase 2, not this change)

Prerender every public chapter URL at build time into static HTML
that contains the real chapter content — the chapter heading, the
verse text, the metadata and canonical from this change, and the
prev/next links — plus the normal script tags so React takes over in
the browser exactly as today. Serve those files from Vercel ahead of
the SPA-fallback rewrite, so crawlers and users get content in the
first response while the interactive reader is unchanged.

Why this over the alternatives:

- **Dynamic rendering (serve prerendered HTML to bots only):** works
  mechanically, but Google describes it as a workaround, not a
  long-term solution; it also adds a bot-detection layer and a
  renderer service to operate, and any mismatch between bot HTML and
  user HTML risks cloaking flags. Rejected.
- **Full server-side rendering (e.g. migrating to Next.js):** the
  correct architecture for a content site at larger scale, but a
  framework migration to fix indexing is disproportionate while the
  site has one content type (chapters) and a known, finite URL set
  (1,189). Rejected for now; revisit if the site gains many more
  public content types.
- **Prerendering:** fits the shape of the problem — a finite, stable
  URL set generated from data already in the repo (the BSB text and
  the chapter manifest). Build cost is one static file per chapter;
  runtime cost is zero; no framework change; no bot detection.

Phase 2 work (not started): a build script that renders each chapter
page to static HTML from the Bible text data, Vercel routing that
serves the prerendered file when it exists and falls back to
`index.html` otherwise, verification that the prerendered HTML's
visible text matches what the client renders (no cloaking gap), and a
check that authenticated features (notes, bookmarks, highlights)
remain client-only and never leak into prerendered output.

### Structured data

No chapter JSON-LD is emitted, deliberately. There is no
Google-supported rich-result type for Scripture text, and inventing
`Article` markup for Bible chapters would misdescribe the content.
`BreadcrumbList` becomes worthwhile now that `/` is a real landing
page (Home → Bible → Book → Chapter). It belongs on the chapter
pages, not on the homepage itself, so it was not added by the
landing-page change; the homepage carries `WebSite` JSON-LD only.
Adding `BreadcrumbList` to chapter pages is a separate, small
follow-up.

### Semantic HTML, already in place

Chapter pages render a `<section>` with the book heading and verses in
`<p>` elements; the header brand is the page `<h1>`. See the audit
note on headings in section 1.

## 6. Google Search Console — remaining steps

Nothing here is verified or submitted yet, and no claim otherwise
should be made. When ready:

1. **Add the property** `https://studygnosis.com` in Search Console
   (a Domain property is the better choice if DNS access is
   available, since it covers all subdomains; otherwise a URL-prefix
   property for exactly `https://studygnosis.com`).
2. **Verify ownership** by whichever method Search Console offers:
   - DNS TXT record (works for Domain properties; no code change), or
   - HTML file upload to the site root (a file in `frontend/public/`,
     like `robots.txt` and `sitemap.xml`, is served at root — add it
     the same way when a token is provided), or
   - HTML meta tag (add it to `index.html` next to the other default
     meta tags when a token is provided).
   Support here means: give Muse the verification token or DNS record
   and it will be added in exactly one of those places.
3. **Submit the sitemap** at `https://studygnosis.com/sitemap.xml`
   (already live in the production build; verify it loads in a browser
   after deploy before submitting).
4. **After submission, check** the Pages report for chapter URLs
   (expect gradual indexing — see section 5 on render deferral) and
   the Sitemaps report for the 1,190 discovered URLs. If chapter pages
   appear as "Crawled — currently not indexed" in large numbers, that
   is the signal to prioritize Phase 2 prerendering.
5. **When the landing page ships**, request indexing for `/` and
   confirm the sitemap picks it up (section 4, step 3).

## 7. Open follow-ups

- Phase 2 prerendering (section 5) — the remaining gap between
  "Google can render chapters" and "chapter content is in the initial
  HTML".
- `Disallow: /verify-email` in `robots.txt` when that route lands.
- BreadcrumbList JSON-LD with the landing page (section 5).
- If the production domain ever changes, update the default in
  `src/utils/seo.js`, the generator default in
  `scripts/generate-sitemap.js`, the sitemap URL in `robots.txt`, and
  the `og:url` in `index.html` together.
