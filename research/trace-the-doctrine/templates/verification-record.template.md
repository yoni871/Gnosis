# Verification-record template — `<doctrine>/verification-records.json` entry

Copy this template for **each claim** — one record per claim, not per
file. Schema: `schemas/verification-record.schema.json`. Standards:
`RESEARCH-STANDARDS.md` §7 (verification checklist) and §8 (verification
records).

```json
{
  "id": null,
  "claimId": null,
  "claimText": null,
  "claimType": null,
  "sourcesChecked": [
    {
      "source": null,
      "edition": null,
      "locator": null,
      "dateAccessed": null
    }
  ],
  "checker": null,
  "checkDate": null,
  "result": null,
  "evidenceFound": null,
  "limitations": null,
  "editorialApproval": null,
  "notes": null
}
```

Rules:

- `claimText` states exactly what is claimed — the same words that would
  be published. Verifying a paraphrase does not verify the claim.
- `claimType` is one of `quotation` / `date` / `attribution` /
  `passage-link` / `doctrinal-connection` / `milestone`.
- `sourcesChecked` lists every source actually checked, with edition,
  locator, and date accessed. "Checked" means the checker read the
  relevant part of that source. At least one source is required.
- `result` is one of `verified` / `partially-verified` / `not-verified` /
  `contradicted` / `unable-to-verify`.
- `evidenceFound` gives a verbatim excerpt or a precise locator, or the
  literal words `none found`.
- `editorialApproval` stays `null` until the editor approves. A claim is
  publishable **only** when `result` is `verified` **and**
  `editorialApproval` is recorded. Verification is not approval and
  approval is not verification.
- The checker must be independent of the researcher who wrote the record
  being checked.
