# Original Language Analysis — Phase 2 data handling (proposed)

Status: **proposal for Yonatan's review**. Nothing here is implemented yet
except the parser fix in §1 (landed on this branch, tested). The full-Bible
import does not start until Yonatan approves Phase 2.

All numbers below were measured 2026-11-06 from the full STEPBible files
(all 4 TAHOT files + both TAGNT files) against Gnosis's verse counts from
`backend/src/bsb.xlsx` (31,102 verses, 1,189 chapters). Corpus totals:
**443,051 words** (305,465 Hebrew + 137,586 Greek), 17,271 lexical entries,
2,121 morphology codes, all 66 books and all 1,189 chapters present.

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
shim: 447,393 rows parsed, **443,051 kept**, 21,910 kept rows with an
alternate number (31 parenthetical rows are excluded by the existing L/Q
and NA28 inclusion rules). New parser unit tests cover a Hebrew row
(Gen 32:1), a Psalm-title row (Psa 3:0), and a Greek row (Mrk 12:15),
plus the plain-ref case. Backend tests: 183/183.

No schema change, no migration, no database work. The alternate number is
not stored — if a future need arises (e.g. showing the Hebrew numbering
in the modal), it can be added as a column then.

## 2. Psalm titles at verse 0 — PROPOSED

**Measured facts.** 478 words across **116 chapters, all in Psalms**,
are stored as verse 0 (e.g. `Psa.3.0(3.1)`: מִזְמוֹר, "a psalm"). They
are the psalm superscriptions — real, analyzable words (authorship,
genre, musical direction) that belong to the chapter but to no English
verse. The full list of chapters is in the Phase 2 plan's measurement
notes; every psalm with a superscription is included, none outside Psalms.

**Proposed handling.**
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

**Decision needed:** confirm the "Psalm title" block proposal (or pick
an alternative). No implementation until Phase 2 is approved.

## 3. Verse-numbering differences — PROPOSED

**Measured facts.** STEPBible's main refs are English (NRSV); Gnosis's
BSB refs are English. Comparing every chapter's verse set: **1,185 of
1,189 chapters agree verse-for-verse. Only 4 chapters differ, and all 4
are NA28 textual omissions, not versification shifts** — verses that
exist in BSB but have no words in the NA28 text STEPBible uses:
- Romans 16:25–27 (the doxology)
- 2 Corinthians 13:13–14
- Philippians 1:16–17
- John 7:53 (the pericope adulterae, John 7:53–8:11, absent from NA28)

There is no Psalm-title shift problem: titles sit at verse 0 (§2), and
the numbered verses match. No verse-renumbering mapping file is needed.

**Proposed handling.**
- **Import:** the importer must NOT fail on these. Validation expects
  exactly these 4 gaps: after import, every chapter's imported verse
  count must match Gnosis's verse count for that chapter except these
  4 chapters (and the 116 title chapters, where verse 0 is handled
  separately per §2). Any other mismatch fails the import loudly.
- **Modal:** the English passage still shows (it comes from the
  translation API). A verse with no original-language words renders a
  note — "No original-language text for this verse in the NA28
  edition." — instead of an empty table or an error. The passage
  endpoint should flag such verses explicitly (e.g. `noOriginalText:
  true`) rather than making the frontend infer it from an empty list.
- **Occurrences:** unaffected — these verses simply have no words to
  match.

## 4. Aramaic transitions — PROPOSED

**Measured facts.** STEPBible's TAHOT does **not** mark Aramaic per
word: Genesis 31:47 (Aramaic: Jegar-sahadutha) carries type `L` and
Hebrew-style morphology codes (`HNpl`) like its Hebrew neighbours.
Aramaic must be identified by **passage range**. The canonical ranges
hold **4,839 words**:
- Daniel 2:4b–7:28
- Ezra 4:8–6:18 and 7:12–26
- Jeremiah 10:11
- Genesis 31:47

**The one boundary that needs a word-level rule: Daniel 2:4 switches
mid-verse.** The verse has 12 words; words 1–4 are Hebrew ("and the
Chaldeans said to the king, in Aramaic"), and the Aramaic begins at
word 5 ("O king, live forever!"). A verse-range rule alone would
mislabel the first four words.

**Proposed handling.**
- **Importer:** an `ARAMAIC_RANGES` list (book, start chapter/verse,
  end chapter/verse) plus a word-index split for Daniel 2:4 (words 1–4
  Hebrew, 5–12 Aramaic). Words in the ranges get `language =
  'aramaic'` in `ol_word_occurrences`; Aramaic lemmas get `language =
  'aramaic'` in `ol_lexical_entries`. The schema already has the
  language column — no migration needed.
- **Modal:** Aramaic renders RTL like Hebrew (`dir="rtl"`). The
  subtitle shows the language(s) of the selected verses: one language
  for a single-language selection; for a selection spanning a
  transition (e.g. Daniel 2:3–5), the languages present, in order —
  "Daniel 2:3–5 · Biblical Hebrew · Biblical Aramaic". The passage
  endpoint should return a `languages` array for the passage so the
  modal does not have to infer it.
- **Morphology/transliteration:** Aramaic codes come from the same
  TEHMC expansion file; the dry run must verify coverage for Aramaic
  codes (any code without an expansion is reported, never silently
  dropped). Transliteration follows the STEPBible scheme, as in
  Phase 1.

**Decision needed:** confirm the multi-language subtitle format for
selections spanning a transition.

## 5. Open decisions (Yonatan)

1. Psalm-title block proposal (§2) — confirm or pick an alternative.
2. Multi-language subtitle format for selections spanning a transition (§4).
3. Whether to pursue Online Bible permission for the fuller BDB /
   Abbott-Smith definitions in parallel (does not block Phase 2 either
   way; Phase 2 proceeds with short glosses only unless permission
   arrives).
4. Timing of the preview `pgmigrations` swap (sessions→7, OL→8) relative
   to PR #39's checks — see the migration-order reconciliation notes.
   The swap is proven on an isolated test database but is NOT applied
   to the preview branch and needs explicit approval.
