# Interpretation template — `<doctrine>/interpretations.json` entry

Copy this template for each historical writer's interpretation of a
passage. Schema: `../schemas/interpretation.schema.json`. Standards:
`../RESEARCH-STANDARDS.md` §2 (four-way distinction), §3 (quotations), §4
(citations), §5 (dates and attribution), §6 (disagreement).

```json
{
  "id": null,
  "passageId": null,
  "authorId": null,
  "workId": null,
  "quotation": {
    "text": null,
    "language": null,
    "translation": null,
    "edition": null,
    "location": null,
    "reproducibilityStatus": null,
    "summary": null
  },
  "explanation": null,
  "relationshipToDoctrine": null,
  "historicalContext": null,
  "alternativeReadings": [],
  "citation": null,
  "verificationRecordIds": [],
  "notes": null,
  "status": "not-started"
}
```

Checklist before marking anything above `not-started`:

- `authorId` and `workId` exist in `../shared/authors.json` /
  `../shared/works.json`, or are explicitly marked pending in `notes`.
- The quotation is verbatim from a checked primary source or a named,
  checked edition / translation (§3.1). No paraphrase in quotation marks.
- `quotation` records work + location + edition / translation + language
  + reproducibility status (§3.3). If `reproducibilityStatus` is
  `not-reproducible`, `text` stays `null` and `summary` is used instead.
- The reading is attributed to the writer — "X reads this passage as …"
  — never presented as the text's plain meaning (§2).
- Dates are writing dates with a certainty level; disputed authorship is
  flagged (§5).
- Dissenting readings of the same passage are recorded in
  `alternativeReadings` or their absence is justified (§6).
