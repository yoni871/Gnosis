# Trinity — research

**Phase 2 status: biblical research drafted, awaiting independent verification.
No verified, editorially-approved, or published Trinity research exists yet.**

**Phase 3 status: church-history research drafted, awaiting independent verification.
No verified, editorially-approved, or published Trinity research exists yet.**

Phase 3 (this PR) adds historical interpretations of the 60 Phase 2 passages,
researched against the T1 standards (`../RESEARCH-STANDARDS.md`) by five era
researchers (Apostolic Fathers + 2nd century; 3rd century + Nicene 4th century;
5th–8th century; Medieval; Reformation + later) and reconciled by the Phase 3
coordinator. **103 interpretations across 37 of the 60 passages**, ordered
chronologically within each passage (earliest writer first, c. 90–1739). Every
interpretation record has status `verification-pending`: the research is drafted
and handed to an independent verifier. Nothing here is `verified`, nothing is
editorially approved, and nothing is publishable yet.

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
- `interpretations.json` — **103 historical interpretations** (one writer's reading of one passage), every entry conforming to
  `../schemas/interpretation.schema.json`, ordered chronologically within each
  passage (earliest first). Coverage: 37 of the 60 passages; the 23 passages
  with no attested interpretation are listed in
  `no-attested-interpretation.md`. Authors span c. 90 (1 Clement) to 1739
  (Jonathan Edwards). Dissenting readings are recorded, not harmonised: Arius
  on John 1:1, the Socinian (Racovian) readings of John 1:1, John 17:5,
  1 Cor 8:6 and Matt 28:19, Calvin's denial that John 10:30 proves
  *homoousios*, and the East/West disagreement on the Spirit's procession
  (John 15:26 — Augustine/Leo vs. John of Damascus). No interpretation was
  forced onto a passage: where no attested reading was found, none was
  invented.
- `interpretations/` — **one Markdown research note per interpretation**
  (103 files, named by interpretation id), following the T1 interpretation
  template. Each note states the passage, author, work, location, quotation +
  provenance, explanation, context, alternatives, and verification record
  ids. Notes contain no factual claims beyond `interpretations.json` and
  `verification-records.json`. This directory is new in Phase 3: T1 defined no
  per-interpretation notes location, so the natural extension of the Phase 2
  `passages/` pattern (one file per record id under the doctrine directory)
  was used. No schema or standard was changed to add it.
- `milestones/` — **one Markdown research note per milestone** (11 files,
  named by milestone id), following the T1 milestone template.
- `no-attested-interpretation.md` — the **23 passages with no attested
  interpretation** in this PR, with the per-era scope statements saying
  exactly what was examined. 22 were checked with no attested reading found
  in the works examined in at least one era; 1 (Jude 20) was not individually
  searched in any era. "No attested interpretation found" is a report of what
  was checked, not proof that no historical writer anywhere interpreted the
  passage.
- `verification-records.json` — **363 verification records**, one per claim
  (2 per passage: a `passage-link` record for the reference + canonical
  position, and a `doctrinal-connection` record for the classification and
  relationship; plus 3 extra records for disputed readings — see below).
  Results across all 363 records: **272 `verified`, 90 `partially-verified`,
  1 `not-verified`** (the Johannine Comma — see below). The 123 Phase 2
  records are preserved exactly, in order, at the head of the file (60
  `verified`, 62 `partially-verified`, 1 `not-verified`); the 240 Phase 3
  records follow (212 `verified`, 28 `partially-verified`), of which 239 come
  from the five era researchers and 1 from the coordinator (Westminster
  Confession passage links, see below). Every record has
  `editorialApproval: null` and checker `dev-1-researcher`, with the note
  that these are researcher source-checks only: independent verification per
  `RESEARCH-STANDARDS.md` §9.2 is still required, and nothing is publishable
  without it plus editorial approval.
- `milestones.json` — **11 milestones** (replacing the empty array):
  the Arian controversy (318–381), the Council of Nicaea (325), the Nicene
  Creed (325), the Council of Constantinople (381), the Constantinopolitan
  Creed (381), the Third Council of Toledo (589, Filioque in the Creed), the
  Fourth Lateran Council (1215, *Firmiter credimus*), the Council of Florence
  (1439, *Laetentur Caeli*), the Augsburg Confession (1530, Article I), the
  Racovian Catechism (1605), and the Westminster Confession (1646, ch. 2).
  Every milestone conforms to `../schemas/milestone.schema.json` and has its
  own verification record(s). Ephesus (431), Chalcedon (451), and
  Constantinople II (553) were checked as candidates and omitted: primarily
  Christological, with no direct bearing on the Trinity established from a
  checked source. Passage links are listed only where verified: e.g. Nicaea
  lists only `john-1-1`; Toledo lists no passages, because no specific passage
  was verified as cited in its acts.
- `../shared/authors.json` — **28 authors** (the 5 T1 stubs filled in:
  Justin Martyr, Irenaeus, Tertullian, Athanasius, Augustine; plus 23 new,
  including 1 corporate author — the Church of Smyrna, author of the
  *Martyrdom of Polycarp*). The Westminster Assembly is *not* registered as
  an author: see the work-id note below. Author life dates are null for most authors (not verified; never used as work dates). Four authors carry life dates: John Calvin (1509-1564), Philip Melanchthon (1497-1560), and Jonathan Edwards (1703-1758) exact, each backed by a verified dates record, and Michael Servetus (1511-1553) approximate, his birth year uncertain (see ver-p3-e5-michael-servetus-dates-001).
- `../shared/works.json` — **34 works** (the 2 Bible works from Phase 2,
  preserved unchanged, plus 32 new works actually cited by an interpretation
  or milestone). Every work carries a verified title/edition/translator,
  a writing date with certainty, and a public-domain status.
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

## What the Phase 2 PR did NOT do

- No historical interpretations or quotations — that was Phase 3 (now
  delivered in this PR; see above). No author links, no passage-to-author
  connections, no quotations from historical writers anywhere in the Phase 2
  PR (verified: no patristic names appear in the Phase 2 research files).
- No published content changed; no registry, book manifest, or test file
  touched; no standards, schemas, or templates changed.
- No database; no editorial override (none requested, none recorded).
- No claim is marked `verified` at the passage level, and no claim is
  editorially approved. Demo/placeholder data from the frontend preview
  was not copied; anything it pointed at was re-checked from the Bible
  text itself.

## Phase 3: quotation policy applied

- **102 quotations are public-domain** (verbatim from checked public-domain
  translations: Ante-Nicene / Nicene and Post-Nicene Fathers via CCEL, New
  Advent, Wikisource, sacred-texts.com, and the public-domain Calvin,
  Luther, and Racovian translations), each with work + location + edition /
  translation + language + reproducibility status, and a verification record
  naming the exact URL + edition + date accessed.
- **1 quotation is fair-use**: Augustine, *Contra Maximinum* II.22.3
  (1 John 5:7 — the earthly witnesses only). The English translation's
  translator/edition is not named on the source page, so its record is
  `partially-verified` and the verifier must confirm the edition before any
  publication.
- **0 quotations are `not-reproducible` / null.** No quotation was reproduced
  from memory, from a secondary summary, or from an unchecked page; no
  paraphrase is presented as quotation.
- **Coordinator spot-check:** the coordinator re-fetched 10 cited pages and
  confirmed all 10 quotations verbatim (Justin, *Dialogue* ch. 62; Athanasius,
  *Against the Arians* Discourse IV §1 and Discourse II §1; Augustine, *De
  Trinitate* XII.6; Aquinas, *Summa* I, q. 36, a. 2, obj. 1; Calvin,
  *Commentary on John* 1:1; Gregory of Nazianzus, Oration 31 §8; Tertullian,
  *Against Praxeas* chs. 2 and 12; Novatian, *Treatise Concerning the
  Trinity* ch. 13). The spot-check found 6 locator-URL errors (the right
  work, the wrong page: 4 Athanasius records cited the Discourse I URL for
  Discourse II/IV locations; 2 Tertullian records cited the Chapter II URL
  for Chapter XII locations). The URLs were corrected by the coordinator and
  each corrected record carries a coordinator note dated 2026-11-21; the
  quotation texts themselves were all correct and the results are unchanged
  (`verified`).

## Phase 3: coordinator corrections and merges

The five era drafts were reconciled into one set; the coordinator made these
changes, each recorded in the affected record's notes:

- **F1/F2 — John of Damascus:** Era 3 used id `john-damascus`, Era 4 used
  `john-of-damascus`. Merged into one author (`john-of-damascus`) and one
  work (`john-of-damascus-exposition-of-the-orthodox-faith`), keeping the Era 3
  biography and the Era 4 attribution note.
- **F3 — Toledo 589:** Era 3 and Era 4 independently researched the Third
  Council of Toledo under different ids. Merged into one milestone
  (`council-of-toledo-589`), keeping both verification records (NPNF II/14
  Historical Excursus via Wikisource and via CCEL/Schaff-Hefele).
- **F4 — Lateran IV:** `thomas-aquinas` removed from the milestone's
  `authorIds` — Aquinas (born 1225) was not involved in the 1215 council.
- **F5 — Westminster Confession:** the era draft listed Deut 6:4, 1 Cor 8:6
  and Rom 9:5 as Chapter 2 proof texts without a dedicated record. The
  coordinator checked them against the Westminster Standard page
  (ch. 2 §I n. a: "Deut 6:4; 1 Cor 8:4, 6"; §II n. d: "Rom 9:5; 1 Tim 6:15")
  and added record `ver-p3-coord-westminster-confession-1646-passages-001`
  (`verified`, 2026-11-21).
- **F6/F7 — locator URLs:** see the quotation-policy section above (4
  Athanasius + 2 Tertullian records corrected).
- **F8 — dangling author references:** all 9 Era 2 author entries referenced
  attribution record ids that do not exist (the `-001` of the interpretation
  id was dropped, e.g. `ver-p3-e2-arius-john-1-1-attribution-001` for
  `ver-p3-e2-arius-john-1-1-001-attribution-001`). Each was repointed at the
  existing record, with a coordinator note on the author entry.

## Phase 3: work-id convention notes (flagged, not changed)

Following the Phase 2 precedent for `bible-esv-2025` / `bible-kjv`, two work
ids do not follow the author-slug + work-slug convention in
`schemas/README.md`; both are flagged here, no schema or standard was changed:

- `westminster-assembly-westminster-confession` — `authorIds` is empty: no
  `westminster-assembly` author entry was created in this phase (the Assembly
  is a corporate body; a later phase may register it as a corporate author, as
  was done for the Church of Smyrna).
- `racovian-catechism` — no author-slug prefix; `authorIds` is
  `faustus-socrinus` with `disputedAuthorship: true` (Socinus died in 1604
  before drafting; the work was completed by Smalcius, Moskorzowski, and
  Völkel — see its attribution record, `partially-verified`).

## Phase 3: the Johannine Comma (1 John 5:7) — what the history shows

No era asserts the Comma as original; Phase 2's `not-verified` finding stands.
What Phase 3 establishes, with citations:

- **No 2nd-century attestation:** the Comma is not cited by any Era 1 writer
  examined and plays no part in second-century discussion.
- **Cyprian** (*On the Unity of the Church* §6) writes "these three are one"
  of Father, Son, and Spirit, but does not quote the full Comma wording
  ("the Father, the Word, and the Holy Ghost… in heaven").
- **Augustine** (*Contra Maximinum* II.22.3) names only the earthly witnesses
  (Spirit, water, blood); the source page's footnote states the
  heavenly-witnesses clause "appears to be wholly unknown to St. Augustin".
- **Aquinas** (*Summa* I, q. 36, a. 1, sed contra) and **Lateran IV**
  (Canon 2) cite 1 John 5:7 as Scripture because it stood in the Vulgate
  they used; flagged as textually disputed, never asserted as original.
  Lateran IV Canon 2 adds of v. 8 "as it is found in some codices".
- **Calvin** (on 1 John 5:7) is tentative — "I dare not assert any thing on
  the subject" — and reads "these three are one" as consent in testimony,
  not essence.

## Phase 3: what remains for Phase 4 (independent verification)

- Run the §7.2 checklist against each interpretation and the §7.3 checklist
  against each milestone; check every claim in `verification-records.json`.
- **Racovian Catechism quotations** (4) were transcribed from the Google
  Books OCR scan of the 1818 Rees translation; obvious single-character OCR
  misreadings were normalised and documented in each record's limitations.
  The verifier should check them against the printed 1818 edition.
- **Work-date records: 18 of 38 are `partially-verified`** (all 8 Era 1
  dates, all 9 Era 2 dates, and the John of Damascus range 730–743): the
  writing dates are standard scholarly datings, not re-verified against a
  dating study in this pass. The other 20 work-date records are `verified`.
  The same applies to the Arius attribution record (the *Thalia* survives
  only via hostile witness Athanasius) and the Constantinople 381 records
  (the received creed text's exact relation to the council is debated).
- **Toledo 589** is `partially-verified`: the transmitted acts are disputed
  (the Filioque in the Toledo III acts may be a later interpolation).
- **Anselm → John 1:1** passage link is `partially-verified`: Anselm does
  not cite John 1:1 by reference in *Monologion* ch. 33; the link rests on
  subject matter.
- **Uncovered passages:** 23 passages have no interpretation yet (see
  `no-attested-interpretation.md`); Jude 20 was not individually searched in
  any era. Writers not checked in this phase include Eusebius, Gregory of
  Nyssa, Ambrose, Cyril of Jerusalem, Didymus, Zwingli, Schleiermacher, and
  (20th century, out of scope) Karl Barth and later writers.

## What this PR does NOT do

- No changes to the Phase 2 passage inventory (`passages.json`,
  `passages/`, and the 123 Phase 2 verification records are preserved
  exactly); no passage reclassification.
- No standards, schemas, or templates changed. No published content changed;
  no registry, book manifest, or test file touched.
- No database; no editorial override (none requested, none recorded).
- No claim is marked `verified` at the interpretation or milestone level, and
  no claim is editorially approved. Demo/placeholder data from the frontend
  preview was not copied.

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
each passage, the §7.2 checklist against each interpretation, and the §7.3
checklist against each milestone; check every claim in
`verification-records.json`, and move records to `verified` only where every
claim passes — or back to `in-research` with findings. Editorial approval
(Yonatan) is a separate step after verification. Phase 4 (verification)
covers Phases 2 and 3 together.
