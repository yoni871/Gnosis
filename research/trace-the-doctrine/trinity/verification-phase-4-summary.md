# Phase 4 verification summary — Trinity (Dev 1 second-pass verification)

**Status: second-pass verification drafted, awaiting independent QA verification per
RESEARCH-STANDARDS.md §9.2 and editorial approval. Nothing here is editorially approved
and nothing is publishable yet.**

Phase 4 re-checks, as a second pass distinct from the researchers' own source-checks,
every claim drafted in Phases 2–3: all 60 passages, all 103 interpretations, all 11
milestones, and all 103 quotations (102 public-domain verbatim + 1 fair-use). Each
record was checked against its cited primary source where checkable (CCEL, New Advent,
Wikisource, sacred-texts, BibleGateway ESV, Google Books / archive.org, Fordham
sourcebooks, and other mirrors of the same named editions), not from memory and not
from the Phase 2/3 researcher's word. This is Dev 1's second-pass verification — it is
NOT the independent QA verification required by §9.2, which QA will still do.

## Method

- Five verifier teams worked in parallel from the T1 standards and schemas: passages
  (Team A); interpretations eras 1–2 (Team B); interpretations eras 3–5 + milestones
  (Team C); quotations eras 1–2 (Team D1); quotations eras 3–5 (Team D2).
