# Author template — `shared/authors.json` entry

Copy this template for each author. Schema: `schemas/author.schema.json`.
Standards: `RESEARCH-STANDARDS.md` §5 (dates and attribution), §9
(lifecycle).

```json
{
  "id": null,
  "displayName": null,
  "dates": {
    "earliest": null,
    "latest": null,
    "certainty": "unknown",
    "note": null
  },
  "bio": null,
  "verificationRecordIds": [],
  "notes": null,
  "status": "not-started"
}
```

Checklist before marking anything above `not-started`:

- `id` is a lowercase kebab-case slug, e.g. `justin-martyr`.
- Life dates in `dates` are the author's dates only. They are **not**
  work dates and must never be used as a work date (§5.1).
- `bio` is null until verified. A stub entry carries only `id`,
  `displayName`, and `status: "not-started"` — see `shared/README.md`.
