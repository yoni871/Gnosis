# Original Language Analysis

Word-by-word original-language analysis in the reader: select a verse (or a
contiguous range) and open **Original Language Analysis** from the
verse-selection toolbar. The modal shows the English passage in the reader's
current translation, the original text verse by verse with a word table
(word, transliteration, meaning, grammar), and a detail panel for the
selected word — lemma, Strong's number, meaning, expanded grammar, a
morpheme breakdown, and other occurrences of the same lemma in the imported
corpus.

## Phase 1 scope

**Genesis 1 (Biblical Hebrew) and Philippians 3 (Koine Greek) only** — 434
Hebrew words across 31 verses, 340 Greek words across 21 verses, 774 words
in total. No other passage has data yet; opening the modal on any other
passage shows a coverage note instead of an error. The full-Bible import is
Phase 2 work and needs a separate decision (see below).

## Data sources and licences

All data comes from **STEPBible-Data**
(https://github.com/STEPBible/STEPBible-Data), **CC BY 4.0**. The file
headers state the terms plainly: "Include any part of this data in software
or publications... Download the data and reformat it for your application...
Attribute the data to Tyndale House and STEPBible.org, and include a link to
STEPBible.github.io/STEPBible-Data as the source of this data." Commercial
redistribution is explicitly allowed. The modal carries that attribution on
every passage, and the API returns it with every response.

The six files used:

| File | Contents | Edition |
| --- | --- | --- |
| TAHOT Gen-Deu | Hebrew OT words (Leningrad Codex) | WLC 4.20 via OpenScriptures |
| TAGNT Act-Rev | Greek NT words | NA27/28 text |
| TBESH | Hebrew brief lexicon (short glosses) | — |
| TBESG | Greek brief lexicon (short glosses) | — |
| TEHMC | Hebrew morphology-code expansions | — |
| TEGMC | Greek morphology-code expansions | — |

Two evaluated alternatives were **not** used as the primary source (they
remain valid cross-checks): Open Scriptures Hebrew Bible / morphhb (CC BY
4.0, WLC — but no transliteration or English glosses in the XML) and MACULA
Greek (mixed licensing per file, Nestle 1904 text rather than NA28, no
transliteration). See `~/workspace/gnosis-original-language/NOTES.md` for
the full evaluation.

**Lexicon caveat.** The TBESH header notes its brief lexicon "is based on
Abridged BDB by Online Bible... Permission should be gained from Online
Bible before these definitions are applied in any project." Phase 1
therefore imports **only the short gloss** from the lexicons, never the
fuller BDB/Abbott-Smith definition paragraphs. The word-row glosses are
STEPBible's own and are covered by CC BY 4.0. Fuller definitions are a
Phase 2 question, pending that permission.

**Inclusion rules** (from the STEPBible file headers): Hebrew — include
type `L` (Leningrad) and `Q` (Qere); exclude `K` (Ketiv), `R`, `X`. Greek
— include words whose editions column contains `NA28`; exclude TR/Byz-only
rows. In Philippians 3 that excludes 10 rows (Php 3:8#26, 3:12#18,
3:16#08–11, 3:21#08–11), so `word_index` has gaps there — the frontend
orders by `word_index` and never assumes contiguity.

**Data files are not committed to the repo.** The STEPBible licence header
asks that copies of the data files not be posted elsewhere, so the importer
downloads them into `backend/src/importer/original-language-data/`
(gitignored). Test fixtures are small attributed excerpts only.

## Database objects

Added by migration `20261106234443_add-original-language-analysis.sql`,
with the verse-0 allowance in
`20261107051000_allow-verse-zero-in-original-language.sql` (the original
`verse_number > 0` check rejected Psalm-title rows; verse 0 is only ever
a Psalm title):

- `ol_sources` — one row per STEPBible file (code, name, url, licence,
  attribution, text edition, language). Seeded by the migration.
- `ol_lexical_entries` — one row per lemma, keyed by disambiguated
  Strong's (`strong_number`, e.g. `H7225G` / `G1108`) with `strong_base`
  (the plain number, e.g. `H7225`) for display and cross-sense matching.
  Columns: lemma, transliteration, short gloss, lexical morphology,
  source. Indexed on `strong_base`.
- `ol_word_occurrences` — one row per word: source, book (FK
  `bible_books`), chapter/verse integers, `word_index` (1-based position
  in the verse, = the STEPBible word number), language, word text,
  transliteration, contextual gloss, Strong's (FK to
  `ol_lexical_entries`), raw morphology code, expanded `grammar_display`,
  and `morphemes` JSONB (per-morpheme text, transliteration, gloss,
  Strong's, morphology, expansion). `UNIQUE (source, book, chapter,
  verse, word_index)` — stable across re-imports. Indexed on the passage
  key and on `strong_number`.
- `ol_morphology_codes` — `(language, code)` → verbatim expansion string
  from TEHMC/TEGMC, with source. Only codes used by imported words are
  inserted, by the importer.

No role name is hardcoded in the migration. Privileges are granted by a
separate operator step with the role name injected from the secure release
environment:

```sql
GRANT SELECT ON ol_sources, ol_lexical_entries, ol_word_occurrences, ol_morphology_codes TO <app_role>;
```

The application role must have no other privileges on these tables — the
importer runs as the operator, not the app role. The disposable test role
gets exactly these grants; see
`backend/scripts/testing/application-database.js`.

## Importer

`backend/src/importer/importOriginalLanguage.js` (single file, following the
`importCommentary.js` convention):

```bash
# Download the six STEPBible files, then import Genesis 1 + Philippians 3:
node backend/src/importer/importOriginalLanguage.js --download

# Re-run against already-downloaded files:
node backend/src/importer/importOriginalLanguage.js [--data-dir <dir>]
```

The importer connects with the operator's `DATABASE_URL` (the same
convention as the other importers). It is idempotent: lexical entries,
morphology codes, and word occurrences are upserted on their natural keys,
so re-running refreshes without duplicating. A first import writes 774
words, 264 lexical entries, and 175 morphology codes.

Notes on parsing, all verified against the source files:

- Every parsed line is NFC-normalized first: the sources mix legacy Greek
  oxia characters with tonos, and Hebrew combining-mark orders, so the
  same word would otherwise compare unequal depending on where it came
  from.
- Hebrew morphology lookup is positional: the language letter (`H`/`A`)
  is carried on the first morpheme's code only; later morphemes carry bare
  codes that take the word's language letter. A bare code starting with
  `A` is an adjective, not Aramaic.
- A `\` in a TAHOT word marks maqqef (־) or sof pasuq (׃). The importer
  strips the marker from the display text (keeping the punctuation
  character) and drops the punctuation Strong's from the morpheme list.
- The grammar display flattens each morpheme's expansion into tokens
  ("Noun · Genitive · Singular · Feminine"), joined with " + " across
  morphemes. The verbatim expansion stays in `ol_morphology_codes` for
  the detail view.
- Book mapping is Phase 1 only (`Gen` → Genesis, `Php` → Philippians).
  The full 66-book STEPBible→Gnosis abbreviation map is Phase 2 work.
- When a Strong's has no lexicon row, the entry is derived from the word
  row's own expanded tags (Hebrew) or lemma=gloss (Greek), with a warning.

## Endpoints

Mounted from `backend/src/routes/bibleRoutes.js` (via
`router.use("/original-language", ...)`) so the routes live under
`/api/original-language/...`. All responses include a `sources`
attribution array. No authentication is required — the modal works logged
in and logged out, and the data is public.

- `GET /api/original-language/:book/:chapter?startVerse=&endVerse=` →
  passage words grouped by verse, each with its language, lemma,
  Strong's, expanded grammar, and morphemes, plus `available`, the
  passage language, and `languages` (every language actually present,
  in first-appearance order). For a passage with no imported data it
  returns 200 with `available: false` and a Phase 1 coverage note, not
  an error. When the range starts at verse 1 and the chapter has a
  title (Psalm superscriptions, stored as verse 0), the response
  carries a separate `title` object with the title's words — never a
  "Verse 0" group and never merged into verse 1. Validation: chapter
  1–150, verses 1–176, `endVerse >= startVerse`, at most 50 verses per
  request (400s otherwise); unknown book 404.
- `GET /api/original-language/words/:id` → word detail: book/chapter/
  verse, word, transliteration, lemma + lemma transliteration, meaning,
  contextual gloss, Strong's (disambiguated + base), morphology code,
  grammar display, morphemes with verbatim expansions, sources. Bad id
  400, missing word 404.
- `GET /api/original-language/lemmas/:strong/occurrences?match=lemma|strong&limit=&offset=`
  → other occurrences of the lemma, paginated (`limit` 1–100, default
  20; `offset` ≥ 0). `:strong` is normalized to uppercase and validated
  (`^[HG][0-9]+[A-Z]?$`, e.g. `H7225`, `H7225G`, `G1108`); unknown
  Strong's 404. Each occurrence carries its reference, word, gloss, and
  up to 3 surrounding original-language words as context. `match=strong`
  returns all disambiguated senses sharing the plain Strong's number.
  The response states the corpus explicitly: "Phase 1 corpus: Genesis 1
  and Philippians 3 only."

## Frontend

- `frontend/src/services/originalLanguageService.js` — thin fetch wrapper
  (`getOriginalLanguagePassage`, `getOriginalLanguageWord`,
  `getLemmaOccurrences`).
- `frontend/src/components/OriginalLanguage/` — `OriginalLanguageModal`
  (the dialog; lazily loaded from `ScripturePanel`, so it ships in its own
  chunk), `OriginalLanguagePassage` (English passage in a parchment
  container), `OriginalLanguageTitle` (the chapter title — Psalm
  superscriptions — as a separate, subtly labelled block above verse 1),
  `OriginalLanguageVerse` (expandable verse section, original text line),
  `OriginalLanguageText` (the original-language line, each word with its
  own direction and language), `OriginalLanguageWordTable` (word /
  transliteration / meaning / grammar), `OriginalLanguageWordDetails`
  (language, lemma, Strong's, meaning, grammar, morpheme breakdown,
  occurrences), and `OriginalLanguageOccurrences` (reference +
  original-language context excerpt per occurrence), plus
  `OriginalLanguageModal.css`.
- The toolbar button lives in `VerseActions` (a `Languages` icon between
  Highlight and the divider) and the modal state lives in
  `ScripturePanel`, which passes the selected range (min–max of the
  selected verses in the current chapter) and the English verses from the
  reader's loaded chapter — never hardcoded passages.

Behaviour worth knowing:

- Hebrew/Aramaic renders RTL (`dir="rtl"`, `lang="he"` for Hebrew,
  `lang="arc"` for Aramaic), Greek LTR (`lang="el"`). Every word carries
  its own language from the API, so a mixed passage labels each word
  individually; the subtitle lists every language in the passage
  ("Original Languages: Hebrew & Aramaic") instead of classifying it as
  one, and an Aramaic word in a Hebrew verse gets a small "Aramaic" tag
  in the table. Maqqef-joined words print without a space between them.
- Aramaic is identified word by word at import time from explicit
  passage ranges (`ARAMAIC_RANGES` in the importer): Daniel 2:4b–7:28,
  Ezra 4:8–6:18 and 7:12–26, Jeremiah 10:11, Genesis 31:47. Daniel 2:4
  splits mid-verse (words 1–4 Hebrew, 5–12 Aramaic). Aramaic words share
  the Hebrew lexicon (TBESH) and morphology expansions (TEHMC).
- On narrow screens the word table keeps its horizontal scroll and
  shows a subtle "Swipe to see more →" hint only while columns are
  hidden to the right; the hint disappears once the table is scrolled to
  the end, and the page itself never scrolls sideways.
- Grammar is always shown expanded ("Noun · Genitive · Singular ·
  Feminine"), with the verbatim expansion parsed into labeled pairs in
  the detail view.
- Display rules (see `gloss.js`): the licence is named exactly once in
  the attribution footer (the seeded attribution already contains it);
  Strong's numbers show the plain number (H0430) while the
  disambiguated key (H0430G) stays internal for lemma/occurrence
  lookups; a gloss that is only a STEPBible placeholder ("<the>",
  "<obj.>") or empty shows an em dash instead — no definition is ever
  invented, and glosses with real content plus bracketed supplied words
  ("<to> the light") are kept verbatim.
- The verse-action toolbar renders in the text flow at the end of the
  selected verse (an inline-flex row that wraps to a line of its own),
  so it never floats over the following verse's text; the highlight
  colour palette is still a floating popup anchored to its button.
- The word-detail panel scrolls inside the modal (the flex
  `min-height: 0` chain on the dialog's columns); it cannot grow taller
  than the modal.
- "Find Other Occurrences" searches only the imported corpus; the modal
  says so. Clicking an occurrence closes the modal and focuses that verse
  in the reader. Cross-chapter navigation is a Phase 2 item — Phase 1
  occurrences all live in the passage already open.
- Accessibility: real dialog semantics, focus trap (Tab cycles, Escape
  closes), focus returns to the opener on close, body scroll is locked
  while open, backdrop click closes, and `prefers-reduced-motion`
  disables the chevron transition.
- Closing returns the reader exactly where it was, selection preserved —
  the modal never clears the selection.
- The main bundle stays under Vite's 500 kB warning threshold only
  because the modal is code-split; the main chunk sits at ~499.76 kB.
  That is close to the threshold, so the next reader feature should
  watch the bundle size.

## Tests

- `backend/test/importer/originalLanguage.test.js` — parser unit tests
  against small attributed fixtures (10 tests).
- `backend/test/application/originalLanguage.test.js` — API tests with a
  mocked pool (10 tests: passage shape/order/attribution/params,
  50-verse cap, bad chapter/verse, unknown book, unimported chapter,
  word detail, bad/missing word id, occurrences with context, Strong's
  validation/limits/match modes, route ordering).
- `frontend/src/components/OriginalLanguage/OriginalLanguageModal.test.jsx`
  — modal behaviour (10 tests: header/subtitle, English passage, Hebrew
  RTL, Greek LTR + expanded grammar, word selection → detail, Find Other
  Occurrences, occurrence click → close + navigate, Escape + focus
  restore, close button, unimported passage, failed load, collapse/expand).
- `frontend/src/components/Scripture/ScripturePanel.test.jsx` — three
  added tests: the toolbar button appears for a selection, opening the
  modal shows the range and English passage and closing keeps the
  selection, and no button appears without a selection.
- The importer was verified end to end against a disposable PostgreSQL
  cluster: 774 words, 264 lexical entries, 175 morphology codes, 0 words
  missing expansions, 0 words without lexical entries; spot checks on
  Gen 1:1 and Php 3:8–9 against the source files.

## Phase 2 / full-Bible import — remaining work

- Full 66-book STEPBible→Gnosis abbreviation map (Phase 1 maps only
  `Gen` and `Php`), and the full TAHOT/TAGNT file set.
- Aramaic sections (Daniel, Ezra) — the schema carries a language
  column, but Phase 1 has no Aramaic verses.
- Cross-chapter occurrence navigation (the modal currently focuses a verse
  in the already-open passage).
- Fuller lexicon definitions, pending Online Bible permission for the
  BDB/Abbott-Smith paragraphs (see the lexicon caveat above).
- Verse-numbering divergences: STEPBible uses NRSV versification, which
  matches Gnosis for Gen 1 and Php 3; known divergences elsewhere (e.g.
  Psalm titles, some chapter boundaries) need a mapping before a
  full-Bible import.
- Production import: run the importer against the production database as
  the operator, grant the app role SELECT (see above), and promote via
  the normal main → production PR flow. No production data has been
  imported for this feature.
