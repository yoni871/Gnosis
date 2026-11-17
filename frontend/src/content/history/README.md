# Biblical History — content

Static, version-controlled editorial content for the Biblical History
feature (`/biblical-history`). No backend, no database, no API calls:
the build script validates these files and generates the published-only
content the app loads. See the Biblical History implementation plan
(`~/workspace/your_files/biblical-history-implementation-plan/`) for the
full schemas; this file is the short contributor version.

## Layout

```
books/     one <book-slug>.json per book that has content (genesis.json, …)
events/    one <event-slug>.json + <event-slug>.md per event
categories/ one <category-slug>.json + <category-slug>.md per category
topics/    civilizations/ people/ places/ cultures/ periods/ — one <id>.json + .md each
sources/   references.json — the single source registry
```

IDs are stable and never renamed once published: events `event-<slug>`
(file `events/<slug>.json`), categories `category-<slug>` (file
`categories/<slug>.json`), topics `<category>-<slug>`, sources
`source-<slug>`. Book slugs are the lowercase, hyphenated display name
(`2-kings`, `song-of-solomon`).

## Book files — the unified `entries` array

A book file lists its timeline entries in one `entries` array, in
narrative order, each with a `kind` discriminator:

```json
{ "eventId": "event-creation", "kind": "event", "narrativeOrder": 1, "bookNote": "…" }
{ "categoryId": "category-nations-and-babel", "kind": "category", "narrativeOrder": 11, "bookNote": "…" }
```

`narrativeOrder` is unique across the whole array (events and
categories share one sequence). A stale `events` key in a book file
fails validation — it would be silently ignored. During the interim
the Genesis timeline is mixed: 10 event entries (orders 1–10) plus
category entries numbered 11–14 as the new categories land.

## Categories

A category is a standalone synthesis record covering a wide span of a
book (e.g. the Nations and Babel, Gen 10–11) — a new record type
alongside events, not a bigger event. It lives in `categories/`
(the directory is kept in git by an empty `.gitkeep` until the first
category lands) as `<slug>.json` + `<slug>.md`, with id
`category-<slug>` and `"category": "category"`.

A category record carries:

- `era`: `"primeval"` (Gen 1–11) or `"patriarchal"` (Gen 12–50).
  The boundary is Gen 11/12 — an editorial classification, not
  something derived from the chapter numbers.
- `primaryScripture`: a **representative** passage, not the whole
  span — at most 3 chapters (`endChapter − startChapter ≤ 2`), so
  the Scripture companion stays a single readable passage.
- `fullRange`: the category's whole span, in the same four-field
  shape. `primaryScripture` must lie within `fullRange` in the same
  book (chapter- and, where the chapters coincide, verse-level
  containment).
- `date`: the same date rules as events. The content PRs use
  `type: "unknown"`.
- `claims`: OPTIONAL — a category may carry no `claims` key at all
  (as Creation proves for events). When present, each claim needs
  `id` / `claim` / `evidence` / `assessment`, and its ids must be
  unique across the whole tree.
- `connections`: a non-empty array, validated exactly like event
  connections (Scripture ref, type, confidence, note).
- `sources`: registry ids; the published rule applies exactly as for
  events — a published category citing a
  `not-independently-verified` source needs
  `review.editorialOverride`.
- `relatedEvents`: event ids that resolve to events. Categories link
  to events, not to other categories — there is no
  `relatedCategories` field.
- `review`: the same shape as events (`author`, `reviewer`,
  `lastReviewed`, `checklistVersion`).
- `locations`, `topics`: optional arrays (default `[]`), resolved
  against the topics map like events.

**`constituentEvents` is rejected.** A category does not list the
events it subsumes — it is a synthesis record, and the event files
stay the canonical research records. A category record containing a
`constituentEvents` key fails validation.

Category prose uses the same three `##` sections as events
(`Overview`, `Ancient World` with `###` subsections, `Why This
Context Matters`) but the standalone-synthesis caps (migration plan
§4.6 option (ii)): Overview 300–600 words, Ancient World 800–1,500
words, Why This Context Matters 150–300 words (same ±10% warning
band as events). The same Markdown rules apply (no raw HTML, links
http(s) / site-internal / anchor only, footnotes `[^source-id]` in
the registry). Every category must be listed by at least one book,
and every category `.md` needs its `.json` and vice versa.

## The split-file rule

- `<id>.json` holds everything structured: identity, status, primary
  Scripture, date and its uncertainty class, locations, topics,
  connections, related events, sources, review record.
- `<id>.md` holds prose only, split by level-2 headings that map 1:1 to
  the event structure: `## Overview` (80–150 words), `## Ancient World`
  (200–400 words, in `###` subsections), `## Why This Context Matters`
  (50–100 words). There is no `## Scripture` heading — the Scripture tab
  is assembled from the JSON connections. Category prose uses the same
  three sections with wider caps — see "Categories" above.
