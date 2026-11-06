# Offline Bible workbook importing

Bible spreadsheet parsing is an independent operator tool in `tools/bible-import`.
It is not an HTTP endpoint or a backend dependency. Node 22 is required. Do not
install this tool in the Vercel backend project or import it from application code.
The previous `backend/src/scripts/importBible.js` entrypoint has been removed;
merely importing any new module never opens a database or performs writes.
The commentary JSON importers are unchanged and do not use SheetJS.

## Validation first

From the repository root:

```sh
npm ci --prefix tools/bible-import --ignore-scripts
npm start --prefix tools/bible-import -- validate ../../backend/src/data/asv.xlsx
```

npm runs the script from the tool directory. Paths are relative to that directory.
Omitting `validate` has the same read-only behavior. Validation uses a child process
with a 15-second timeout, 256 MiB V8 heap, 32 MiB output cap, 16 MiB input limit and
200,000-row limit. It accepts XLSX ZIP input only. These are practical resource
bounds, not an OS sandbox or a guarantee against all archive expansion attacks.
Parse only reviewed, trusted local files; no network workbook fetch is supported.
The child receives an allowlisted environment without database or service secrets.

## Explicit writes

No import is run by CI against application data. The only supported database tests
use generated synthetic databases. Do not use production or Neon credentials to
try this tool, and do not run it against an application database as a test.

An authorized future operator must explicitly provide
`GNOSIS_BIBLE_IMPORT_DATABASE_URL` through a secure environment mechanism and run:

```sh
npm start --prefix tools/bible-import -- write /absolute/path/reviewed.xlsx 4 "Exact existing translation name"
```

The URL must explicitly contain host, port, database, user and password. There is
no fallback to DATABASE_URL, DB_*, PG*, dotenv, application configuration or default
translation. Query-string connection options are rejected. Non-loopback targets
require verified TLS; loopback targets use no TLS. Never put credentials in command
arguments, shell history, screenshots, logs or committed files. No credentials or
raw database errors are printed. A successful operator write is a data change;
reverting this code does not reverse already committed Bible data.

The tool validates the workbook before constructing a pg pool. The supplied
translation ID and exact name must match one existing translation. It never creates
or renames translations. A transaction locks that translation row before checking
whether any verses already exist, serializing concurrent imports of the same
translation. Any existing verses cause the entire import to be skipped, including
partially populated translations. There is no overwrite or resume mode.

All SQL in the transaction uses one checked-out client. Chapters retain their
existing book/chapter upsert and verse inserts remain parameterized. Any error,
including duplicate verses, rolls the transaction back; it returns a failing exit
status and closes the pool. Rollback/cleanup failures do not replace the original
failure. An interrupted connection rolls back its uncommitted transaction.

For a dedicated importer role, required privileges are CONNECT, schema USAGE,
SELECT on bible_books, SELECT/UPDATE on bible_translations (row locking),
SELECT/INSERT/UPDATE on bible_chapters, SELECT/INSERT on bible_verses and USAGE
on the chapter/verse ID sequences. Existing search-vector triggers remain active.
The tool needs no schema ownership, DDL, role creation, migration-history access,
authentication-table access or commentary writes. This document creates no role
and changes no production grants. Runtime application roles must not receive
importer privileges.

## Preserved workbook interpretation and translation discrepancy

The old executable selected `backend/src/data/asv.xlsx` and translation ID 4.
Its workbook header identifies American Standard Version (ASV, 1901). The committed
KJV and BSB workbooks are separate inputs; the BSB workbook is not selected by the
old executable. Statements in docs/SEO.md and the sitemap generator comment that
BSB is the same input as the production importer are inaccurate descriptions of
that executable. This change leaves those files, the sitemap and every workbook
unchanged. A live translation ID/name association cannot be established from the
repository, so the new CLI checks the operator's explicit identity before writing.
Do not silently substitute BSB for ASV or assume ID 4 is correct in another database.