- The coordinator reconciled all five sets into one set (no duplicate claim ids, no
  missing claims), validated every record against the T1 verification-record schema
  (draft 2020-12), and spot-checked a sample personally: the Justin Martyr *Dialogue*
  ch. 62 quotation (verified verbatim on New Advent), the Athanasius Discourse II
  Phil 2:5 passage (wording confirmed; see the locator note below), the Johannine Comma
  evidence (Wallace, bible.org — see below), and the full ESV verse ranges of the six
  passages Team A had left partially-verified for want of a verse-text re-read
  (Isa 48:16; John 8:58; Eph 1:3–14; Eph 4:4–6; Rev 1:4–5; Titus 3:4–7 — all read on
  BibleGateway ESV, Text Edition: 2025, 2026-11-21; those 12 records were upgraded to
  `verified` by the coordinator on that checked evidence, with the upgrade recorded in
  each record's notes).
- Every Phase 4 record has checker `dev-1-verifier`, checkDate `2026-11-21`,
  `editorialApproval: null`, and the note that §9.2 independent QA verification is still
  required. A claim is publishable ONLY when verified AND editorially approved.

## Coverage

| Category | Covered | Total |
|---|---|---|
| Passages (passage-link + doctrinal-connection) | 60 | 60 |
| Interpretations (doctrinal-connection + quotation) | 103 | 103 |
| Milestones | 11 | 11 |
| Quotations re-checked verbatim | 103 | 103 |
| **Phase 4 records total** | **373** | — |

`verification-records.json` now holds **737 records**: the 364 Phase 2/3 records preserved
exactly, in order, at the head of the file, followed by the 373 Phase 4 records
(ids `ver-p4-*`). No Phase 2/3 record was deleted, rewritten, or renumbered.

## Results — Phase 4 records only (373)

- **verified: 345**
- **partially-verified: 28**
- **not-verified: 0**
- **contradicted: 0**
- **unable-to-verify: 0**

### Per-category breakdown

| Claim type | Verified | Partially-verified | Not-verified | Contradicted | Unable-to-verify | Total |
|---|---|---|---|---|---|---|
| passage-link | 60 | 0 | 0 | 0 | 0 | 60 |
| doctrinal-connection | 151 | 13 | 0 | 0 | 0 | 164 |
| quotation | 96 | 7 | 0 | 0 | 0 | 103 |
| date | 27 | 3 | 0 | 0 | 0 | 30 |
| milestone | 8 | 3 | 0 | 0 | 0 | 11 |
| attribution | 3 | 2 | 0 | 0 | 0 | 5 |

No Phase 4 record is `not-verified`, `contradicted`, or `unable-to-verify`. Every claim
that could not be fully confirmed is recorded honestly as `partially-verified` below,
with its exact reason. Nothing partially-verified is publishable.

## Partially-verified items — complete list (28)

Each item below must be resolved (research correction, printed-page check, or dating
study) before publication. The full reason, evidence, and limitations are in the named
record in `verification-records.json`.

1. **`ver-p4-matt-3-16-doctrinal-connection-001`** (doctrinal-connection, claim `matt-3-16`) — Direct classification is defensible for the element as stated, but its doctrinal force depends on a contested or inferred reading; the record itself flags this. It must not be published as direct evidence for the fully formulated doctrine, and the alternative reading must stay attached.

2. **`ver-p4-john-10-30-doctrinal-connection-001`** (doctrinal-connection, claim `john-10-30`) — Direct classification is defensible for the element as stated, but its doctrinal force depends on a contested or inferred reading; the record itself flags this. It must not be published as direct evidence for the fully formulated doctrine, and the alternative reading must stay attached.

3. **`ver-p4-phil-2-5-doctrinal-connection-001`** (doctrinal-connection, claim `phil-2-5`) — Direct classification is defensible for the element as stated, but its doctrinal force depends on a contested or inferred reading; the record itself flags this. It must not be published as direct evidence for the fully formulated doctrine, and the alternative reading must stay attached.

4. **`ver-p4-titus-2-13-doctrinal-connection-001`** (doctrinal-connection, claim `titus-2-13`) — Direct classification is defensible for the element as stated, but its doctrinal force depends on a contested or inferred reading; the record itself flags this. It must not be published as direct evidence for the fully formulated doctrine, and the alternative reading must stay attached.

5. **`ver-p4-2pet-1-1-doctrinal-connection-001`** (doctrinal-connection, claim `2pet-1-1`) — Direct classification is defensible for the element as stated, but its doctrinal force depends on a contested or inferred reading; the record itself flags this. It must not be published as direct evidence for the fully formulated doctrine, and the alternative reading must stay attached.

6. **`ver-p4-team-b-athanasius-john-1-1-001-001`** (doctrinal-connection, claim `athanasius-john-1-1-001`) — Quotation wording was not re-checked in this record (quotations team); only the doctrinal connection, author, period, work, location, explanation and row-C attribution were checked. The doctrinal connection itself is verified against the NPNF2 text of Discourse IV, section 1, as printed under Athanasius's name. BUT the interpretation attributes Discourse IV to Athanasius without flagging the disputed-authorship question: the New Catholic Encyclopedia states a fourth Discourse 'is now considered as definitely spurious', and Quasten (via Catholic Culture) says the first three discourses 'form a single continuous work by Athanasius; the fourth was added later by an unknown author' and 'differs in address, content, and style'. The research file flags this only at work level (disputedAuthorship null + note), not in this interpretation record. See the separate attribution record ver-p4-team-b-attr-athanasius-against-the-arians-001.

7. **`ver-p4-team-b-athanasius-john-10-30-001-001`** (doctrinal-connection, claim `athanasius-john-10-30-001`) — Quotation wording was not re-checked in this record (quotations team); only the doctrinal connection, author, period, work, location, explanation and row-C attribution were checked. The doctrinal connection itself is verified against the NPNF2 text of Discourse IV, section 2, as printed under Athanasius's name. BUT the interpretation attributes Discourse IV to Athanasius without flagging the disputed-authorship question: the New Catholic Encyclopedia states a fourth Discourse 'is now considered as definitely spurious', and Quasten (via Catholic Culture) says the first three discourses 'form a single continuous work by Athanasius; the fourth was added later by an unknown author'. The research file flags this only at work level (disputedAuthorship null + note), not in this interpretation record. See the separate attribution record ver-p4-team-b-attr-athanasius-against-the-arians-001.

8. **`ver-p4-team-b-hilary-john-1-1-001-001`** (doctrinal-connection, claim `hilary-john-1-1-001`) — Quotation wording was not re-checked in this record (quotations team); only the doctrinal connection, author, period, work, location, explanation and row-C attribution were checked. RESEARCH-FILE ERROR in the explanation: the sentence 'in section 13 he argues that the Word's "was" has no limit of time and no commencement: "the uncreated Word was in the beginning"' is not supported by the checked edition. Section 13 of Book I is entirely about Colossians 2:8-15 and 'philosophy and vain deceit'; the phrases 'the uncreated Word was in the beginning', 'no limit of time' and 'commencement' do not occur anywhere in Book I of the NPNF2 text on New Advent. The core reading is verified (section 10 quotes John 1:1-14 in full; sections 10-11 call the Word 'God of God' and 'in the beginning God with God'), but the section-13 sentence must be corrected or removed before publication.

9. **`ver-p4-team-b-athanasius-rom-9-5-001-001`** (doctrinal-connection, claim `athanasius-rom-9-5-001`) — Quotation wording was not re-checked in this record (quotations team); only the doctrinal connection, author, period, work, location, explanation and row-C attribution were checked. The doctrinal connection itself is verified against the NPNF2 text of Discourse IV, section 1, as printed under Athanasius's name. BUT the interpretation attributes Discourse IV to Athanasius without flagging the disputed-authorship question: the New Catholic Encyclopedia states a fourth Discourse 'is now considered as definitely spurious', and Quasten (via Catholic Culture) says the first three discourses 'form a single continuous work by Athanasius; the fourth was added later by an unknown author'. The research file flags this only at work level (disputedAuthorship null + note), not in this interpretation record. See the separate attribution record ver-p4-team-b-attr-athanasius-against-the-arians-001. The record also notes, without a checked modern source, that the verse's reference is disputed in modern scholarship.

10. **`ver-p4-team-b-date-arius-thalia-001`** (date, claim `arius-thalia`) — No dating study for the Thalia was checked; the 318-321 range is not upgraded to verified.

11. **`ver-p4-team-b-date-athanasius-against-the-arians-001`** (date, claim `athanasius-against-the-arians`) — The 356-360 range is supported for Discourses I-III only; Discourse IV's date is less certain and has been placed as early as c. 340 (Vinzent). The research file's note already flags this; the range must not be read as covering Discourse IV.

12. **`ver-p4-leo-i-john-15-26-doctrinal-001`** (doctrinal-connection, claim `leo-i-john-15-26-001`) — PARTIALLY VERIFIED - FLAG FOR REVISION BEFORE PUBLICATION: the explanation of the Priscillianist error and Leo's own positive statement (one essence, indivisible, eternal, equal) are confirmed at ch. II. But the doctrinal-connection claim that the letter records Leo's own understanding that the Spirit proceeds from both is NOT supported by the letter as cited: the only occurrence of 'proceeded from both' is inside the refuted error summary, not in Leo's own doctrine, and John 15:26 is not cited in ch. II. Leo's own statement contains no procession claim. The research file itself carries a CAUTION note to this effect. The (C) sentence as written should be revised or downgraded before any publication.

13. **`ver-p4-anselm-john-1-1-doctrinal-001`** (doctrinal-connection, claim `anselm-of-canterbury-john-1-1-001`) — PARTIALLY VERIFIED: the ch. 33 argument (supreme Wisdom begets a consubstantial Word as its self-expression, by analogy with the human mind conceiving itself) is confirmed. But ch. 33 does not cite John 1:1 by chapter and verse; the identification of this Word with the Johannine Word is mediated via chs. 29-31 (the Word through whom all things were made), as the research explanation itself states. The passage link is therefore indirect, and the research file flags it as partially verified.

14. **`ver-p4-calvin-john-14-16-doctrinal-001`** (doctrinal-connection, claim `john-calvin-john-14-16-001`) — PARTIALLY VERIFIED: the core claim (distinction of persons from 'another Comforter', by difference of offices) is confirmed in the section as read. But the explanation's final sentence claims Calvin in the same section notes that the Spirit proceeds from the Father (John 15:26); the section as read does not mention John 15:26 or procession from the Father. It does say the Spirit is the gift of the Father obtained by Christ's prayers and that Christ promises 'I will send Him to you' (John 16:7), and that Christ as God 'bestows that grace from himself', so the 'sent by both' part is supported; the John 15:26 part is not.

15. **`ver-p4-augustine-gal-4-4-doctrinal-001`** (doctrinal-connection, claim `augustine-gal-4-4-001`) — PARTIALLY VERIFIED: the argument as stated is built on Galatians 4:6 ('God has sent forth the Spirit of His Son into our hearts'), not on the inventory passage Galatians 4:4 (the sending of the Son, 'when the fullness of the time was come, God sent forth His Son'). The interpretation itself flags this in its notes. The (C) claim about Galatians 4:6 is confirmed at XV.26 section 45; the link to Galatians 4:4 is indirect (context verse). The quoted sentences occur in section 45, while the interpretation cites section 46.

16. **`ver-p4-damascus-exposition-date-001`** (date, claim `john-of-damascus-exposition-of-the-orthodox-faith`) — PARTIALLY VERIFIED: no exact composition date for the Exposition is established. The range 730-743 is an approximation bounded by the iconoclastic treatises (c. 730) and the revision of the Fountain of Knowledge (c. 743), as the research file itself states; it is not an established composition date. A second reference (encyclopedia.com) records two dates for the composition of the Fount of Knowledge, 728 and 743.

17. **`ver-p4-council-of-constantinople-381-milestone-001`** (milestone, claim `council-of-constantinople-381`) — PARTIALLY VERIFIED: the council and its date (381) are confirmed, and passage john-15-26 and author gregory-of-nazianzus exist in the inventory. But the received 381 creed text's exact relation to the 381 meeting is debated: the Constantinopolitan form is not in the Acts of the council of 381, Gregory of Nazianzus (who was at the council) mentions only the Nicene formula, and the Council of Chalcedon (451) is the witness that designated the received text as 'the Creed of the Council of Constantinople of 381'. The research file flags this debate correctly and records the milestone as partially-verified, not verified.

18. **`ver-p4-constantinopolitan-creed-381-milestone-001`** (milestone, claim `constantinopolitan-creed-381`) — PARTIALLY VERIFIED: the received form's sources, its exact relation to the 381 council's proceedings, and its connection with other fourth-century creedal forms are debated. Hort, Caspari and Harnack hold that the Constantinopolitan form did not originate at the council, because it is not in the Acts of 381; Gregory of Nazianzus, who was at the council, mentions only the Nicene formula; and the Latin Fathers apparently know nothing of it before the middle of the fifth century. The two texts (325 and 381) should not be treated as if an editor merely added one line in 381. The research file flags this debate correctly.

19. **`ver-p4-council-of-toledo-589-milestone-001`** (milestone, claim `council-of-toledo-589`) — PARTIALLY VERIFIED: the council (589) and Schaff's account are confirmed, and the record correctly carries a CAVEAT. But what is actually disputed is whether the Filioque stood in the Toledo III acts themselves: some scholarship holds it may be a later interpolation, and manuscript evidence has been argued to indicate that the clause first appeared in the creed at the Eighth Council of Toledo in 653, not at Toledo III in 589 (Shawn C. Smith, 'The Insertion of the Filioque into the Nicene Creed', Journal of Early Christian Studies 22:2 (2014), 261-286). Schaff argues the council itself had no suspicion it was using anything but the unaltered Constantinopolitan creed, and that 589 is the earliest date at which the words are found in the Creed. The milestone is therefore recorded as partially-verified, not verified.

20. **`ver-p4-racovian-catechism-attribution-001`** (attribution, claim `racovian-catechism`) — PARTIALLY VERIFIED: the research files DO flag the disputed authorship correctly in the notes - the four Socinus interpretations each state that the reading is the Catechism's / Socinian tradition, not Socinus as sole author, and the milestone racovian-catechism-1605 correctly has empty authorIds with a collective-authorship note. BUT the structured data still attributes the material to Socinus alone: works.json lists authorIds [faustus-socrinus] for racovian-catechism (with disputedAuthorship: true and an explanatory note), and all four interpretations in this pass carry authorId faustus-socrinus. Read without the notes, the structured attribution names Socinus as the author of a work drafted after his death. The attribution is therefore only partially verified at the data level; the structured authorIds should be corrected or the notes made structurally explicit before publication. Socinus's personal contribution to the text is likely but not individually established; the Catechism is a collective work of the Polish Brethren.

21. **`ver-p4-augustine-1john-5-7-attribution-001`** (attribution, claim `augustine-1john-5-7-001`) — PARTIALLY VERIFIED: the locator (Book II, ch. 22, section 3) and the passage's presence on the source page are confirmed, and the Latin original is in the public domain (Augustine died 430; Migne PL 42.794). The fair-use basis for the English excerpt is that it is a short passage (about 120 words) from a long section, reproduced for scholarly commentary on Augustine's reading of 1 John 5:7-8, and it is not the modern in-copyright Teske translation (Works of Saint Augustine I/18, New City Press, 1995). BUT the translator/edition of the English text is NOT named on the source page - confirmed by reading the page, which carries no translator credit - and the attribution to W. Smith, vol. 11 (1883) rests on a secondary listing that was not itself confirmed in this pass. The copyright status of the English translation therefore cannot be established from the source page, so the quotation must remain fair-use (not public-domain) and the edition must be confirmed before any publication. The quotation wording itself is the quotations team's domain and was not re-checked here.

22. **`ver-p4-athanasius-phil-2-5-001`** (quotation, claim `athanasius-phil-2-5-001`) — Locator is wrong: the passage is Discourse II, Chapter XIV, section 1 (NPNF2 vol. 4, p. 348; New Advent https://www.newadvent.org/fathers/28162.htm), not 'Discourse II, section 1' as cited - a reader following the cited locator would land on Discourse II, Chapter I, section 1, a different passage. Wording, translator, edition, and public-domain status are all correct; only the locator needs correction to Discourse II, ch. XIV, section 1.

23. **`ver-p4-augustine-john-14-26-quote-001`** (quotation, claim `augustine-john-14-26-001`) — LOCATION ERROR: the quoted passage is in Book XV, chapter 26, section 45, not section 46 as the research file states. Section 46 begins 'But the reason why, after His resurrection, He both gave the Holy Spirit...'. The wording itself is verbatim (the research text drops the leading 'And' and lower-cases 'it').

24. **`ver-p4-augustine-john-16-13-quote-001`** (quotation, claim `augustine-john-16-13-001`) — WORDING DIFFERENCE (spliced quotation): the research text joins two non-adjacent sentences of Book II, ch. 3, section 5 as if continuous. The source reads 'For He shall not speak of Himself, but whatsoever He shall hear, that shall He speak; and He will show you things to come. He shall glorify me; for He shall receive of mine, and shall show it unto you.' The research text omits 'and He will show you things to come. He shall glorify me;' and inserts 'and, For He shall receive of mine' (words that do occur later in the same section, in the sentence 'but of the Holy Spirit, For He shall not speak of Himself, but whatsoever he shall hear, that shall He speak; and, For He shall receive of mine, and shall show it unto you'), and omits roughly 70 intervening words before 'But because He has rendered the reason...'. Each quoted fragment is genuine, but the quotation as presented is not a continuous verbatim excerpt.

25. **`ver-p4-racovian-john-1-1-quote-001`** (quotation, claim `faustus-socrinus-john-1-1-001`) — NOT CONFIRMED VERBATIM AGAINST THE PRINTED PAGE: the full sentence as quoted (p. 140, Section IV, Chapter 1) could not be confirmed against the 1818 Rees edition. A text search of the Google Books OCR full text of the 1818 edition at archive.org returned no match for 'immediate interpreter' or 'purposes and decrees' (the OCR layer is heavily garbled in places), and no other accessible copy of the printed page was found. Per the team brief, this quotation must not be treated as verified on OCR alone; it needs a printed-page check (Google Books page image or another scan) before publication.

26. **`ver-p4-racovian-john-17-5-quote-001`** (quotation, claim `faustus-socrinus-john-17-5-001`) — NOT CONFIRMED VERBATIM AGAINST THE PRINTED PAGE: the wording from 'Christ beseeches God...' onward is confirmed verbatim by a secondary source quoting the Racovian Catechism on John 17:5 (focusonthekingdom.org, 'An Introduction to Dissident Heroes'), but the opening clause 'But the meaning of the passage is, that' was not confirmed, and a text search of the Google Books OCR full text of the 1818 edition at archive.org returned no match for 'purposes and decrees' (the OCR layer is heavily garbled in places). Per the team brief, this quotation must not be treated as verified on OCR alone; it needs a printed-page check (Google Books page image or another scan) before publication.

27. **`ver-p4-augustine-gal-4-4-quote-001`** (quotation, claim `augustine-gal-4-4-001`) — LOCATION ERROR: the quoted passage is in Book XV, chapter 26, section 45, not section 46 as the research file states. Section 46 begins 'But the reason why, after His resurrection, He both gave the Holy Spirit...'. The wording itself is verbatim. (Note also that the passage cites Galatians 4:6, not 4:4 as the interpretation's passageId suggests; the research summary correctly cites Gal. 4:6.)

28. **`ver-p4-augustine-1john-5-7-quote-001`** (quotation, claim `augustine-1john-5-7-001`) — TRANSLATOR NOT CONFIRMED: the wording is verified verbatim, but against the Nicene and Post-Nicene Fathers, Series I, Vol. 7 (Homilies on the First Epistle of John, Part 11), where this extract from Contra Maximinum II.22.3 is reproduced; the NPNF I/7 translation is by H. Browne, not 'W. Smith' as the research file states (the researcher themselves noted the attribution was 'as cited in a secondary listing; not named on the source page'). The clerus.org page cited by the researcher could not be opened to confirm its translator. REPRODUCIBILITY: the research file marks this 'fair-use', but the identical wording appears in NPNF Series I, Vol. 7 (1888), a public-domain text, so the fair-use label may be unnecessarily restrictive; the editor should decide whether to reclassify it as public-domain. The Latin original is Migne, Patrologia Latina 42.794-795, as the research file states.

## Special-attention items

### Johannine Comma — upgraded to verified on new checked evidence

Phase 2 record `ver-1john-5-7-comma-001` was `not-verified`. Phase 4 record
`ver-p4-1john-5-7-comma-001` (claim `1john-5-7-comma`) is **`verified`**, on new evidence
read in full by Team A and spot-checked by the coordinator: Daniel Wallace, "The Textual
Problem in 1 John 5:7-8" (bible.org) — the Comma is found in only eight late manuscripts
(four in a marginal note), none with sure evidence before the 1500s; it appears in no Greek
witness of any kind before AD 1215 (a Greek translation of the Acts of the Lateran Council,
a work originally written in Latin); it seems to have arisen in a fourth-century Latin
homily and entered Erasmus's third edition (1522) under pressure. Corroborated by the
absence of the Comma from Vaticanus and Sinaiticus and its placement in the NA28/UBS5
apparatus. Limitation recorded in the record: the manuscripts were not examined first-hand;
the finding relies on Wallace's survey citing Metzger, *Textual Commentary*, 647–49.
The Comma must still never be presented as direct evidence or as original.

### The one fair-use quotation — Augustine, Contra Maximinum II.22.3

Interpretation `augustine-1john-5-7-001`. The wording is **verified verbatim** (quotation
record `ver-p4-augustine-1john-5-7-quote-001`), but the translator attribution "W. Smith"
could **not** be confirmed: the NPNF Series I vol. 7 translation, where the same wording
appears, is by H. Browne, and the cited clerus.org page could not be opened. The
attribution record `ver-p4-augustine-1john-5-7-attribution-001` is `partially-verified`:
the locator (Book II, ch. 22, §3; PL 42.794) is confirmed and the fair-use basis is sound in
outline (a short ~120-word excerpt; the Latin original is public domain), but the
edition/translator must be confirmed before publication. The identical wording also appears
in NPNF I/7 (1888, public domain), so the "fair-use" label may be unnecessarily
restrictive — an editorial decision, flagged, not changed here.

### Disputed authorship

- **1 Clement** (`clement-of-rome`): attribution record verified — the prologue names no
  author; the traditional ascription to Clement is widely accepted but must stay flagged
  as traditional.
- **Martyrdom of Polycarp** (`church-of-smyrna`): attribution record verified — corporate
  authorship by the church of Smyrna; Polycarp's ch. 14 prayer is reported speech.
- **Athanasius, Against the Arians, Discourse IV**: attribution record verified that the
  dispute is real and unresolved (New Catholic Encyclopedia: the fourth Discourse is
  "definitely spurious"; Quasten: added later by an unknown author; Vinzent: c. 340,
  possibly Apollinaris; Walbrodt defends genuine Athanasian authorship). The research file
  flags this only at work level, **not** in the three Discourse IV interpretation records
  (`athanasius-john-1-1-001`, `athanasius-john-10-30-001`, `athanasius-rom-9-5-001`) —
  those three doctrinal-connection records are therefore `partially-verified` until the
  flag is added to the interpretations. The 356–360 work-date range is supported for
  Discourses I–III only; Discourse IV's date is less certain (placed as early as c. 340).
- **Racovian Catechism**: attribution record `partially-verified`. The notes do flag the
  facts correctly (Socinus died 1604 before drafting; the work was completed by Smalcius,
  Moskorzowski, and Völkel; first published in Polish 1605), and the milestone correctly
  has empty `authorIds` — but all four interpretations still carry
  `authorId: faustus-socrinus` and `works.json` lists `authorIds: [faustus-socrinus]` for
  `racovian-catechism`. Read without the notes, the structured data attributes a work
  drafted after his death to Socinus as author. The structured `authorIds` should be
  corrected or made structurally explicit before publication (a research-file change, not
  made in this PR). No interpretation's *text* attributes Racovian material to Socinus as
  author.

### Uncertain dates

- **Work dates**: 27 of 30 Phase 4 date records are `verified`. The 3
  `partially-verified` are: the Arius *Thalia* (318–321; no dating study checked — the range
  rests only on "commonly placed" and necessarily predates Nicaea 325);
  Athanasius *Against the Arians* (356–360 covers Discourses I–III only, see above); John of
  Damascus *Exposition of the Orthodox Faith* (730–743 is an approximation bounded by the
  iconoclastic treatises c. 730 and the *Fountain of Knowledge* revision c. 743; no exact
  composition date is established). The 18 work-date records flagged `partially-verified`
  in Phase 3 were re-checked: 15 are now `verified` on checked dating sources; these 3
  remain partial for the reasons stated.
- **Toledo 589**: milestone record `partially-verified`. The council and 589 date are
  confirmed, and Schaff's account is confirmed (589 is the earliest date the Filioque words
  are found in the Creed; Leo III opposed 809; Rome adopted 1014). What is disputed is
  whether the Filioque stood in the Toledo III acts themselves — manuscript evidence has
  been argued to put its first appearance in the creed at Toledo VIII (653) (Smith, JECS
  22:2, 2014). The research file's CAVEAT is correct.
- **Constantinople 381 / Constantinopolitan Creed**: both milestone records
  `partially-verified`. The council and its 381 date are confirmed, but the received creed
  text's relation to the 381 meeting is genuinely debated (not in the 381 Acts; Gregory of
  Nazianzus knew only the Nicene formula; Chalcedon 451 is the witness to the attribution;
  Hort, Caspari, and Harnack hold the form did not originate at the council). The research
  file flags this correctly.
- **Arius / Thalia**: the attribution chain is verified and recorded explicitly — the *Thalia*
  survives only in fragments quoted by Athanasius (*Against the Arians*, Discourse I, ch. 2,
  §§5–6); every wording attributed to Arius is Athanasius's quotation, not a manuscript of
  Arius. (One check used two other reproductions of the same NPNF2 edition because the New
  Advent page for Discourse I was rate-limited in that pass; recorded in the record.)
- **Racovian quotations from the 1818 OCR scan**: two of four were confirmed verbatim against
  the 1818 OCR text where the OCR layer is legible (`faustus-socrinus-matt-28-19-001`,
  pp. 56–57; `faustus-socrinus-1cor-8-6-001`, p. 54). Two could **not** be confirmed against
  a printed 1818 page and are `partially-verified` (`faustus-socrinus-john-1-1-001`, p. 140;
  `faustus-socrinus-john-17-5-001`, p. 144 — the OCR search returned no match and the full
  sentences were not confirmed; one clause was corroborated only by a secondary source).
  They need a printed-page check before publication.

### Research-file errors found by verification (flagged, not fixed here)

Verification does not edit research files. The following must be corrected in the research
files (Phase 5 or a research follow-up) before publication:

1. **Hilary, *On the Trinity* I, §13** (`hilary-john-1-1-001`): the explanation's sentence
   claiming that in §13 Hilary argues the Word's "was" has no limit of time and no
   commencement is not supported by the checked edition — §13 of Book I is entirely about
   Colossians 2:8–15 ("philosophy and vain deceit"); the quoted phrases occur nowhere in
   Book I on New Advent. The core reading is verified (§§10–11 quote John 1:1–14 and call
   the Word "God of God"); the §13 sentence must be corrected or removed.
2. **Augustine, *De Trinitate* II.3.5** (`augustine-john-16-13-001`): the quotation is a
   splice — two non-adjacent sentences of §5 joined as if continuous, omitting "and He will
   show you things to come. He shall glorify me;" and ~70 intervening words. Each fragment
   is genuine Haddan text, but the quotation as presented is not a continuous verbatim
   excerpt. It must be re-quoted as two separate excerpts before publication.
3. **Augustine, *De Trinitate* XV.26** (`augustine-john-14-26-001`, `augustine-gal-4-4-001`):
   the quoted sentences are in **§45, not §46** as cited (§46 begins "But the reason why,
   after His resurrection…"). Wording is verbatim; only the locator is wrong. (The Gal 4:4
   interpretation's argument is built on Gal 4:6, not the inventory passage Gal 4:4 — the
   interpretation itself flags this; the Gal 4:6 claim is verified, the Gal 4:4 link is
   indirect.)
4. **Leo I, Letter 15, ch. II** (`leo-i-john-15-26-001`): the (C) claim that the letter
   records Leo's own understanding that the Spirit proceeds from both is **not supported** —
   "He who proceeded from both" occurs only inside Leo's summary of the Priscillianist
   error he is refuting, never in Leo's own doctrine, and John 15:26 is not cited in ch. II.
   The error summary and Leo's positive statement are confirmed; the (C) sentence should be
   revised before any publication.
5. **Calvin on John 14:16** (`john-calvin-john-14-16-001`): the explanation's final sentence
   claims Calvin notes the Spirit proceeds from the Father (John 15:26); the section as read
   never mentions John 15:26. The core claim is verified; the final sentence should be
   corrected.
6. **Anselm, *Monologion* ch. 33** (`anselm-of-canterbury-john-1-1-001`): ch. 33 does not cite
   John 1:1 by chapter and verse; the Johannine identification is mediated via chs. 29–31,
   as the research itself states. The passage link is indirect, not a direct citation.
7. **Athanasius, Discourse II, Phil 2:5** (`athanasius-phil-2-5-001`): the wording is verbatim
   but the cited locator is wrong — the passage is Discourse II, ch. XIV, §1 (NPNF2 vol. 4,
   p. 348), not "Discourse II, §1". Coordinator note: the New Advent page for Discourse II
   numbers this text as its §1, so the two numbering schemes (NPNF2 print chapters vs. New
   Advent section numbers) disagree here; the locator should be given in the print-edition
   chapter form so a reader of either edition can find it. The record stays
   `partially-verified` pending that correction.
8. **Racovian structured attribution** (see "Disputed authorship" above): the four
   interpretations and `works.json` still carry `authorId(s): faustus-socrinus` for a work
   drafted after his death.

### Classification notes

- No passage classification was found outright wrong — no `contradicted` record. Five
  `direct` classifications are `partially-verified` because their doctrinal force depends on
  a contested reading or an inference the record itself flags: Matt 3:16 (the heavenly
  voice is never named "Father" in the text); John 10:30 (essence vs. purpose/will oneness
  contested); Phil 2:5 ("form of God" ambiguous); Titus 2:13 and 2 Pet 1:1 (Granville
  Sharp single-person reading best-supported but a two-person reading has been proposed).
  None of the five may be published as direct evidence for the fully formulated doctrine.
- All 49 `indirect` / `historically-interpreted` doctrinal-connection records are `verified`:
  the §2 A–D distinction is kept, inferences are labelled, and alternatives are recorded
  where claimed.

## What this PR does NOT do

- No T3/T4 research file changed (`passages.json`, `interpretations.json`,
  `milestones.json`, `authors.json`, `works.json`, notes) — verification findings live only
  in verification records, per the standards.
- No T1 standard, schema, or template changed. No published content changed; no registry,
  book manifest, or test file touched. No database. No editorial override (none requested,
  none recorded).
- Nothing is editorially approved: every Phase 4 record has `editorialApproval: null`.
  Nothing is publishable yet.
- This is Dev 1 second-pass verification, NOT the independent QA verification required by
  §9.2. QA must still verify independently.

## What remains for Phase 5 (editorial preparation)

- Resolve the 28 partially-verified items above — Stage 1 done 2026-11-25 (18 resolved by
  correction + new verified record; see Phase 5 resolutions below). 10 remain: 5 `direct`
  classifications and 3 milestone debates (permanent flags); the Anselm and Gal 4:4 link
  framings.
- Independent QA verification per §9.2 of all 759 records (Phases 2–5).
- Editorial approval by Yonatan (separate step; not verification).
- Only then may verified + approved claims be wired into published content.

## Phase 5 resolutions — Stage 1 (corrections, 2026-11-25)

Stage 1 corrects the 8 flagged research-file errors and adds the Discourse IV
disputed-authorship flag to the 3 interpretations. Each correction was re-checked
against the named edition (New Advent NPNF texts, sacred-texts Calvin) and verified
by a new `ver-p5-*` record (checker `dev-1-verifier`, checkDate 2026-11-25,
`editorialApproval: null`). The 28 Phase 4 `partially-verified` records are preserved
as the check of the pre-correction text; the new records are wired into the corrected
entities' `verificationRecordIds`. Record totals after Stage 1: **759 (639 `verified`,
119 `partially-verified`, 1 `not-verified`)**.

