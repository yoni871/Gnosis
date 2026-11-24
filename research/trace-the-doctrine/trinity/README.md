# Trinity — research

**Phase 2 status: biblical research drafted, awaiting independent verification.
No verified, editorially-approved, or published Trinity research exists yet.**

Phase 2 (this PR) replaces the 4-passage skeleton with a full passage
inventory, Genesis through Revelation, researched against the T1 standards
(`../RESEARCH-STANDARDS.md`). Every passage record has status
`verification-pending`: the research is drafted and handed to an independent
verifier. Nothing here is `verified`, nothing is editorially approved, and
nothing is publishable yet.

## Contents

- `passages.json` — the full inventory: **60 passages** in canonical order
  (Genesis 1:1-3 through Revelation 1:4-5), every entry conforming to
  `../schemas/passage.schema.json`. The 4 skeleton ids are retained
  (`gen-1-26`, `john-1-1`, `matt-28-19`, `2cor-13-14`) with their original
  references. Classification breakdown: **11 direct, 38 indirect,
  11 historically-interpreted** (see the classification rule below).
- `passages/` — **one Markdown research note per passage** (60 files, named
  by passage slug). Each note states the classification + justification, the
  relationship to the doctrine with the §2 four-way distinction labelled
  (A what the text states / B inference, labelled as inference / C later
  reading, general only / D later formulation), interpretive questions
  including alternatives, cross-references, textual-variant and uncertainty
  flags, and verification record ids. Notes contain no factual claims
  beyond `passages.json` and `verification-records.json`. This directory is
  new in Phase 2: T1 defined no per-passage notes location, so the natural
  extension (one file per passage slug under the doctrine directory) was
  used. No schema or standard was changed to add it.
- `verification-records.json` — **123 verification records**, one per claim
  (2 per passage: a `passage-link` record for the reference + canonical
  position, and a `doctrinal-connection` record for the classification and
  relationship; plus 3 extra records for disputed readings — see below).
  Results: **60 `verified`** (all `passage-link` records: the reference
  exists and the canonical position was confirmed against the checked
  edition and a canon list), **62 `partially-verified`** (all
  `doctrinal-connection` records: the wording was confirmed, but the
  classification is a researcher judgement that only an independent
  verifier can confirm), **1 `not-verified`** (the Johannine Comma — see
  below). Every record has `editorialApproval: null` and checker
  `dev-1-researcher`, with the note that these are researcher source-checks
  only: independent verification per `RESEARCH-STANDARDS.md` §9.2 is still
  required, and nothing is publishable without it plus editorial approval.
- `milestones.json` — still an empty array. Phase 2 researched passages
  only; no milestone has been researched or verified.
- `verification-record.template.json` — unchanged blank template (not a
  checked claim).

## Classification rule applied (consistently, OT and NT)

`direct` was used **only** where (a) all three persons are explicitly named
together in a single act/formula (e.g. Matt 28:19, singular "name"; Matt
3:16-17, one baptism event; 2 Cor 13:14, one blessing), or (b) the passage
explicitly states the deity of the Son in so many words (e.g. John 1:1,
"the Word was God"; John 20:28, "My Lord and my God!"; Col 2:9; Heb 1:8;
Titus 2:13; 2 Pet 1:1; Phil 2:5-11). A `direct` classification states an
*element* of the doctrine, never the fully formulated doctrine — every
`direct` relationship text says so. Passages that name all three across a
description without a single formula (e.g. John 14:26, Eph 4:4-6,
1 Pet 1:2) are `indirect`, and the distinction is spelled out in each
record. Gen 1:26 is `historically-interpreted`, per the worked example in
§1.4 — never `direct`.

## Textual-variant and dispute flags (read before using any of these)

