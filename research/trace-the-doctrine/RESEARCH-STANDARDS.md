# Trace the Doctrine — Research Standards

Binding standards for all Trace the Doctrine research in this repository.
These standards exist so that every published claim about a doctrine can be
traced to verifiable evidence, and so that no reader is misled about what a
biblical text says, what a historical writer said, or when a doctrine was
formulated. Where a standard and a researcher's judgement conflict, the
standard wins; raise the conflict with the EM rather than working around it.

Trinity is the first doctrine. The standards are doctrine-neutral and apply
unchanged to every later doctrine.

---

## 1. Evidence classification (biblical passages)

Every passage in a doctrine's inventory carries exactly one
`evidenceClassification`, chosen from this enum. The classification is a
research judgement that must itself be justified in the passage record's
`relationshipToDoctrine` explanation and checked by a verifier — it is not
a label to be assigned casually.

### 1.1 `direct`

**Definition.** The passage, on its own terms and in its own wording,
explicitly states the doctrinal content in question.

**What it licenses.** A researcher may say the passage *states* the
doctrine (or the relevant element of it), and may quote it as direct
biblical evidence for the doctrine.

**What it does not license.** It does not license claiming the passage
states the *later formulated* doctrine in its later technical vocabulary
(see §2). A passage can be direct evidence for an element (e.g. the
Father, Son, and Holy Spirit named together in one commission) without
stating the fully formulated doctrine.

**Example.** A passage that names Father, Son, and Holy Spirit together in
a single act would be a candidate for `direct` — *candidate* only; the
researcher must still justify the classification and a verifier must
confirm it. No passage in the Trinity inventory is classified `direct`
until that work is done.

### 1.2 `indirect`

**Definition.** The passage does not explicitly state the doctrinal
content, but it bears on the doctrine by implication, by a pattern it
establishes, or by a claim that is consistent with — and commonly read as
supporting — the doctrine, without stating it.

**What it licenses.** A researcher may say the passage *is consistent
with*, *supports*, or *is read as pointing toward* the doctrine, and must
say which of those it is. The reasoning from text to doctrine must be
spelled out in `relationshipToDoctrine`.

**What it does not license.** It does not license saying the passage
*states*, *teaches*, or *proves* the doctrine, and it does not license
treating an implication as an explicit statement.

### 1.3 `historically-interpreted`

**Definition.** The passage does not itself state the doctrinal content,
but one or more historical writers interpreted it in a doctrinal light.
The classification records a fact about *reception history*, not a fact
about what the text says.

**What it licenses.** A researcher may say named writers *read* the
passage in a doctrinal way, with each reading attributed to its writer,
work, and location, and verified by quotation or precise citation.

**What it does not license.** It does not license saying the passage
itself states the doctrine, and it does not license presenting a
historical writer's reading as the text's plain meaning.

### 1.4 Worked example: Genesis 1:26

> "Let us make man in our image, after our likeness." (Gen 1:26)

This passage is the worked example of **`historically-interpreted` — NOT
`direct`**.

- The text uses a plural ("let **us** make"), and some patristic writers
  read that plural as adumbrating the Trinity. That reading is real
  reception history and may be recorded — attributed, quoted, and cited.
- The text itself does **not** name Father, Son, and Holy Spirit; it does
  not state that God is three persons in one essence; and it does not use
  any later Trinitarian vocabulary.
- Classifying Gen 1:26 as `direct` would misrepresent the text. Any
  researcher who proposes `direct` for it has the burden of proof, and a
  verifier must reject the classification unless that burden is met with
  textual evidence, not with the weight of later interpretation.
- The same discipline applies in reverse: a passage's classification must
  never be chosen to make the doctrine look more (or less) biblically
  explicit than the evidence supports.

---

## 2. The four-way distinction

Every research claim must keep these four things separate. Conflating any
two is the most common way this project can mislead a reader.