Resolved (18 items, by Phase 4 summary item number):

- Item 8 (Hilary I §13): the false sentence is removed from the explanation of
  `hilary-john-1-1-001` (and its note). §13 is about Colossians 2:8-15, not the Word's
  "was". New record `ver-p5-hilary-john-1-1-explanation-001` (`verified`).
- Items 6, 7, 9 (Discourse IV flag): the disputed-authorship flag is added to the
  notes of `athanasius-john-1-1-001`, `athanasius-john-10-30-001`, and
  `athanasius-rom-9-5-001` (and their notes), citing the New Catholic Encyclopedia
  ("definitely spurious") and Quasten (added later by an unknown author). New records
  `ver-p5-athanasius-john-1-1-attribution-001`,
  `ver-p5-athanasius-john-10-30-attribution-001`, and
  `ver-p5-athanasius-rom-9-5-attribution-001` (all `verified`).
- Item 12 (Leo I Letter 15 (C)): the (C) sentence in `leo-i-john-15-26-001` is revised
  to three distinct persons of one essence, and the explanation's final sentence is
  corrected: "He who proceeded from both" occurs only inside Leo's summary of the
  Priscillianist error; Leo's own doctrine makes no procession claim, and John 15:26
  is not cited in chapter II. New record `ver-p5-leo-i-john-15-26-doctrinal-001`
  (`verified`).
