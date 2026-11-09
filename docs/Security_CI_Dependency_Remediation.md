# CI and dependency security remediation

Audit F05/F07 scope. Review-only source changes, no deployment, infrastructure,
branch-rule updates or migration-tool dependency changes.

- CI runs for PRs/pushes targeting both main and production, on Node 22.23.4,
  the October 2026 security release. Hosted runtime patch levels remain unverified.
- A weekly/PR dependency gate scans backend, frontend and offline-importer
  lockfiles. It fails closed on registry/parse errors, unrecognized severity,
  and new moderate-or-higher findings. Regression tests prove exception scope,
  expiration and rejection of new/high advisories.
- Four pre-existing backend advisory records remain temporarily tracked through
  November 23, 2026, limited to two exact advisory URLs and moderate severity.
  This deadline is a tracking mechanism, not production risk acceptance. The
  migration/nodemon toolchain must be fixed with Muse 1 before that date or the
  gate fails. No blind downgrade or migration-tool major override was applied.
- Frontend Vite/ESLint and affected transitive packages are patched; the lockfile
  is re-audited after a clean isolated install. A frontend-only minimatch 11
  override repairs ESLint/config-array's still-vulnerable major constraint.
  Lint/build/tests validate compatibility; remove this override once upstream
  constraints include a patched major. No backend lockfile is changed.
- CodeQL uses the official v4 action pinned to an immutable upstream commit,
  JavaScript security-extended queries, no-build mode, and narrowly scoped
  security-events upload permission. Checkout credentials are not persisted.
- Dependabot opens weekly npm and action-update PRs for all three package roots.

Existing branch protections, required checks/review policy, GitHub secret-
scanning enablement, CodeQL service availability, and release/promotion settings
must be verified by an authorized repository operator. Merely adding a workflow
cannot establish that those controls are enabled or required. No workflow deploys.

The baseline lint command reports 21 errors and 3 warnings in existing frontend
source. It is not added as a new failing gate; new dependency diagnostics are
compared against that baseline. Full lint cleanup is separate work.

References: [Node 22.23.4 security release](https://nodejs.org/en/blog/release/v22.23.4),
[official CodeQL action](https://github.com/github/codeql-action).