Parsing preserves the first worksheet, skips the first three rows, reads reference
from column B and text from column C with SheetJS's existing default cell-value
behavior. The existing `Book chapter:verse` regex and Psalm -> Psalms mapping remain.
Malformed string references and short rows are skipped; unknown books are counted
and skipped by the writer. Non-string references fail validation before writes
instead of producing an import-time TypeError after possible partial writes.
There is no trimming, Unicode normalization, text rewriting or new positivity rule.
The intentional safety improvements are explicit invocation, early validation,
translation identity checking, transaction/serialization, and nonzero failure exits.

## Dependency provenance

SheetJS 0.20.3 is vendored byte-for-byte from the official HTTPS URL documented at
https://docs.sheetjs.com/docs/getting-started/installation/nodejs/ :

https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

Retrieved November 6, 2026 UTC. Archive size: 2,409,319 bytes. Its internal
package.json reports version 0.20.3 and Apache-2.0; the archive preserves LICENSE.

- SHA-256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`
- npm SHA-512: `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`

These hashes pin the bytes fetched over HTTPS from the documented official source;
they are not a vendor signature or independently published vendor checksum.
The independent lockfile pins this local archive and pg 8.23.0. No moving URL,
unofficial mirror or npm audit fix is used. npm's registry stops at xlsx 0.18.5;
audit silence for a non-registry archive is not proof of safety. Verify the vendor
version against GHSA-4r6h-8v6p-xvw6 (<0.19.3) and GHSA-5pgg-2g8v-p4x9 (<0.20.2),
and review future advisories before accepting new untrusted workbook workflows.

## Tests and CI

```sh
npm ci --prefix backend
npm ci --prefix tools/bible-import --ignore-scripts
npm test --prefix tools/bible-import
npm run test:database --prefix tools/bible-import -- 14
npm run test:database --prefix tools/bible-import -- 18
```

Unit tests generate small synthetic workbooks; no Bible content is copied into
fixtures. Tests cover first-sheet/header handling, Unicode, mapping, malformed
input, exact translation identity, existing-import protection, one-client
transactions, rollback failure, explicit CLI writes, no import-time connections,
backend HTTP startup without SheetJS and the archive/lockfile integrity boundary.

Database tests require Docker. Each invocation starts a disposable container with
no persistent volume, a generated database initialized only by official migrations,
and a restricted synthetic importer role. Tests prove committed persistence across
pools, concurrent-import serialization, duplicate rejection and real rollback of
both verses and newly created chapters. Generated database and role removal is
verified, preserving the primary failure if cleanup also fails. SIGINT/SIGTERM
terminate the child before cleanup; hard kills or Docker failures can require
manual removal of that invocation's disposable container. Never use global prune.
The runner accepts only PostgreSQL 14/18, not a connection URL. CI reuses its
existing synthetic service container but creates a separate generated database.
The shared backend test manifest and application harness are unchanged.

GitHub CI adds an isolated importer job and importer database checks on both
PostgreSQL majors, retaining all backend/frontend/build/migration/application checks.
Backend production installs no longer install xlsx or its orphan dependency tree.

## Production packaging verification

The backend package and lockfile contain no SheetJS dependency, and no HTTP source
imports the offline tool. A production-only backend install plus the HTTP startup
regression verifies this boundary. For a materialized Vercel function artifact:

```sh
npm run check:artifact --prefix tools/bible-import -- /absolute/path/.vercel/output/functions/index.func
```

A local synthetic build using official `@vercel/node@30.0.0` and
`@vercel/build-utils@15.3.0` was materialized and passed this guard (230 files). It
used a temporary backend copy, existing locked dependencies, disabled installation,
and synthetic configuration, without a Vercel project link or deployment. This
proves exclusion for that build, not a remotely inspected production archive.

Check every function directory from a synthetic build, with synthetic configuration
only. Never pull production environment variables or link this verification to a
production project. The guard checks files, followed symlinks and executable source
references; a source/dependency check alone does not prove a deployed archive's
contents. Vercel project settings are not versioned here, so verification of an
existing deployed archive must not be inferred from these repository checks.

## Rollback

Reverting this change restores code/dependency layout only; no migration or database
rollback is needed. It would also restore the vulnerable parser and unsafe old
entrypoint, so prefer disabling the offline tool if a regression is discovered.
Do not reverse successful imports or remove verses automatically.