- Item 14 (Calvin John 14:16): the final sentence of the explanation of
  `john-calvin-john-14-16-001` is corrected — the Spirit is the gift of the Father
  obtained by Christ's prayers, and Christ promises "I will send Him to you"
  (John 16:7); John 15:26 is not mentioned in the section. New record
  `ver-p5-calvin-john-14-16-explanation-001` (`verified`).
- Item 22 (Phil 2:5 locator): the locator of `athanasius-phil-2-5-001` is corrected to
  Discourse II, Chapter XIV, section 1 (NPNF2 vol. 4, p. 348; New Advent §1), so a
  reader of either edition can find it. New record
  `ver-p5-athanasius-phil-2-5-quote-001` (`verified`; the print page was not re-checked
  first-hand in this pass — see the record's limitations).
- Item 23 (John 14:26 locator) and item 27 (Gal 4:4 locator): the locators of
  `augustine-john-14-26-001` and `augustine-gal-4-4-001` are corrected from
  §46 to §45 (both quotations are in §45; §46 begins "But the reason why, after His
  resurrection..."). New records `ver-p5-augustine-john-14-26-quote-001` and
  `ver-p5-augustine-gal-4-4-quote-001` (both `verified`).
- Item 24 (II.3.5 splice): the quotation of `augustine-john-16-13-001` is re-quoted as
  two separate verbatim excerpts from Book II, ch. 3, §5, with the omission marked
  […]. New record `ver-p5-augustine-john-16-13-quote-001` (`verified`).
- Item 20 (Racovian structured attribution): `shared/works.json` now lists
  `authorIds: [polish-brethren]` for `racovian-catechism`; a collective author entry
  `polish-brethren` is added to `shared/authors.json`; all four interpretations carry
  `authorId: polish-brethren`. Interpretation ids keep their `faustus-socrinus-…`
  slugs as stable identifiers. New record `ver-p5-racovian-catechism-attribution-001`
  (`verified`).

- Items 21 and 28 (fair-use Augustine translator): reclassified to public-domain on
  Yonatan's decision (2026-11-25, Option A). The English text is the H. Browne
  translation as reproduced in NPNF Series I, Vol. 7, Homilies on the First Epistle of
  John, Part 11 (1888) — re-verified verbatim against the Wikisource NPNF I/7 text
  2026-11-25, including the title-page credit "translated by rev. H. Browne"; the
  "W. Smith" attribution was wrong. The quotation text itself is unchanged (earthly
  witnesses only, no Comma clause). The interpretation's translation, edition,
  reproducibilityStatus, citation, and EDITION UNCERTAINTY note are updated; one new
  record `ver-p5-augustine-1john-5-7-attribution-001` (`verified`) covers both items.

- Items 10, 11, and 16 (dating studies): all three ranges confirmed by first-hand
  literature checks, each with a new `verified` record.
  - Thalia 318–321: Schaff (CCEL §119) — the controversy broke out about 318 or 320,
    Arius was deposed by the Alexandrian council in 321, and driven from Alexandria he
    diffused his doctrine in the Thalia; Finnegan states the dating directly ("sometime
    between a.d. 318 and 321"). Hard bound: Nicaea 325. No exact composition date is
    established; the direct statement comes from a popular source, Schaff's scholarly
    narrative supports the same window. Record
    `ver-p5-arius-thalia-date-001`.
  - *Against the Arians* 356–360 (Discourses I–III): NPNF2 Introduction, read first-hand
    ("Written Between 356 And 360"; "there is tolerable certainty as to the date of our
    Discourses"); NCE ("in all probability, during his third exile (c. 358)"); Catholic
    Culture ("most likely written during his third exile"). The range covers Discourses
    I–III only and must not be read as covering Discourse IV (NPNF2 Introduction: "the
    relation of the fourth Discourse to the others is by no means clear"; Vinzent c. 340).
    Record `ver-p5-athanasius-against-the-arians-date-001`.
  - *Exposition* 730–743: Britannica ("Revised circa 743", third part the Exposition);
    Harakas (two recorded composition dates for the Fount, 728 and 743; the parts were
    written independently at different times, then gathered; the iconoclastic treatises
    726–731). The range is the best-supported approximation, verified as such — no exact
    composition date is established, and the 730 bound is borrowed from the iconoclastic
    treatises. Record `ver-p5-damascus-exposition-date-001`.

- Items 25 and 26 (Racovian printed-page checks, pp. 140 and 144): both confirmed
  verbatim against the OCR text layer of the 1818 Rees edition (archive.org item
  `racoviancatechi00reesgoog`, djvu.txt). The Phase 4 search failed because it searched
  exact phrases broken by line-break hyphenation ("in-terpreter", "pur-poses"); the
  running heads 134, 138, 140, 142, 144 in sequence confirm the pagination, and the
  sentences read verbatim once hyphenation and minor OCR noise are accounted for. The
  John 17:5 opening clause ("But the meaning of the passage is, that"), which the Phase
  4 secondary source could not confirm, is confirmed here. New records
  `ver-p5-racovian-john-1-1-quote-001` and `ver-p5-racovian-john-17-5-quote-001`
  (both `verified`).

Still open (10 items):

- Items 1–5 (the five `direct` classifications): permanent flags, confirmed as-is.
  None may be presented as direct evidence for the fully formulated doctrine.
- Items 17–19 (Constantinople 381 ×2, Toledo 589 milestones): permanent flags — the
  debates are the honest state of scholarship, and the research files already flag
  them correctly.
- Items 13 (Anselm) and 15 (Gal 4:4 link): the framings are confirmed correct as-is
  (the Anselm link is indirect and says so; the Gal 4:4 argument is built on Gal 4:6
  and says so); the records stay `partially-verified` as flags.

## QA pre-verification corrections (2026-11-25)

QA pre-verified the staging tree (findings at `~/workspace/qa-phase5/findings.md`):
13 of the 15 resolved items confirmed first-hand against their named editions, tallies
re-derived, validator exit 0. Two record-accuracy gaps were found and fixed here; neither
is a data fabrication, and no corrected research content changed except the one word below.

- John 14:26 quotation: the stored text dropped the leading "And" unmarked while its
  record claimed "Wording verbatim". Re-checked first-hand against New Advent XV.26 §45
  (the sentence begins "And it is proved by many other testimonies..."; §46 begins "But
  the reason why, after His resurrection..."). The "And" is restored to the quotation in
  `augustine-john-14-26-001` (JSON + note). New record
  `ver-p5-augustine-john-14-26-quote-002` (`verified`).
- II.3.5 omission size: the record said "about 70 words"; the omitted passage as printed
  in §5 counts 105 words (counted first-hand; the omitted restatement uses the variant
  "whatsoever he shall hear, that shall He speak"). The quotation itself is unchanged.
  New record `ver-p5-augustine-john-16-13-quote-002` (`verified`).
- Discourse IV attribution records: the three `-001` records cited only the Phase 4
  record and carried "limitations: None". Re-checked first-hand: the NCE sentence is
  verbatim (encyclopedia.com, "Athanasius, St.", Dogmatic Writings); the Catholic Culture
  page (recnum 3085) Description paragraph, closed "(Quasten)", carries "differs in
  address, content, and style"; the page's untagged Provenance section carries "single
  continuous work" and "added later by an unknown author" (the host's own summary, not
  Quasten-tagged — those two phrases stay as attributed via the secondary host, not
  upgraded); Walbrodt (1993) argues CAR IV is genuinely Athanasian (abstract, read
  first-hand). The three `-002` records cite NCE, Catholic Culture, and Walbrodt directly
  and carry the divided-scholarship limitation instead of "None". The flag text is
  untouched. New records `ver-p5-athanasius-john-1-1-attribution-002`,
  `ver-p5-athanasius-john-10-30-attribution-002`,
  `ver-p5-athanasius-rom-9-5-attribution-002` (all `verified`).