- No YAML frontmatter. No raw HTML in Markdown (the build rejects it).
- Citations are footnotes into the registry: `[^source-id]`. The key must
  exist in `sources/references.json`. Never paste a bare URL or a
  hand-typed bibliography entry into prose.
- Never paste licensed-translation Scripture text (ESV / NIV / NLT / NKJV /
  NASB 2020) into a `.md` file. Brief public-domain quotation (KJV / ASV /
  WEB / BSB), named, is the only quotation allowed — and a reader link is
  almost always better.

## Scripture ranges — four independent fields

Every reference uses `{ book, bookId, startChapter, startVerse?, endChapter,
endVerse? }`. Verses omitted means whole chapter(s). Genesis 1:1–2:3 is
`startChapter 1, startVerse 1, endChapter 2, endVerse 3`. Display labels
are derived by `formatScriptureRange()` — never store a label string.

## Two confidence axes — do not mix them

- **Date type** (`date.type`): `established | approximate | traditional |
  proposed | unknown`. `traditional` requires `traditionalSystem`;
  `unknown` requires `yearStart`/`yearEnd` null.
- **Claim confidence** (`confidence` on connections): `established |
  probable | debated | traditional | unknown`. **Connection confidence
  means confidence that the passage is textually relevant to the event,
  NOT certainty that every interpretive claim in the connection's note is
  established.** Interpretive readings must be qualified in the note
  itself (e.g. "contested", "interpretive", "debated"), and the Scripture
  tab states this distinction where the badges are shown. A separate
  `interpretationStatus` field (splitting link confidence from
  interpretation confidence) is a possible later change — do not invent
  it in a content PR; it needs a schema, validator, and renderer change.

## Footnote numbering

Footnote numbers run continuously through the whole event in
first-citation order (Overview, then Ancient World, then Why This Context
Matters) — never restarting at 1 per section. `resolveHistoryFootnotes`
takes an optional shared footnote list for this; `loadEventSections`
threads one list through every section.

## Editorial statuses and the build gate

`draft → in-review → verified → published`. Only `published` records are
generated into `src/generated/history/` and bundled. Draft, in-review, and
verified records exist in this tree for PR review only — they never reach
`dist/`, the sitemap, or any deployed build. Unpublished event *titles*
do not ship either.

Internal editorial metadata never ships either. The source tree keeps
the full review record (`review.notes`, reviewer history, editorial
overrides) and source verification (`verification`,
`verificationDetail`) for research and validation, but the generator
strips them at generation time (`generateHistoryContent`): generated
event/topic JSON has no `review` key and generated `sources.json` has
no `verification`/`verificationDetail`. Nothing at runtime reads those
fields — validation reads the override from the sources before
generation, and the public UI renders from `status` only. Do not add
editorial fields to generated output to work around a check; fix the
source record instead.

To preview an unpublished record locally (never in CI or production):

```
HISTORY_INCLUDE_UNPUBLISHED=1 npm run dev
```

## Sources and verification status

Each source in `sources/references.json` carries `verification`
(`verified` | `not-independently-verified`) and `verificationDetail`
(the sections/pages actually consulted and the claims they support).
These are internal editorial records: the public Sources list renders
author, title, publication details, and the original-source link only,
and never renders a verification badge or label. A source is marked
`verified` only when the full text (or, for institutional pages, the
actual page) has been consulted and every cited claim confirmed;
abstract-only checks stay `not-independently-verified`. Contested
interpretations are qualified in the prose and connection notes, not in
badges — removing the badges does not remove those qualifications.

The flag only affects `npm run dev` (its `predev` hook). It has no effect
on any build: `npm run build`, `npm run build:check`, and direct
`vite build` always generate published-only content, and the postbuild
gate fails the build if any non-published record reaches `dist/`.

## Adding an event

1. Add `events/<slug>.json` + `events/<slug>.md` (see `creation.*` for the
   shape — it is researched content, now `published` after editorial
   approval; a new event starts at `draft` or `in-review`).
2. Add the event to its book file(s) in `books/` as an `entries`
   entry with `kind: "event"`, a `narrativeOrder`, and a short
   `bookNote` (≤ ~60 words) per book.
3. Add any new sources to `sources/references.json` and cite them as
   `[^source-id]` footnotes.
4. Run `npm run build` (or `node scripts/build-history-content.js`): the
   validator fails the build on a broken reference, date, coordinate,
   footnote, word count, or HTML tag. Fix it; do not work around it.

## Adding a category

1. Add `categories/<slug>.json` + `categories/<slug>.md` (see the
   "Categories" section above for the shape — a new category starts
   at `draft` or `in-review`).
2. Add the category to its book file(s) in `books/` as an `entries`
   entry with `kind: "category"`, the next `narrativeOrder`, and a
   short `bookNote` (≤ ~60 words) per book.
3. Add any new sources to `sources/references.json` and cite them as
   `[^source-id]` footnotes.
4. Run `npm run build` (or `node scripts/build-history-content.js`):
   the validator fails the build on a broken reference, date, era,
   range, footnote, word count, or HTML tag. Fix it; do not work
   around it.
