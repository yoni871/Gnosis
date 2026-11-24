# Shared registries

Reusable author and work identifiers for all Trace the Doctrine research.
Every doctrine references these registries by id; no author or work is
ever duplicated inline in a doctrine file.

## ID scheme

- **Author ids** are lowercase kebab-case slugs of the author's name:
  `justin-martyr`, `irenaeus`, `tertullian`, `athanasius`, `augustine`.
- **Work ids** are the author slug + a short work slug:
  `justin-martyr-first-apology`, `augustine-on-the-trinity`.
- Ids are stable: once an id is referenced by a research file, it is never
  renamed. If an attribution turns out to be wrong, the record is
  corrected and the dispute flagged — the id is not silently reused for a
  different author or work.

## What a stub asserts — nothing

`authors.json` currently contains **stubs** for the five figures already
named in the frontend preview. A stub carries only three fields:

- `id` — the slug,
- `displayName` — the name as it appears in the preview,
- `status` — `"not-started"`.

A stub asserts **no** dates, **no** works, **no** quotations, and **no**
passage links. Any of those must be researched, verified, and recorded
under the standards (`RESEARCH-STANDARDS.md` §5) before they appear here.

## How to add an author or work

1. Add the entry to the registry first, as a stub.
2. Research it using the matching template (`templates/author.template.md`
   / `templates/work.template.md`) and schema (`schemas/author.schema.json`
   / `schemas/work.schema.json`).
3. Reference it by id from doctrine files only once its fields are
   verified. Until then, doctrine files mark the reference pending in
   their `notes`.
