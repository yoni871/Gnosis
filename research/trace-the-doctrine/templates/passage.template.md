# Passage template — `<doctrine>/passages.json` entry

Copy this template for each passage. Fields marked `null` / `[]` stay that
way until verified. Schema: `schemas/passage.schema.json`.
Standards: `RESEARCH-STANDARDS.md` §1 (evidence classification), §2
(four-way distinction), §5 (dates), §9 (lifecycle).

```json
{
  "id": null,
  "doctrine": "trinity",
  "book": null,
  "chapter": null,
  "verseStart": null,
  "verseEnd": null,
  "canonicalOrder": null,
  "evidenceClassification": null,
  "relationshipToDoctrine": {
    "text": null,
    "status": "not-started"
  },
  "interpretiveQuestions": [],
  "crossReferences": [],
  "verificationRecordIds": [],
  "notes": null,
  "status": "not-started"
}
```

Checklist before marking anything above `not-started`:

- `evidenceClassification` is one of `direct` / `indirect` /
  `historically-interpreted`, justified in `relationshipToDoctrine.text`,
  and consistent with §1. Gen 1:26 is `historically-interpreted`, not
  `direct` — see the worked example in §1.4.
- `relationshipToDoctrine.text` distinguishes what the text states / what
  may be inferred / how historical writers read it / how doctrine was
  later formulated (§2), and labels every inference as an inference.
- Every factual claim has a citation and a verification record.
