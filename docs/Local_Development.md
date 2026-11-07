# Complete local development mirror

After this PR is merged, the everyday workflow from the repository root is:

```sh
git switch main
git pull origin main
npm run local:update
```

While reviewing PR #61, run the same command on `fix/local-development`.
Open **http://localhost:5173**. Verification emails appear only in the local
Mailpit inbox at **http://127.0.0.1:8025**. No Vercel CLI, account or deployment
is needed. Do not merge a PR merely to obtain a preview.

## Prerequisites and commands

Install Node 22.x, npm, Git and Docker Desktop with Compose v2. Start Docker
Desktop once; on macOS the updater opens it if its engine is stopped. Ports
5000, 5173, 55432 and 8025 must be free. macOS AirPlay Receiver can occupy 5000;
disable that receiver if necessary. Xcode Command Line Tools may be needed if npm cannot use a prebuilt native bcrypt
package. First setup needs internet for locked npm
packages, container images and the public STEPBible source files. Later runs
reuse images and downloaded Original Language files, but npm may need network
access if a dependency is not cached.

`npm run local:update` performs these steps and stops on failures:

1. Installs lockfile-pinned dependencies in backend, frontend and the offline
   Bible workbook tool on first run or when locks, package manifests, Node or
   platform change. Otherwise verifies the installed dependency graph with npm.
   Missing/invalid packages trigger reinstall. Checks Node's major version.
2. Generates private backend/.env.local only if absent. Existing passwords,
   secrets and database settings are preserved. Upgrades PR #61's old
   EMAIL_DELIVERY=disabled reader-only default to Mailpit, without changing keys.
3. Starts the dedicated Compose PostgreSQL 14 service and Mailpit, waiting for
   their health checks. Remote Docker contexts/endpoints are rejected; only a
   local Unix-socket engine is permitted. It never resets or deletes the PostgreSQL volume.
4. Stops only dev-server processes previously started by this workflow, applies
   official pending migrations with the explicit local target and verifies schema
   drift. It compares the server's PostgreSQL system identifier with the Compose
   container before making changes.
5. Synchronizes the four repository workbooks, all 26 licensed commentary
   collections and latest main's Original Language scope. Source hashes and row
   counts detect missing/changed content; unchanged datasets are skipped.
6. Starts backend and Vite as managed background processes. Checks the catalog,
   reader, search, Original Language details/pagination and anonymous auth guards
   through the real Vite proxy using the restricted runtime database role.
7. In Mailpit mode, verifies a dedicated local smoke account through real email
   verification, login, refresh rotation, Origin rejection, private-data reads/
   writes and logout. On subsequent runs, it checks that the account's saved IDs,
   highlights, notes, bookmarks and reading position have survived the update.

The first full content import is substantial; let it finish before running the
heavy browser/database test suites, which caused resource timeouts when run
concurrently on this Mac. Progress names every
completed collection. Subsequent unchanged updates skip content writes. A failed
collection rolls back; rerunning resumes safely. No command fetches from Git,
changes branches or merges automatically: pulling main remains your explicit step.

```sh
npm run local:check  # read-only catalog/API checks
npm run local:test   # local Mailpit auth/private-data persistence checks
npm run local:stop   # stop managed frontend/backend, keep the database
npm run local:start  # start managed frontend/backend using existing prepared data
```

Logs and PID records live in ignored `.local/`. The generated smoke account's
credentials and expected private records are stored in `.local/verification-account.json`
with mode 0600. They are never printed. This account is isolated local test data,
not a production account; the updater never seeds a verified user or bypasses
verification. The inbox contains sensitive local verification links: keep it
loopback-only and do not publish its messages or screenshots.

For foreground source watching in separate terminals, stop managed servers first:

```sh
npm run local:stop
npm run dev --prefix backend
# Another terminal:
npm run dev --prefix frontend
```

Managed servers restart on local:update. Foreground `npm run dev` uses nodemon
and Vite's normal source watching. Stop manually started servers before updating;
the updater never kills unrelated processes occupying their ports.

Stop database/inbox without deleting data:

```sh
docker compose --env-file backend/.env.local -f compose.local.yaml stop
```

Do not run `down --volumes` unless you intentionally want to delete local data.
Do not overwrite .env.local: its PostgreSQL credentials must stay with its volume.

## Expected catalog and parity with main