| # | What it is | Rule |
|---|-----------|------|
| A | What the text **explicitly states** | Report only what the wording says. Quote it; do not paraphrase it into a stronger claim. |
| B | What may **reasonably be inferred** | Label it as an inference, show the reasoning step by step, and name who draws it (the researcher or a cited writer). An inference is never presented as an explicit statement. |
| C | How **historical writers interpreted** it | Attribute every reading to a named writer, work, and location. A writer's reading is evidence about the writer, not a paraphrase of the text. |
| D | How doctrine was **later formulated** | Date the formulation, name the council / creed / writer responsible, and never project it backwards onto earlier texts or writers. |

**Rules.**

1. A later formulation (D) is never presented as explicit in an earlier
   text (A) or as held by an earlier writer (C). If a writer predates a
   formulation, say so; do not describe them as "teaching" the formulation.
2. An inference (B) is always labelled as such. "The text implies X" is a
   claim that needs its own justification and verification.
3. A historical reading (C) is never silently upgraded into the text's
   meaning (A). Write "Augustine reads Gen 1:26 as …", never "Gen 1:26
   teaches …" when the evidence is Augustine's reading.
4. When a passage is used in a doctrinal argument, the record must say
   which of A–D is being invoked, for each step of the argument.

---

## 3. Quotation rules

1. **Verbatim only from a checked source.** A quotation is reproduced
   verbatim from a primary source the researcher (or verifier) has
   actually checked — the original-language text, or a named edition /
   translation of it. Never quote from memory, from a secondary summary,
   or from an unchecked web page.
2. **No paraphrase presented as quotation.** A paraphrase or summary is
   labelled as such and is never placed in quotation marks or in a
   `quotation.text` field.
3. **No quotation without provenance.** Every quotation records all of:
   - the **work** and its **location** (book / chapter / section /
     paragraph number as the edition numbers it),
   - the **edition / translation** used (editor and/or translator,
     edition, year),
   - the **language** of the quoted text,
   - the **reproducibility status**: `public-domain`, `fair-use`,
     `permission-granted`, or `not-reproducible`.
4. **Not legally reproducible? Cite and summarise, never reproduce.**
   If a quotation is under copyright and neither fair use nor permission
   covers reproducing it at the length needed, do **not** reproduce it
   beyond what is lawful. Record the full citation, a precise locator so
   a reader can find it, and a summary in the researcher's own words.
   Never shorten a quotation silently in a way that changes its sense;
   any omission is marked with an ellipsis and any editorial insertion
   with square brackets.
5. **Translation is a claim.** A translated quotation states whose
   translation it is. The researcher does not silently "improve" a
   published translation, and does not present their own translation
   without labelling it as their own and noting the source text it was
   made from.
6. **Check the quotation, not the citation of the quotation.** Citing a
   modern author who quotes an ancient writer is not verification of the
   ancient writer's words. The verification record must say whether the
   primary source itself was checked.

---

## 4. Citation rules

1. **Every claim carries a full citation.** No uncited claims in research
   files. A citation names the work, the edition / translation (editor
   and/or translator where relevant), and a stable locator.
2. **Stable locator.** Where a public-domain source is available online,
   give its URL (e.g. CCEL, New Advent) **plus** a print citation
   (edition, volume, page / section). A URL alone is not a citation: URLs
   move and sites change. A print citation alone is acceptable where no
   stable public URL exists.
3. **Edition matters.** Ancient works circulate in many editions and
   translations that differ in wording and numbering. The citation must
   identify the edition actually used, so a verifier can check the same
   words in the same place.
4. **Secondary sources are labelled secondary.** A claim about what a
   writer said must be traceable to the primary source; a secondary source
   may be cited for context or for the state of scholarship, never as a
   substitute for the primary source.
5. **Access dates.** Every URL citation records the date it was accessed,
   in its verification record.

---

## 5. Date and attribution rules

1. **Work dates are writing dates.** The date recorded for a work is when
   it was written (or, where that is unknown, the best-supported range),
   never the author's birth or death dates. Do not use a lifespan as a
   work date.
