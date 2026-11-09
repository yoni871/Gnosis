# Backend advisory remediation

Stacked on #76. The four advisory records were propagated from two underlying
issues in glob and minimatch (migration/dev tooling). Current parent releases
still constrain affected majors. The parent APIs remain node-pg-migrate 8.0.4 and
nodemon 3.1.14; reviewed overrides select glob 14.0.4 and minimatch 11.0.5.
No blind audit downgrade or database/schema change is included.

A clean npm ci and registry advisory scan report zero backend vulnerabilities.
The cross-project audit gate reports zero vulnerabilities needing exceptions in
backend, frontend and importer. All temporary backend exceptions are removed.
Tests exercise nodemon extension/exclusion matching and the patched glob
PathScurry/discovery contract. Full migration/CLI and application tests must pass
on disposable PostgreSQL 14 and 18 before approval; final results are in the PR.

Remove overrides when parent dependencies permit the patched majors. Weekly
scans/Dependabot remain enabled; a future or recurring moderate advisory fails
CI, including the previously excepted advisory URLs.
