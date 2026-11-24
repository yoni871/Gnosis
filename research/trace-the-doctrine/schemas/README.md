# Schemas

JSON Schemas (draft 2020-12) for every Trace the Doctrine record type. Each
schema has an `$id`, a `title`, a `description` pointing at the relevant
section of `../RESEARCH-STANDARDS.md`, `required` fields, and enums for every
closed vocabulary (status lifecycle, evidence classification, claim type,
verification result, date certainty, reproducibility status).

| Schema | Record | Stored in |
|---|---|---|
| `passage.schema.json` | Biblical passage in a doctrine inventory | `<doctrine>/passages.json` |
| `interpretation.schema.json` | Historical writer's interpretation of a passage | `<doctrine>/interpretations.json` (Phase 2+) |
| `milestone.schema.json` | Council / creed / controversy / formulation / publication | `<doctrine>/milestones.json` |
| `work.schema.json` | Bibliography entry (citable work) | `../shared/works.json` |
| `author.schema.json` | Author registry entry | `../shared/authors.json` |
| `verification-record.schema.json` | Verification record, one per claim | `<doctrine>/verification-records.json` |

## Shared vocabularies

These enums are identical in every schema — do not diverge them:

- **Status lifecycle:** `not-started`, `in-research`,
  `verification-pending`, `verified`, `editorially-approved`, `published`
  (see `../RESEARCH-STANDARDS.md` §9).
- **Evidence classification:** `direct`, `indirect`,
  `historically-interpreted` (see §1). `null` until researched.
- **Date certainty:** `exact`, `approximate`, `range`, `unknown` (see §5).
- **Verification result:** `verified`, `partially-verified`,
  `not-verified`, `contradicted`, `unable-to-verify` (see §8).
- **Claim type:** `quotation`, `date`, `attribution`, `passage-link`,
  `doctrinal-connection`, `milestone` (see §8).
- **Reproducibility status:** `public-domain`, `fair-use`,
  `permission-granted`, `not-reproducible` (see §3).

## Conventions

- `id` is always a lowercase kebab-case slug (`^[a-z0-9]+(-[a-z0-9]+)*$`).
  Author ids are bare slugs (`justin-martyr`); work ids are author slug +
  short work slug (`justin-martyr-first-apology`).
- A field is `null` (or an empty array) until verified — never a guess.
- `additionalProperties: false` on every record: do not invent fields.
  If a new field is genuinely needed, change the schema (and its
  template) in a standards PR, not in a research PR.
- The `$id` values use the placeholder host `gnosis.example`; they are
  identifiers for the schema documents, not live URLs. Do not "fix" them
  to a real host without a standards decision.
- Validate data files against these schemas before opening a research PR.
  The schemas describe a single record, while the data files store arrays
  of records — so validate **item-wise**: check each array item against
  its schema (for example, extract items with `jq -c '.[]'` and validate
  each one). Validating a whole file against a schema will fail by design.
  The blank `../trinity/verification-record.template.json` intentionally does
  not validate as an instance (null placeholders, labelled as such).
  (No validator is wired into CI by this PR — that is a deliberate
  Phase 1 scope limit: Phase 1 establishes the schemas and this per-item
  validation convention, and wiring a validator into CI is deferred to a
  later phase.)