2. **Approximate and range dates carry a certainty level.** Every date
   records `certainty`: `exact`, `approximate`, `range`, or `unknown`.
   - `exact`: a single year (or narrower) supported by evidence.
   - `approximate`: a single year marked approximate (e.g. "c. 150").
   - `range`: an earliest and latest year (e.g. 150–160).
   - `unknown`: no date asserted; `earliest` and `latest` are null.
   A date without a certainty level is unverified.
3. **Disputed authorship and pseudonymous works are flagged, never
   silently attributed.** If authorship is disputed, uncertain, or the
   work is pseudonymous, the record says so explicitly, names the
   dispute, and does not attribute the work to the named author as fact.
   Never resolve a scholarly dispute by silently picking a side.
4. **Dates and titles are null / pending until verified.** A title, date,
   or attribution that has not been verified is recorded as `null` with
   status `not-started` (or the relevant lifecycle status) — never filled
   with a plausible-looking guess, a date copied from an unchecked source,
   or a title remembered approximately.
5. **Titles are the work's title in the edition cited.** Do not invent a
   short title and present it as the work's title. Short display titles,
   where used, are labelled as such.

---

## 6. Alternative interpretations and disagreement

1. **Represent fairly.** Where writers or scholars disagree about a
   passage, a reading, or a formulation, record the disagreement: who
   holds each position, on what evidence, with citations.
2. **Attribute, don't harmonise.** Do not smooth over differences to make
   writers agree, and do not present one side's reading as "the"
   interpretation while omitting the other side. If a reading is
   contested, the record says it is contested.
3. **Record dissenting readings.** A reading that cuts against the
   doctrine's standard presentation is recorded with the same care as a
   supportive one. Omitting dissent is a form of misrepresentation.
4. **The researcher is not a referee.** The researcher reports positions
   and evidence; they do not declare a winner unless the claim being
   recorded is itself a sourced scholarly judgement, cited as such.

---

## 7. Verification checklist

A Phase 4 verifier runs this checklist against each record type. A record
passes only if every applicable item passes. "Not applicable" must be
justified in writing, never assumed.

### 7.1 Per passage

- [ ] Passage id is a stable slug; book / chapter / verse range is correct
      against the biblical text.
- [ ] Canonical order is correct.
- [ ] `evidenceClassification` is one of `direct` / `indirect` /
      `historically-interpreted`, is justified in `relationshipToDoctrine`,
      and is consistent with §1 and §2 (no later formulation presented as
      explicit in the text).
- [ ] `relationshipToDoctrine` distinguishes A–D (§2) and labels every
      inference as an inference.
- [ ] Every factual claim in the record has a citation (§4) and a
      verification record (§8).
- [ ] Status is honest: `not-started` until research begins; never
      `verified` without a verification record saying so.

### 7.2 Per interpretation

- [ ] Passage id, author id, and work id all exist in the registries (or
      are explicitly marked pending — never silently invented).
- [ ] Quotation is verbatim from a checked primary source or named,
      checked edition / translation (§3.1); no paraphrase in quotation
      marks (§3.2).
- [ ] Quotation carries work + location + edition / translation +
      language + reproducibility status (§3.3).
- [ ] If not legally reproducible, the quotation is not reproduced beyond
      what is lawful; citation + summary are present instead (§3.4).
- [ ] The writer's reading is attributed to the writer (§2, row C) and
      not presented as the text's plain meaning.
- [ ] Dates are writing dates with a certainty level; disputed authorship
      is flagged (§5).
- [ ] Alternative / dissenting readings of the same passage are recorded
      or their absence is justified (§6).
- [ ] Every claim has a verification record (§8).

### 7.3 Per milestone

- [ ] Title, type, and date / range with certainty are all verified or
      explicitly pending (§5).
- [ ] Passages and authors involved are listed by id and each link is
      verified — no passage-to-author or passage-to-milestone link is
      asserted without evidence.
- [ ] The summary distinguishes what the milestone did (D) from what
      earlier texts state (A).
