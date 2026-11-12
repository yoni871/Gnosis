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
topics/    civilizations/ people/ places/ cultures/ periods/ — one <id>.json + .md each
sources/   references.json — the single source registry
```

IDs are stable and never renamed once published: events `event-<slug>`
(file `events/<slug>.json`), topics `<category>-<slug>`, sources
`source-<slug>`. Book slugs are the lowercase, hyphenated display name
(`2-kings`, `song-of-solomon`).

## The split-file rule

- `<id>.json` holds everything structured: identity, status, primary
  Scripture, date and its uncertainty class, locations, topics,
  connections, related events, sources, review record.
- `<id>.md` holds prose only, split by level-2 headings that map 1:1 to
  the event structure: `## Overview` (80–150 words), `## Ancient World`
  (200–400 words, in `###` subsections), `## Why This Context Matters`
  (50–100 words). There is no `## Scripture` heading — the Scripture tab
  is assembled from the JSON connections.
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
2. Add the event to its book file(s) in `books/` with a `narrativeOrder`
   and a short `bookNote` (≤ ~60 words) per book.
3. Add any new sources to `sources/references.json` and cite them as
   `[^source-id]` footnotes.
4. Run `npm run build` (or `node scripts/build-history-content.js`): the
   validator fails the build on a broken reference, date, coordinate,
   footnote, word count, or HTML tag. Fix it; do not work around it.
