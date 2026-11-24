# Work (bibliography) template — `../shared/works.json` entry

Copy this template for each citable work. Schema:
`../schemas/work.schema.json`. Standards: `../RESEARCH-STANDARDS.md` §3
(quotations), §4 (citations), §5 (dates and attribution).

```json
{
  "id": null,
  "title": null,
  "shortTitle": null,
  "authorIds": [],
  "disputedAuthorship": null,
  "originalLanguage": null,
  "dateWritten": {
    "earliest": null,
    "latest": null,
    "certainty": "unknown",
    "note": null
  },
  "edition": null,
  "editor": null,
  "translator": null,
  "publicationInfo": null,
  "locator": {
    "url": null,
    "printCitation": null
  },
  "publicDomainStatus": null,
  "verificationRecordIds": [],
  "notes": null,
  "status": "not-started"
}
```

Checklist before marking anything above `not-started`:

- `id` is author slug + short work slug, e.g.
  `justin-martyr-first-apology`.
- `title` is the work's title in the edition cited. Do not invent a short
  title and present it as the work's title; `shortTitle` is a labelled
  display convenience.
- `dateWritten` is a writing date with a certainty level — never the
  author's birth/death dates (§5.1).
- Disputed or pseudonymous authorship is flagged in
  `disputedAuthorship` and explained in `notes` (§5.3).
- `locator.url` points at a public-domain source where one exists (CCEL /
  New Advent) **plus** a print citation — a URL alone is not a citation.
