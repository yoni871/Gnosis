# Temporary exception: GHSA-fc5q-39xc-vjpf (picomatch ReDoS)

**Status:** Temporary, owner-authorized. **Expires 2026-12-15.** Do not extend
without Yonatan's new decision.

## The advisory

GHSA-fc5q-39xc-vjpf / CVE-2026-112366 (HIGH): picomatch ReDoS through
single-branch repeated extglobs (patterns like `+(*)` or `+(*a)`).
`analyzeRepeatedExtglob` in `lib/parse.js` skips them, causing exponential
backtracking against short crafted strings and blocking the Node event loop.

**No patched picomatch version exists.** picomatch 2.3.2 / 3.0.2 / 4.0.7 are
the latest releases in each line; the advisory lists no first patched version;
no fix is merged upstream (latest release 4.0.7, 2026-08-24; verified
2026-11-17). No version bump — of picomatch, vite, or vitest — can resolve
it, because every picomatch version is in the vulnerable range (<= 4.0.7).

## Scope (exactly these 11 packages)

| Scope | Packages |
| --- | --- |
| backend (picomatch 2.3.2) | anymatch, chokidar, nodemon, picomatch, readdirp |
| frontend (picomatch 4.0.7) | @vitejs/plugin-react, fdir, picomatch, tinyglobby, vite, vitest |

`tools/bible-import` has no picomatch in its tree and is unaffected. The
exception covers this advisory only, in these packages only, in these scopes
only.

## Justification

Picomatch is dev/build-time only in both scopes, and the ReDoS is not
reachable in Gnosis's deployment:

- Backend: picomatch is reachable only through nodemon's file watcher
  (`nodemon -> chokidar -> anymatch/readdirp -> picomatch`). nodemon is the
  only devDependency; production starts with `node src/server.js`. The
  production dependency closure (computed from `backend/package-lock.json`,
  following `dependencies` + `optionalDependencies` edges only) contains
  none of the 5 packages.
- Frontend: picomatch is reachable only through vite/vitest (build and dev
  server). vite, vitest and @vitejs/plugin-react are devDependencies. The
  production dependency closure (computed from `frontend/package-lock.json`
  the same way) contains none of the 6 packages.
- No Gnosis source imports picomatch (or any of the other 10 packages) at
  runtime. The only globs in the repo are 7 static `import.meta.glob`
  literals in `frontend/src/services/historyService.js`, resolved by Vite at
  build time; no attacker-controlled input reaches a glob pattern.
- No file-upload handling exists in the backend, frontend, or tools
  (no multer/busboy/formidable).
- vite 8.3.7 and vitest 5.1.0 have no advisory of their own; they are
  flagged only through picomatch.

## Owner and authorization

Authorized by Yonatan (owner) on 2026-11-17 as a narrow, explicit policy
decision for this advisory only, subject to independent security QA. The
research report's position was that a high-severity exception requires an
explicit owner policy decision; this is that decision. The merge decision
stays with the Engineering Manager + independent security QA under the
existing authorization.

## How the gate enforces the limits (fail-closed)

The normal rule still applies: high/critical advisories are never
exceptable. `scripts/security/audit.cjs` `evaluate()` permits high severity
**only** when the advisory URL is exactly
`https://github.com/advisories/GHSA-fc5q-39xc-vjpf` (hardcoded constant
`TEMPORARY_HIGH_SEVERITY_ADVISORY`; do not generalize it). Every other
high/critical advisory is refused even with a matching exception entry.

The exception fails closed on all four conditions:

1. **Expiration** — `exceptions.json` entries carry `expires: "2026-12-15"`;
   the existing `item.expires >= today` check refuses them from 2026-12-16.
   Covered by `audit.test.cjs` ("fails closed after expiry", including the
   inclusive 2026-12-15 boundary).
2. **Changed dependency path** — exception matching is per (scope, package).
   If a new package appears in the advisory chain with no entry, it fails.
   Covered by the "changed dependency path" test.
3. **Additional advisory** — `advisories.every(...)` requires every advisory
   on a package to be covered; a second advisory on the same package (with
   no entry, or high and not GHSA-fc5q) fails the package. Covered by the
   "second advisory" test and the "different high-severity advisory" test.
4. **Production exposure** — the new `productionExposure()` /
   `runtimeImports()` checks in `audit.cjs` run before the advisory scan on
   every CI run and fail the gate if any of the 11 packages becomes
   reachable from a production dependency or is imported by runtime source:
   - The lockfile check walks the production closure from the root
     `dependencies`, following only `dependencies` + `optionalDependencies`
     edges (never `devDependencies` or `peerDependencies`). Lockfile
     `dev: true` flags are NOT used: the frontend lockfile carries no
     `dev: true` flag on picomatch, because vite is reachable as a peer of
     the production dependency @tailwindcss/vite — a peer edge is a build
     tool, not shipped code, so peer edges are excluded.
   - The source check scans `backend/src` and `frontend/src` for static
     imports/requires of the 11 packages. Test files (`*.test.*`,
     `*.spec.*`, `test/` and `__tests__/` directories) are excluded: they
     run under the test runner and are never bundled, so importing vitest
     there is ordinary dev usage. A malformed lockfile throws instead of
     passing vacuously.

## Visibility

The advisory is NOT hidden. `audit.cjs` logs every accepted exception in CI
output with scope, package, advisory URL, and expiry
(`Accepted temporary exception: <scope>/<package> <advisory> (expires <date>)`),
and the run summary still reports the count of temporary exceptions.

## Removal procedure

When a patched picomatch version lands (see the picomatch patch watch):

1. Bump picomatch in both lockfiles (one line per lockfile: backend 2.3.2
   line, frontend 4.0.7 line) to the patched version.
2. Delete the 11 GHSA-fc5q entries from `scripts/security/exceptions.json`.
3. Delete the hardcoded `TEMPORARY_HIGH_SEVERITY_ADVISORY` allowance in
   `scripts/security/audit.cjs` (restore the plain
   `rank[advisory.severity] <= rank.moderate` rule) and remove the
   GHSA-fc5q-specific tests; keep the production-exposure check and its
   tests (it is a permanent guard).
4. Verify `node scripts/security/audit.cjs` exits 0 with 0 temporary
   exceptions, run the full suite + build, and open the remediation PR
   targeting main (no merge — independent security QA, then the EM merges).
5. Do all of this in the same remediation process; do not leave the
   exception in place after the patch lands.

If no patch lands by 2026-12-15, the exception expires and the gate fails
closed. A new decision from Yonatan is required before any extension.

## Notes

- The four stale #193 exception entries (glob, minimatch, node-pg-migrate,
  nodemon — GHSA-g3hv-75wg-m249 / GHSA-3g3m-2fjr-6pw4, expiring 2026-11-23)
  were deliberately left untouched: the advisories they covered are
  resolved, but `audit.test.cjs` hard-codes GHSA-g3hv expectations against
  them. Any cleanup must update the test in the same change.
- Local `node scripts/security/audit.cjs` fails closed on this VM because
  the npm audit POST to registry.npmjs.org is blocked by runtime policy
  (403 `policy_denied`); use the yarnpkg registry mirror
  (`npm_config_registry=https://registry.yarnpkg.com`) for local audit
  verification. CI is the authority for the live gate result.
