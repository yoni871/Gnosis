# Theme, search, and profile UI validation — November 6, 2026

## Changes and causes

The theme provider initialized to `light` on every mount and never persisted a selection. It now initializes from `gnosis-theme` in localStorage and persists both choices. A blocking, same-origin `public/theme-init.js` runs in the HTML head before styles and application modules, applying the same validated light/dark preference before paint. Missing, invalid, or unavailable storage falls back to the existing light default. The provider stays above routing and authentication; logout removes the auth token without touching the theme.

Search previously awaited `Promise.all` for Scripture and commentary, so slow commentary hid already available Scripture and either endpoint failing discarded both results. Panels now resolve and fail independently. Navigation aborts obsolete fetches, and late responses are ignored even if the transport completes after abort. A keyed result component resets filters/loading on query or translation changes without effect-driven reset renders; the book catalog stays outside that key and is fetched once per results-page mount.

Successful public searches are cached in memory for 60 seconds, capped at 20 query/translation/endpoint keys. Failures and aborted responses are not cached. Repeated submissions of the same URL do not rerun the search effect. The input is explicitly submitted, so adding a debounce would only delay submission. No extra dependency or infrastructure was added to the app.

Bookmarks was removed from both desktop and mobile profile menus. Neither contained a Highlights item. Profile, Settings, Notes, account details, and Sign out remain. Closed desktop options are hidden from keyboard traversal; Escape restores focus to the relevant trigger in both menus. Existing Profile and Settings buttons were placeholders without routes; their behavior is preserved. Reader bookmark/highlight controls, APIs, and stored data are untouched.

## Search investigation and measurements

Inspected both backend endpoints, frontend search components/services, schema/index definitions, and PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plans. Both search vectors already have GIN indexes. PostgreSQL chooses sequential scans for common terms on this small fixture, where many entries match; the stop-word query uses the existing GIN bitmap scan, while the uncommon no-match query uses a sequential scan on this fixture. No evidence justified another index or a migration.

The original commentary plan already performs a top-N sort and generates headlines for only the 100 returned entries. For `faith`, the baseline plan spent about 185 ms through sorting and 1,966 ms overall; headline generation over long commentary text dominates that example. Limiting headline generation to the top 100 again would not improve it. Ranking, SQL, response fields, search semantics, and result limits are unchanged. This implementation improves repeat-query latency and time to usable Scripture, rather than claiming faster cold SQL.

Measured PostgreSQL 14 on an isolated local cluster (127.0.0.1:55439), using the baseline migration and 4,900 Matthew Henry entries from repository JSON. All fixture DDL/data was enclosed in a transaction and rolled back. No application .env or production database settings were read. The benchmark exercises the actual frontend service against a loopback HTTP wrapper around the existing commentary SQL. Each cached response is deep-compared to its uncached result. Before means an uncached HTTP request; after means a repeat within the one-minute cache lifetime. These are local measurements under concurrent validation load, not production latency or cold-query improvement claims.

| Query | Before: uncached HTTP | After: cached service | Rows |
| --- | ---: | ---: | ---: |
| `a` | 247.19 ms | 0.023 ms | 0 |
| `faith` | 1576.93 ms | 0.301 ms | 100 |
| `the love of God` | 2154.65 ms | 0.028 ms | 100 |
| `God so loved the world` | 2461.76 ms | 0.032 ms | 100 |
| `John 3:16` | 1629.43 ms | 0.121 ms | 100 |
| `zzzxnomatch` | 145.27 ms | 0.023 ms | 0 |

Largest measured improvement: avoiding a repeated database request and headline computation. First-time commentary query latency is unchanged. Scripture now becomes interactive independently of that query; automated tests and browser observation confirm it renders while commentary is still pending.

`a` is an English stop word and returns no matches under existing full-text semantics. Multiword and reference-shaped queries above are passed unchanged to `plainto_tsquery`; phrases are not exact-phrase operators, and `John 3:16` is not parsed into a passage lookup by either original endpoint. These behaviors were preserved rather than silently changing accuracy/ranking. Full-corpus and hosted-network measurements remain future work.

Reproduce on a newly initialized disposable cluster, never an existing application database:

```sh
/usr/local/opt/postgresql@14/bin/initdb -D /tmp/gnosis-search-pg -A trust -U gnosis_test
/usr/local/opt/postgresql@14/bin/pg_ctl -D /tmp/gnosis-search-pg -l /tmp/gnosis-search-pg.log -o '-h 127.0.0.1 -p 55439 -k /tmp' start
node backend/scripts/benchmark-search.js > /tmp/gnosis-search-results.json
/usr/local/opt/postgresql@14/bin/pg_ctl -D /tmp/gnosis-search-pg stop
```

The script emits complete plans, four SQL timings per query, HTTP timings, and cache timings. It uses installed backend dependencies and an explicit local test role/port, never application connection settings.

## Validation

- Frontend full suite: 34 files / 258 tests passed. After the final mobile change, the affected mobile/desktop profile and search tests passed (4 tests, including the new mobile case).
- Backend suite: 161 passed. An initial sandboxed run failed because local HTTP listeners were forbidden; rerunning with local listener permission passed without code changes.
- Frontend production build passed after all application changes.
- ESLint on every changed frontend JS/JSX file passed. Full-project lint still reports 22 errors and 2 warnings, all in unchanged files (reader floating refs, unused variables, auth/study effects, and an existing test render side effect). No rules were disabled.
- PostgreSQL benchmark executed original parameterized queries, checked zero/matching/short/multiword/reference inputs, collected execution plans, and verified cached versus uncached result equality. No SQL/index changes were made, so no database migration was needed.
- Real WebKit production-build checks passed at 1440×1000 and 390×844: dropdown actions and viewport fit, Escape focus restoration, stored dark applied before React without a light mutation, refresh, landing/About navigation, closing/reopening a persistent browser profile, logout/login, and switching to light followed by refresh. Browser API calls used mocked fixtures and a synthetic account; this was not live authentication testing.
- Existing reader regression tests passed as part of the frontend/backend suites. Browser checks entered the reader after synthetic login; full live bookmark/highlight editing was not exercised.
- No production deployment or production database changes.

## Modified files

- `frontend/index.html`, `frontend/public/theme-init.js`, `frontend/src/context/ThemeContext.jsx`: persistence and pre-paint initialization.
- `frontend/src/services/searchService.js`, `frontend/src/pages/SearchResultsPage.jsx`: cancellation, bounded caching, independent panels, loading and errors.
- `frontend/src/components/Header/ProfileMenu.jsx`, `frontend/src/components/Header/MobileMenu.jsx`: compact menus and keyboard behavior.
- Regression tests beside ThemeContext, searchService, SearchResultsPage, and ProfileMenu.
- `backend/scripts/benchmark-search.js`: disposable measurement and result-equality harness; no runtime backend change.
- This report.
