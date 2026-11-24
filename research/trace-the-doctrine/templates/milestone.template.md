# Milestone template — `<doctrine>/milestones.json` entry

Copy this template for each council, creed, controversy, formulation, or
publication. Schema: `../schemas/milestone.schema.json`. Standards:
`../RESEARCH-STANDARDS.md` §2 (four-way distinction), §4 (citations), §5
(dates and attribution), §7.3 (milestone checklist).

```json
{
  "id": null,
  "title": null,
  "type": null,
  "date": {
    "earliest": null,
    "latest": null,
    "certainty": "unknown",
    "note": null
  },
  "passageIds": [],
  "authorIds": [],
  "summary": null,
  "citation": null,
  "verificationRecordIds": [],
  "notes": null,
  "status": "not-started"
}
```

Checklist before marking anything above `not-started`:

- `type` is one of `council` / `creed` / `controversy` / `formulation` /
  `publication`.
- The date is a writing/event date with a certainty level (§5); `unknown`
  until verified.
- Every passage and author link is verified — no passage-to-milestone or
  author-to-milestone link asserted without evidence.
- `summary` distinguishes what the milestone did (later formulation) from
  what earlier texts state (§2).
- Naming a council as a *candidate to verify* in a README does not create
  a milestone entry. An entry exists only once research has begun.