- **1 John 5:7-8 — the Johannine Comma.** Classified `indirect`, never
  `direct`. The authentic text speaks of three witnesses (the Spirit, the
  water, and the blood). The trinitarian wording ("the Father, the Word,
  and the Holy Ghost: and these three are one") is a later textual
  addition, absent from the ESV text checked and present in the KJV text
  checked; the Comma's absence from the earliest Greek manuscripts and
  presence in later Latin tradition is reported as the standard scholarly
  position, **not** verified manuscript by manuscript — no manuscripts
  were examined first-hand and no manuscript counts were invented. The
  extra record `ver-1john-5-7-comma-001` checks the claim that the Comma
  is original and records `not-verified`. The Comma must never be
  presented as direct evidence.
- **Romans 9:5** — whether "who is God over all" applies to Christ or is
  a separate doxology to God is disputed (punctuation; the earliest
  manuscripts lack systematic punctuation). Classified `indirect`; both
  its records are `partially-verified`.
- **Titus 2:13 / 2 Peter 1:1** — "our great God and Savior Jesus Christ":
  the single-person reading is the best-supported grammatical reading,
  but the two-person reading has been proposed and is recorded.
  2 Pet 1:1 also carries a variant note (a small number of witnesses read
  "Lord" for "God"; the ESV text checked reads "God").
- **John 10:30** — "I and the Father are one": oneness of essence vs.
  oneness of purpose/will is recorded as an open alternative.
- **John 8:58** — the Exodus 3:14 "I am" link is a contested inference.
- **Micah 5:2** — antiquity vs. eternity turns on translation (ESV "from
  of old, from ancient days" vs. KJV "from everlasting"); also a
  verse-numbering flag (Micah 5:1 in the Hebrew text).
- **Psalm 45:6-7 / Hebrews 1:8** — the referent of the "O God" vocative
  is disputed; Hebrews 1:9 distinguishes the Son from "God, your God".
- **Genesis 18:1-15** — the trinitarian reading of the three visitors /
  the LORD is contested; the text identifies the visitors as men and the
  LORD. Flagged as uncertain, not resolved.
- **Other open questions** recorded in the notes: Gen 1:1 (Spirit vs.
  wind/breath), Gen 19:24 (twofold LORD as stylistic repetition?),
  Isa 48:16 / Isa 61:1 (speaker identity; rendering differences),
  Dan 7:13 ("one like a son of man", individual vs. collective),
  Zech 12:10 (the me/him pronoun shift), John 1:1-3 (identifying the Word
  with Jesus depends on v. 14, outside the range), 2 Cor 3:17 ("the Lord
  is the Spirit"), Col 1:15 ("firstborn", pre-eminence vs. created
  status), Phil 2:5-11 ("form of God", nature vs. status), Heb 9:14 /
  1 Pet 1:10 ("the eternal Spirit" / "the Spirit of Christ" — the Holy
  Spirit or Christ's own spirit?), 1 John 5:20 (antecedent of "This is
  the true God"), Rev 1:4 ("the seven spirits" — the Holy Spirit or
  seven angels/spirits?).

## Deliberately excluded (not researched — may be revisited later)

These were considered and left out of the inventory, with reasons recorded
here so the omission is a decision, not an oversight. None was excluded
because it was inconvenient; each was judged thinner or duplicative
relative to an included passage. A later phase may revisit any of them.

- Gen 3:22; Gen 11:7 — the same plural-"us" phenomenon as Gen 1:26,
  already covered; adding them would duplicate the same reception-history
  point.
- Exod 3:2-6 (burning bush / Angel of the LORD) — bears on divine
  identity of a mediating figure, but the trinitarian link is thin.
- Isa 11:1-2; Isa 42:1 — the same Spirit-upon-the-servant pattern as
  Isa 61:1, already covered.
- John 5:18; John 17:20-23 — covered by John 10:30 / John 1:1 (equality
  claim) and John 17:5 (unity/glory) respectively.
- 2 Thess 2:13-14; Eph 3:14-19; Rom 15:30; 1 Cor 6:11; 2 Cor 1:21-22 —
  genuine triadic patterns, but thinner than the included Pauline triadic
  passages (1 Cor 12:4-6, Eph 1:3-14, Eph 2:18, Eph 4:4-6, Gal 4:4-7,
  Titus 3:4-7).
- 1 Tim 3:16; 1 Pet 3:18; Heb 10:29; 1 John 4:2 — the Spirit reference
  is a single word in a passage about something else, or the reading is
  too disputed to support an inventory entry.
- Deut 32:6 is included as the OT Father text; Isa 63:16 is the same
  Father-language pattern and is cross-referenced, not separately listed.
- Rev 4:8; Rev 21:22-23; Rev 5:6; Rev 22:1; Mal 3:1; 2 Sam 7:14 —
  symbolic or thin for the Trinity specifically.
- Synoptic parallels are not separate entries: Mark 1:9-11 and
  Luke 3:21-22 are parallel accounts of the baptism in Matt 3:16-17 and
  are noted as parallels in that note only.

## Sources checked (bibliography)

- The bibliography lives in `../shared/works.json` (the T1-defined
  bibliography store): the **Holy Bible, English Standard Version, ESV
  Text Edition: 2025** (© 2001 by Crossway, Wheaton, Illinois;
  in-copyright; short excerpts only) and the **Holy Bible, King James
  Version** (first published 1611; public domain in the United States;
  used only for the 1 John 5:7-8 Comma comparison). All 60 passages were
  checked against the ESV text as served by BibleGateway, accessed
  2026-11-20; canonical positions were confirmed against 66-book
  Protestant canon lists (cited with URLs and access dates in the
  verification records). **Note on edition year:** the Phase 2 brief
  suggested citing "ESV, 2016", but the BibleGateway pages actually
  fetched state "ESV Text Edition: 2025" — the 2025 edition is recorded
  as actually checked, in all five section reports.
- Three secondary sources are cited **in-line in the verification
  records only** (Metzger, *A Textual Commentary on the Greek New
  Testament*, on Rom 9:5; NET translators' notes on 1 John 5:7 and
  Titus 2:13; a Theopedia summary of Granville Sharp's rule) and are
  **not** duplicated into `../shared/works.json`, because no verified
  full citation (edition/year) was available for them at merge time.
  If a later phase needs them in the shared bibliography, they must be
  added with full citations first.

## What this PR does NOT do

- No historical interpretations or quotations — that is Phase 3. No author
  links, no passage-to-author connections, no quotations from historical
  writers anywhere in this PR (verified: no patristic names appear in the
  research files).
- No published content changed; no registry, book manifest, or test file
  touched; no standards, schemas, or templates changed.
- No database; no editorial override (none requested, none recorded).
- No claim is marked `verified` at the passage level, and no claim is
  editorially approved. Demo/placeholder data from the frontend preview
  was not copied; anything it pointed at was re-checked from the Bible
  text itself.

## Candidates to verify (not verified entries)

The following remain **candidates for later phases**, named here only so
researchers know where to start. Naming them here creates no milestone
entry and asserts nothing about them — each must be researched, dated,
and verified from primary sources before it appears in `milestones.json`:

- The Council of Nicaea
- The Council of Constantinople

No other milestone, passage, author, or work is asserted anywhere in
this directory.

## Next step

Independent verification (QA, per §9.2): run the §7.1 checklist against
each passage, check every claim in `verification-records.json`, and move
records to `verified` only where every claim passes — or back to
`in-research` with findings. Editorial approval (Yonatan) is a separate
step after verification. Phase 3 (historical interpretations) builds on
this inventory and must not reclassify passages without a verification
record justifying the change.
