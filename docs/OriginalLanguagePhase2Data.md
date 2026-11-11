# Original Language Analysis — Phase 2 data handling

Status: **§1 (parser), §2 (Psalm titles), §3 (NA28 gaps) and §4 (Aramaic) are implemented
on this branch** (see the sections); §5 remains a proposal for Yonatan's review. The full-Bible import does not start
until Yonatan approves Phase 2.

All numbers below were measured 2026-11-06 from the full STEPBible files
(all 4 TAHOT files + both TAGNT files) against Gnosis's verse counts from
`backend/src/bsb.xlsx` (31,102 verses, 1,189 chapters), and corrected
2026-11-07 by the Stage 1 source-side census with the fixed parsers
(§1). Corpus totals:
**443,037 words** (300,616 Hebrew + 4,835 Aramaic + 137,586 Greek), 17,005 lexical entries,
1,865 morphology codes, all 66 books and all 1,189 chapters present.

## 1. Parenthetical alternate verse numbers — FIXED (this branch)

**The problem.** 21,941 rows (4.0% of the corpus, 184 chapters, 30 books)
carry refs like `Gen.32.1(32.2)` or `Psa.3.0(3.1)`: the main number is the
English (NRSV) verse, the parenthetical is the alternate (Hebrew)
numbering. The Phase 1 parser's ref regex did not accept the parenthetical,
so it silently dropped all 21,941 rows — Genesis 32, Daniel 4 and 6,
2 Samuel 19, 1 Chronicles 6, the Psalm titles, and others were missing
entirely.

**The fix** (`backend/src/importer/importOriginalLanguage.js`,
`parseTahotLine` / `parseTagntLine`): the ref regex now accepts an
optional `(altChapter.altVerse)` after the main verse number. The importer
stores the **main (English) number** — which matches Gnosis's BSB
versification — and keeps the alternate only for reporting. The import
summary now reports `altRefRows` (kept rows that carried an alternate
number). Verified against the full corpus with the fixed parser, no
shim: 447,379 rows parsed, **443,037 kept**, 21,909 kept rows with an
alternate number (32 parenthetical rows are excluded: 31 by the existing L/Q
and NA28 inclusion rules, and 1 is an empty Qere omission). New parser unit tests cover a Hebrew row
(Gen 32:1), a Psalm-title row (Psa 3:0), and a Greek row (Mrk 12:15),
plus the plain-ref case. Backend tests: 183/183.

No schema change, no migration, no database work. The alternate number is
not stored — if a future need arises (e.g. showing the Hebrew numbering
in the modal), it can be added as a column then.

## 2. Psalm titles at verse 0 — IMPLEMENTED (this branch, approved 2026-11-06)

**Measured facts.** 478 words across **116 chapters, all in Psalms**,
are stored as verse 0 (e.g. `Psa.3.0(3.1)`: מִזְמוֹר, "a psalm"). They
are the psalm superscriptions — real, analyzable words (authorship,
genre, musical direction) that belong to the chapter but to no English
verse. The full list of chapters is in the Phase 2 plan's measurement
notes; every psalm with a superscription is included, none outside Psalms.

**Implemented handling** (Yonatan's approved decisions, 2026-11-06:
separate subtly styled "Psalm title" block above verse 1; preserve the
verse-0 mapping; never treat titles as verse 1; keep them distinct
from editorial headings).
- **Store** them as `verse_number = 0`. No migration is needed: the
  `ol_word_occurrences` UNIQUE key accepts 0, and the parser already
  produces it.
- **API:** the passage endpoint must NOT return them as a "Verse 0"
  group. Instead, when verse-0 words exist for the requested chapter,
  the response carries a separate `title` object (the title words, with
  the same shape as a verse's word list). The verse list starts at
  verse 1.
- **Modal:** render the title as a labelled block above the first verse
  — "Psalm title" heading, the original text, and the same word-by-word
  table (word, transliteration, meaning, grammar) with the same word
  detail panel on click. It is part of the chapter, not a verse.
- **Find Other Occurrences:** title words are ordinary occurrences and
  participate in lemma search like any other word.

**Alternatives considered and rejected.**
- *Attach the title words to verse 1 with a flag:* rejected — their
  `word_index` values would collide with verse 1's own words (the
  UNIQUE key is per verse), and they would sort into the middle of
  verse 1's table instead of appearing before it.
