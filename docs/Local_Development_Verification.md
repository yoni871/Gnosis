# Local mirror verification — November 7, 2026

Verified on macOS with Node 22.14.0 and Docker Desktop against main commit
`9caf3ca` (including Original Language Analysis #52 and performance work #54).
PR #61 remains the single PR for this work. No production database or production
user data was accessed, and no Vercel build/deployment was invoked.

## Catalog and functional checks

The real isolated Compose PostgreSQL 14 database was provisioned with generated
local credentials and a separate restricted runtime role. `npm run local:update`
was exercised repeatedly. Warm runs verified cached dependencies, skipped unchanged
reference imports, applied/checksummed the approved late index migrations, checked
schema drift and started both managed dev servers.

| Check | Result |
| --- | --- |
| Books | 66; Genesis has 50 chapters |
| BSB | 31,086 verses |
| KJV | 31,102 verses |
| ASV | 31,086 verses |
| WEB | 31,103 verses |
| Commentaries | 26 collections / 323,113 entries; every collection count matches its source |
| Scripture API | Genesis 1 and Revelation 22 for all four stored translations |
| Bible search | Ranked page/limit, exact total, hasMore and disjoint successive pages |
| Commentary search | Successful full-text query against the complete catalog |
| Original Language | 774 words; Genesis 1 / Philippians 3 passages, word details, attribution and disjoint occurrence pages |
| Authentication | Actual registration, Mailpit delivery, token verification, login, refresh rotation, Origin rejection, logout and revoked-token rejection |
| Private data | Highlights, bookmarks, notes and reading position persist across repeated updates with unchanged IDs/content |
| Browser | Headless Chrome: reader, verse selection, Original Language modal, four translation menu, actual search Load More, HttpOnly/Strict cookie storage and browser-driven renewal; no page errors |
| Local API routing | Vite on localhost:5173 proxies to loopback backend:5000; no Vite connection errors |
| Provider permissions | Cache writes/sequence, quotas, expired-IP cleanup and Original Language reads checked using the runtime role |

The authentication smoke account is created via public auth endpoints and verified
with its real local Mailpit token. No verified user is seeded and no auth checks
are bypassed. Its credentials/tokens are not printed; its private state file stays
ignored under `.local/` with mode 0600. Existing unrelated local accounts/data are
not reseeded or deleted. Local services are left running for review.

## Automated suites

Commands were run sequentially after reference import to avoid the resource
contention observed when importing and running heavy suites together.

| Command | Result |
| --- | --- |
| `npm test --prefix backend` | 221 passed |
| `npm test --prefix frontend -- --maxWorkers=2` | 331 passed in 42 files |
| `npm test --prefix tools/bible-import` | 12 passed |
| `npm run build:check --prefix frontend` | Passed; production bundle generated locally |
| `npm run test:database --prefix backend -- 14` | 36 migration + 33 application tests passed |
| `npm run test:database --prefix backend -- 18` | 36 migration + 33 application tests passed |

Both database suites created their own disposable containers/databases, verified
migration and application cleanup, and verified cleanup after an intentional test
failure. They did not use the persistent local application database. The new
prior-main migration test proves the late-index upgrade preserves existing
migration IDs/timestamps and a preexisting user, remains idempotent, passes final
catalog checks, and rejects downgrade/production compatibility use.

## Limits and differences

- ESV, NIV, NLT, NKJV and NASB provider records exist, but no development keys
  were supplied. They are explicitly reported unavailable. Live publisher calls,
  entitlements and quotas were not exercised or consumed. Add authorized development
  credentials privately; no restricted text was bulk imported.
- Original Language coverage matches main's Phase 1, not the full Bible. Only
  short lexicon glosses are imported; restricted fuller definitions are excluded.
- Mailpit replaces external delivery locally. Actual Resend delivery was not tested.
- Local reference IDs need not match a deployed database's IDs. They remain stable
  across updates; parity is checked by names/source datasets without a production
  database export.
- Local public responses use no-store so data imports appear on reload; production
  retains main's public cache headers. Production HTTPS, secure cookies, verification,
  session checks, rate limits and strict migration ordering remain enforced.
- Installation reported existing lockfile audit advisories: backend 4 moderate,
  frontend 4 moderate/4 high; importer 0. No forced dependency upgrades were made.
  No backend/frontend/importer dependency versions were changed by this work;
  the new root package has no dependencies.

See [Local_Development.md](Local_Development.md) for everyday commands, licensing,
configuration, safety guards and troubleshooting.
