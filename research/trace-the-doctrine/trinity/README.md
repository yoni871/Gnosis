# Trinity — research

**No verified Trinity research exists yet. This PR is standards +
scaffolding only.**

## Contents

- `passages.json` — skeleton listing the four passage ids already known
  from the frontend preview (`gen-1-26`, `john-1-1`, `matt-28-19`,
  `2cor-13-14`). Every entry has status `not-started` and all research
  fields null or empty. No evidence classification, no explanation, and
  no passage-to-author link is asserted. The book / chapter / verse and
  canonical order recorded here are the passage references themselves
  (the same ids the frontend already uses), not research findings.
- `milestones.json` — empty array. No milestone has been researched or
  verified.
- `verification-records.json` — empty array. No claim has been checked;
  no result has been recorded.
- `verification-record.template.json` — a blank template record (all
  fields null) showing the shape of a verification record. It is a
  template, not a checked claim: it asserts no result and must never be
  treated as evidence that anything was verified.

## Candidates to verify (not verified entries)

The following are **candidates for Phase 2 research**, named here only so
researchers know where to start. Naming them here creates no milestone
entry and asserts nothing about them — each must be researched, dated,
and verified from primary sources before it appears in `milestones.json`:

- The Council of Nicaea
- The Council of Constantinople

No other milestone, passage, author, or work is asserted anywhere in
this directory.

## Next step

Phase 2 research begins from these skeletons using the templates in
`../templates/` and the standards in `../RESEARCH-STANDARDS.md`. The
frontend preview's demonstration data must not be copied here; anything
it points at is re-verified from a primary source from scratch.