- [ ] Citations are full and stable (§4); every claim has a verification
      record (§8).

### 7.4 Per quotation

- [ ] The primary source was checked (not merely a secondary citation of
      it) — §3.6.
- [ ] The quoted wording matches the named edition / translation at the
      stated location.
- [ ] Language and translator / editor are recorded.
- [ ] Reproducibility status is correct; permission, where claimed, is
      evidenced (who granted it, when).
- [ ] Omissions and insertions, if any, are marked (§3.4).

---

## 8. Verification records

A verification record is kept **per claim**, not per file. See
`schemas/verification-record.schema.json` and
`templates/verification-record.template.md`.

- `claimText` states exactly what is claimed — the same words that would
  be published. Verifying a paraphrase of a claim does not verify the
  claim.
- `claimType` is one of: `quotation`, `date`, `attribution`,
  `passage-link`, `doctrinal-connection`, `milestone`.
- `sourcesChecked` lists every source actually checked, with edition,
  locator, and date accessed. "Checked" means the checker read the
  relevant part of that source.
- `result` is one of: `verified`, `partially-verified`, `not-verified`,
  `contradicted`, `unable-to-verify`.
- `evidenceFound` gives a verbatim excerpt or a precise locator, or the
  words `none found`.
- `limitations` records remaining gaps and open questions honestly.

**Publishability rule.** A claim is publishable **only** when its
verification record says `result: "verified"` **and** editorial approval
is recorded on that record. Claims with result `partially-verified`,
`not-verified`, `contradicted`, or `unable-to-verify` must never be
published, in any form — including as "probably true" or in a footnote.

---

## 9. Research workflow and status lifecycle

Research-first: research is written and verified in this directory before
any of it is wired into published content. No published page, component,
or data file may present research that has not completed this lifecycle.

### 9.1 Lifecycle

```text
not-started → in-research → verification-pending → verified
    → editorially-approved → published
```

- `not-started` — nothing has been done; all research fields null/empty.
- `in-research` — a researcher is actively working on the record.
- `verification-pending` — research is drafted and handed to a verifier.
- `verified` — an independent verifier has checked every claim and
  recorded `verified` results (see §8). The researcher who wrote the
  record cannot verify their own work.
- `editorially-approved` — editorial approval is recorded, separately
  from verification, by the editor (Yonatan, as final approver).
- `published` — the verified, approved content has been wired into
  published content. Nothing in this directory is itself "published" by
  being merged here.

A record may move backwards (e.g. `verification-pending` →
`in-research`) when verification finds a problem. The move and the reason
are recorded in the verification record.

### 9.2 Who moves a record between states

- **Researcher** proposes: writes the record, moves it to
  `verification-pending`, and must not mark their own work `verified`.
- **Independent verifier** checks: runs the §7 checklist, writes a
  verification record per claim, and moves the record to `verified` only
  if every claim passes — or back to `in-research` with findings.
- **Editorial approval** is a separate step, by the editor, recorded on
  the verification record. Verification is not approval and approval is
  not verification.
- **Publication** is a separate, later step, and is never part of this
  research workflow.

### 9.3 Storage

- Research is structured Markdown and JSON in this repository. No
  database is used for research. No additional infrastructure is required.
- Author and work identifiers are reusable across doctrines: define them
  once in `shared/` and reference them by id everywhere else.

---

## 10. Out of scope / never publish unverified

The following must never appear in published content, and must never be
promoted from this directory into published content:

- Unverified quotations, titles, dates, passage-to-author links, or
  doctrinal claims.
- Demo / placeholder data from the frontend preview, in any form.
- A claim whose verification result is `partially-verified`,
  `not-verified`, `contradicted`, or `unable-to-verify`.
- A claim with no verification record at all.
- A record that has been verified but not editorially approved.
- Any editorial override without Yonatan's explicit approval. There is
  no standing override; an override, if ever granted, is recorded on the
  affected verification record with who granted it and why.

If in doubt whether something is verified, treat it as unverified.
