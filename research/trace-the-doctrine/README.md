# Trace the Doctrine — Research

Research-first workspace for the Gnosis **Trace the Doctrine** feature.
All doctrine research lives here as structured Markdown and JSON in the
repository. Nothing in this directory is published content by itself: files
here become publishable only after independent verification and editorial
approval (see `RESEARCH-STANDARDS.md`).

## Layout

```text
research/trace-the-doctrine/
├── README.md                  # this file
├── RESEARCH-STANDARDS.md      # the binding research standards (read first)
├── schemas/                   # JSON Schemas (draft 2020-12) for every record type
│   ├── README.md
│   ├── passage.schema.json
│   ├── interpretation.schema.json
│   ├── milestone.schema.json
│   ├── work.schema.json
│   ├── author.schema.json
│   └── verification-record.schema.json
├── templates/                 # blank Markdown/JSON templates matching the schemas
│   ├── passage.template.md
│   ├── interpretation.template.md
│   ├── milestone.template.md
│   ├── work.template.md
│   ├── author.template.md
│   └── verification-record.template.md
├── shared/                    # reusable registries (authors, works)
│   ├── README.md
│   ├── authors.json
│   └── works.json
├── tools/                     # structural validation (see Validation below)
│   ├── README.md
│   ├── validate.py
│   ├── canon.json
│   ├── uncited-records.json
│   └── tests/
│       └── test_validate.py
└── trinity/                   # Trinity doctrine research (first doctrine)
    ├── README.md
    ├── passages.json
    ├── milestones.json
    ├── verification-record.template.json
    └── verification-records.json
```

Future doctrines (Incarnation, Salvation, Holy Spirit, Church,
Resurrection) each get their own directory beside `trinity/`, following the
same layout and the same schemas. Nothing doctrine-specific lives in
`shared/` except the registries.

## Validation

Structural checks for everything in this directory live in `tools/`.
They check structure only -- that references resolve, dates are
consistent, quotations carry a usable source location, and publication
state matches verification state. They do not judge whether a quotation
is accurate, a date is right, or a claim is true; that is the work of
Phase 4 verification and independent QA (`RESEARCH-STANDARDS.md` §8-9).

Run from the repo root before opening a PR that touches this directory:

```sh
python3 research/trace-the-doctrine/tools/validate.py
```

Exit 0 with an OK summary when clean; exit 1 with an error list on any
failure. Standard library only, no network access. See `tools/README.md`
for the full list of checks, the canon table, the uncited-record rules,
and the fixture tests (`tools/tests/test_validate.py`).

If the validator fails, fix the data, not the validator. If a check
itself misreads the standards, flag it to the EM instead of weakening
the check in the same change that needs it to pass.

## Status: Trinity

**No verified Trinity research exists yet.** This directory currently
contains standards, schemas, templates, and empty scaffolding only:

- `trinity/passages.json` lists the four passage ids already known from the
  frontend preview, all with status `not-started` and every research field
  null or empty. No classification, explanation, or passage-to-author link
  is asserted.
- `trinity/milestones.json` is an empty array. The Councils of Nicaea and
  Constantinople are named in `trinity/README.md` only as *candidates to
  verify* — not as verified entries.
- `trinity/verification-records.json` is an empty array. No claim has been
  checked; no result has been recorded.
- `shared/authors.json` contains stubs for the five figures already named
  in the frontend preview (Justin Martyr, Irenaeus, Tertullian, Athanasius,
  Augustine). A stub asserts nothing: no dates, no works, no quotations,
  no passage links.

## How Phase 2 / 3 researchers use this

1. Read `RESEARCH-STANDARDS.md` in full before writing anything.
2. Copy the relevant template from `templates/`; never invent a new field
   or rename one without a standards change.
3. Reuse author and work ids from `shared/authors.json` and
   `shared/works.json`. If an author or work is missing, add it to the
   shared registry first (as a stub, then verified), and reference it by
   id everywhere else. Never duplicate an author or work inline.
4. Every claim gets a verification record
   (`schemas/verification-record.schema.json`). A claim is publishable
   only when its record says `result: "verified"` **and** editorial
   approval is recorded.
5. Move records through the status lifecycle only as the standards allow:
   researcher proposes, an independent verifier checks, editorial approval
   is a separate step. See `RESEARCH-STANDARDS.md` §9.

## Demo / placeholder data is NOT research

The frontend preview (`frontend/src/data/doctrineStudies.js` and related
files) contains **demonstration data only**: placeholder interpretations,
null quotations, null titles, null dates. That data is illustrative UI
content. It must never be copied into this directory as if verified, and
no file here may cite the frontend demo as a source. If a demo entry
happens to point at something real, the researcher re-verifies it from a
primary source from scratch and records a verification record for it.

## Rules that apply to every file here

- Never manufacture a quotation or invent a connection between a passage
  and an author.
- Never present a later doctrinal formulation as if it were explicit in
  an earlier text.
- A field is `null` / empty / `not-started` until it is verified — never
  fill a gap with a guess.
- Every published claim must be traceable to verifiable evidence; see
  `RESEARCH-STANDARDS.md` for what counts.