| Feature/data | Local expectation | Difference from a deployed environment |
| --- | --- | --- |
| Bible books | 66 | Same repository book metadata |
| BSB | 31,086 verses | Repository workbook, no API |
| KJV | 31,102 verses | Repository workbook; public domain in the US |
| ASV | 31,086 verses | Repository workbook, no API |
| WEB | 31,103 verses | Previously omitted by PR #61; now imported |
| ESV, NIV, NLT, NKJV, NASB | Five supported provider records | Listed only when their development keys/IDs are configured and enabled, exactly as main |
| Commentaries | 26 collections, 323,113 unique entries | All canonical `*-restructured` collections; their repository coverage varies by author |
| Original Language | main's Phase 1: Genesis 1 and Philippians 3 | Downloads its own public STEPBible files; no production export; unsupported passages retain main's coverage message |
| Search | Bible full-text search and top-100 commentary matches | Main has no general search-page pagination; Original Language occurrence API supports limit/offset and is verified |
| Authentication | Real verification/login, 15-minute access token, rotating refresh, revocation/logout | Mailpit captures email locally instead of external delivery |
| Private reader state | Highlights, bookmarks, notes, reading progress | Local accounts and data only; no production users copied |

PR #61 originally seeded only BSB/KJV/ASV and Wesley. It also predated the latest
Original Language merge, whose schema alone does not populate data. These were
setup/catalog omissions, not removed reader features. Main's Hebrew download URL
also used `CC-BY` where the actual upstream filename uses `CC BY`, causing a
404; the download URL is corrected in this fix. All reader routes, UI,
search and authentication now run the actual latest-main implementation.

The 26 collections are Augustine, Barnes, Bengel, Benson, Bullinger, Burkitt,
Calvin, Chrysostom, Clarke, Darby Translation Notes, Ellicott, Expositor, Geneva,
Gill, Haydock, Jamieson-Fausset-Brown, Keil and Delitzsch, Maclaren, Matthew Henry,
Meyer, Poole, Pulpit, Spurgeon, Tyndale, Vincent and Wesley. `jfb-json` is an
alternate source representation, not a second commentary collection. The local
catalog manifest explicitly lists approved collections; a new folder requires
license metadata before automatic import, preventing silent unknown imports.