- *Skip verse-0 words:* rejected — they are real data users will want
  to analyze ("a psalm of David" is meaningful), and dropping them
  silently would repeat the parenthetical-rows mistake.

**Implemented:** `getTitleWords` in the service, `title` in the passage
response (only when the range starts at verse 1), `OriginalLanguageTitle`
in the modal — a small muted "Psalm title" label, the original text, and
the same word table. Verified live on a local disposable database with
Psalm 3 (6 title words) and by API + frontend tests. The preview corpus
is still Genesis 1 + Philippians 3 only, so no title data is live on the
preview yet. **Schema note:** the original-language table was created
with `verse_number > 0`, which rejected verse-0 rows at import — the
local verification caught this, and migration
`20261107051000_allow-verse-zero-in-original-language` relaxes the
check to `verse_number >= 0` (verse 0 is only ever a Psalm title).

## 3. Verse-numbering differences — IMPLEMENTED (this branch)

**Measured facts.** STEPBible's main refs are English (NRSV); Gnosis's
BSB refs are English. Comparing every chapter's verse set: **1,170 of
1,189 chapters agree verse-for-verse. Only 19 chapters differ, and all 19
are textual omissions, not versification shifts** — verses that
exist in BSB but have no words in the base text STEPBible uses:
- Romans 16:24–27 (16:24 is a doublet of 16:20b; 16:25–27 is the doxology)
- 2 Corinthians 13:13–14
- Philippians 1:16–17
- John 7:53 (the pericope adulterae, John 7:53–8:11, absent from NA28)
- John 5:4 (the angel troubling the water)
- Acts 8:37 (the eunuch's confession)
- Acts 15:34 (Silas remaining at Antioch)
- Acts 24:7 (Lysias taking Paul by force)
- Acts 28:29 (the Jews departing)
- Mark 7:16, Mark 9:44 and 9:46, Luke 17:36, Luke 23:17, Matthew 17:21,
  Matthew 18:11, Matthew 23:14, Mark 11:26, Mark 15:28 (TR-only verses, no NA28 text)
- Joshua 21:36–37 (type R in TAHOT — absent from the Leningrad Codex main text)

The fifteen NT gaps were found by the Stage 2 dry run (2026-11-07):
their TAGNT rows are TR-only or TR+Byz — no NA28 text exists for them.
Joshua 21:36–37 were found the same way: their TAHOT rows are type R,
excluded by the L/Q inclusion rule. The verse-count check in validation
compares all 1,189 chapters, so this list is exhaustive.

There is no Psalm-title shift problem: titles sit at verse 0 (§2), and
the numbered verses match. No verse-renumbering mapping file is needed.

**Implemented handling.**
- **Import:** the importer does not fail on these. Validation expects
  exactly these 19 gaps: after import, every chapter's imported verse
  count must match Gnosis's verse count for that chapter except these
  19 chapters (and the 116 title chapters, where verse 0 is handled
  separately per §2). Any other mismatch fails the import loudly.
- **Modal:** the English passage still shows (it comes from the
  translation API). A verse with no original-language words in an
  imported chapter renders a note — "No original-language text for this
  verse in the NA28 edition." — instead of an empty table or an error.
  The passage endpoint flags such verses explicitly
  (`noOriginalText: true` on the verse) rather than making the frontend
  infer it from an empty list. A chapter with no imported words at all
  still returns `available: false` (the endpoint distinguishes the two
  with a chapter word count).
- **Occurrences:** unaffected — these verses simply have no words to
  match.

## 4. Aramaic transitions — IMPLEMENTED (this branch, approved 2026-11-06)

**Measured facts.** STEPBible's TAHOT does **not** mark Aramaic per
word: Genesis 31:47 (Aramaic: Jegar-sahadutha) carries type `L` and
Hebrew-style morphology codes (`HNpl`) like its Hebrew neighbours.
Aramaic must be identified by **passage range**. The canonical ranges
hold **4,835 words**:
- Daniel 2:4b–7:28
- Ezra 4:8–6:18 and 7:12–26
- Jeremiah 10:11
- Genesis 31:47

**The one boundary that needs a word-level rule: Daniel 2:4 switches
mid-verse.** The verse has 12 words; words 1–4 are Hebrew ("and the
Chaldeans said to the king, in Aramaic"), and the Aramaic begins at
word 5 ("O king, live forever!"). A verse-range rule alone would
mislabel the first four words.

**Implemented handling** (Yonatan's approved decisions, 2026-11-06:
show "Original Languages: Hebrew & Aramaic" where applicable; preserve
word-level language identification; handle the Daniel 2:4 transition;
never classify a mixed verse as one language).
- **Importer:** an `ARAMAIC_RANGES` list (book, start chapter/verse,
  end chapter/verse) plus a word-index split for Daniel 2:4 (words 1–4
  Hebrew, 5–12 Aramaic). Words in the ranges get `language =
  'aramaic'` in `ol_word_occurrences`; Aramaic lemmas get `language =
  'aramaic'` in `ol_lexical_entries`. The schema already has the
  language column — no migration needed.
- **Modal:** Aramaic renders RTL like Hebrew (`dir="rtl"`, `lang="arc"`).
  The subtitle shows the language(s) of the selected verses: one language
  for a single-language selection; for a mixed passage, "Original
  Languages: Hebrew & Aramaic". The passage endpoint returns a
  `languages` array for the passage, and every word carries its own
  `language` — the table tags Aramaic words in a Hebrew verse, and the
  word detail shows the word's own language.
- **Morphology/transliteration:** Aramaic codes come from the same
  TEHMC expansion file. Coverage is verified, not assumed: the local
  Daniel 2 import stored 112 Aramaic (A-prefixed) morphology codes
  with real TEHMC expansions, and every Aramaic word's morphemes carry
  expansions (e.g. `Ta` → "Function=Particle; Form=Definite article
  (Aramaic)"). Three Aramaic words had no TBESH lexicon row
  (H1247I, H5665+); the importer derived their lemma/gloss from the
  word row itself and warned, by design — nothing was invented.
  Transliteration follows the STEPBible scheme, as in Phase 1.

**Implemented:** `ARAMAIC_RANGES` + `wordLanguageForWord` in the
importer (Aramaic words stored with `language = 'aramaic'`; Aramaic
lemmas likewise; both share the Hebrew TBESH lexicon and TEHMC
expansions). Verified live on a local disposable database with Daniel 2
(12 words in 2:4 split 4 Hebrew / 8 Aramaic) and by importer, API, and
frontend tests. The preview corpus is still Genesis 1 + Philippians 3
only, so no Aramaic data is live on the preview yet.

## 5. Open decisions (Yonatan)

1. ~~Psalm-title block proposal (§2)~~ — decided 2026-11-06: separate
   subtly styled "Psalm title" block above verse 1; implemented (§2).
2. ~~Multi-language subtitle format (§4)~~ — decided 2026-11-06:
   "Original Languages: Hebrew & Aramaic"; implemented (§4).
3. Whether to pursue Online Bible permission for the fuller BDB /
   Abbott-Smith definitions in parallel (does not block Phase 2 either
   way; Phase 2 proceeds with short glosses only unless permission
   arrives).
4. ~~Timing of the preview `pgmigrations` swap (sessions→7, OL→8)~~ —
   applied 2026-11-06 evening by the PR #39 chat's renumber task and
   verified by a read-only Neon check (row 7 sessions, row 8
   original-language — preview history now in file order).