Historical collections use the repository's historical public-domain editions.
Tyndale Open Study Notes are **CC BY-SA 4.0**, © 2022 Tyndale House Publishers;
conversion into repository structured JSON is identified as an adaptation.
Attribution, original-source link and license are stored with its source and
returned by the normal commentary API. See the publisher's
[Open Resources](https://tyndaleopenresources.com/) and
[STEPBible attribution](https://www.stepbible.org/version.jsp?version=TNotes).
This does not grant permission for unrelated Tyndale copyrighted study products.

Original Language uses main's existing STEPBible importer and inclusion rules.
Files remain gitignored and carry their source attribution; only short lexicon
glosses are imported, never the restricted fuller definition paragraphs. See
[OriginalLanguage.md](OriginalLanguage.md). Source/importer hashes trigger updates
when local files or importer/scope change. To deliberately refresh cached public
STEPBible files from their official URLs as well:

```sh
npm run local:update -- --refresh-language
```

Files download atomically; an interrupted fetch cannot mark a partial file ready.
The local workflow does not expand the approved Phase 1 scope or invent missing
language data. Upstream data may change between downloads, so exact Original
Language word counts are computed from the downloaded source and checked against
the database, rather than treating production's copy as a source of truth.

## Environment and security

`backend/.env.example` and `frontend/.env.example` list supported settings.
Backend local startup uses **.env.local only**, never the legacy .env.
Keep NODE_ENV=development, FRONTEND_URL=http://localhost:5173, PORT=5000,
TRUST_PROXY=false, DB_HOST=127.0.0.1, DB_PORT=55432, DB_NAME=gnosis_local and
DB_USER=gnosis_reader. Migration settings must point to the same Compose instance
with MIGRATION_DB_USER=gnosis_local_owner and its separate generated password.
JWT_SECRET and RATE_LIMIT_KEY_SECRET are separately generated random secrets.
DATABASE_URL is forbidden in this profile. Unset conflicting inherited shell
settings rather than pointing this workflow at a remote server or SSH tunnel.
Production/test migration URLs are never used by local:update.

The operator applies migrations/imports only. HTTP runtime has SELECT on reference
and language tables, explicit auth/private-state grants and licensed cache/quota
grants. It has no schema ownership, DDL, role creation or reference-data writes.
Local import tracking lives in the separate `gnosis_local_dev` schema, invisible
to the runtime role and outside public-schema migration drift comparisons.
A prepare-wide advisory lock serializes imports. Transactions, stable natural keys
and in-place upserts preserve reference IDs and all existing private data.
No user/private tables are truncated, reseeded or deleted by updates. Removed
source rows are retained conservatively; the exact-count check reports unexpected
extras instead of deleting possibly referenced data silently.

Local Mailpit requires no Resend key. To test real delivery instead, privately set
EMAIL_DELIVERY=resend, RESEND_API_KEY and valid EMAIL_FROM in .env.local, keeping
the localhost frontend origin. The automated inbox/account smoke check is skipped
in real-delivery mode to avoid sending test messages externally. Use main's normal
verification flow manually; all isolated auth integration tests still run without
real email. A direct `npm run dev` with EMAIL_DELIVERY=disabled retains the
reader-only option; local:update upgrades that legacy default to the full inbox.

For development licensed providers, privately set only the authorized keys/IDs:

| Translation | Environment variables |
| --- | --- |
| ESV | ESV_API_KEY |
| NIV | API_BIBLE_KEY, API_BIBLE_NIV_ID |
| NKJV | API_BIBLE_KEY, API_BIBLE_NKJV_ID |
| NASB | API_BIBLE_KEY; optional API_BIBLE_NASB_ID override |
| NLT | NLT_API_KEY |

`local:check` reports each unavailable provider explicitly. Configured means keys
are present, not that provider authorization has been tested. Automated readiness
checks do not spend publisher quota. Manually select the licensed translation to
check the provider when authorized. No licensed API text is bulk imported; main's
cache bounds, attribution, kill switches and quotas remain unchanged. Search uses
stored translations, as on main. See [LicensedTranslations.md](LicensedTranslations.md).

Production still requires HTTPS FRONTEND_URL, valid email configuration, both
secrets and NODE_ENV=production. Mailpit and HTTP exceptions require the explicit
local profile and are rejected in production. Refresh cookies remain HttpOnly,
SameSite=Strict, path-scoped and Secure in production; localhost HTTP omits Secure.
Origin checks, session validation, replay rejection, revocation and rate limits
are unchanged. Use localhost consistently in the browser, not a second origin.
Vite forces development API calls through its local /api proxy even if an old
VITE_API_URL contains a Vercel deployment. No production user data/secrets are read.

## Troubleshooting and tests

- ECONNREFUSED: inspect `.local/backend.log` and database health. The original
  startup failure was missing RATE_LIMIT_KEY_SECRET, not email. For field-only
  diagnostics of the old `.env`, run `cd backend && npm run config:check`.
- Database identity/configuration refusal: use the dedicated Compose settings;
  remove inherited DATABASE_URL/DB_*/MIGRATION_DB_* overrides. Do not redirect to
  another database. If a volume already exists, keep its original .env.local.
- Port conflict: stop foreground dev servers or the specific conflicting local
  service. Do not kill all Node/Docker processes or prune volumes.
- Failed import/download: rerun local:update after resolving the reported stage.
  Committed collections remain; the failed collection rolls back. Internet is
  needed for missing public files. Do not import production dumps to fill gaps.
- Failed account check: verify Mailpit health and EMAIL_DELIVERY=mailpit. Inspect
  the local inbox; no token is printed. Preserve `.local/verification-account.json`
  to retain the smoke account's credentials. Existing unrelated users are untouched.
- Login 403: FRONTEND_URL must match http://localhost:5173 exactly; unverified
  users must finish local email verification. Do not manually mark users verified.
- Stale `.local/update.lock` after a hard kill: check that its recorded PID is no
  longer the updater before deleting only that lock. Never run two updates together.

```sh
npm test --prefix backend
npm test --prefix frontend -- --maxWorkers=2
npm test --prefix tools/bible-import
npm run build:check --prefix frontend
npm run test:database --prefix backend -- 14
npm run test:database --prefix backend -- 18
```

Database suites use separate disposable containers/databases, never gnosis_local.
No command merges main/production or calls Vercel. Existing deploymentEnabled
settings exclude this fix branch, so PR updates do not request preview deployments.
