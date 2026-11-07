# Gnosis deployments (Vercel)

## Policy

Gnosis has two Vercel projects on the Hobby plan, both connected to this
repository:

- `gnosis` (frontend, Root Directory `frontend/`)
- `gnosis-api` (backend, Root Directory `backend/`)

The Hobby plan allows **100 deployments per day, rolling, shared by both
projects**. To stay under that limit, automatic deployments are limited to
two branches:

| Branch       | Automatic deployment |
| ------------ | ---------------------- |
| `main`       | Yes — Preview          |
| `production` | Yes — Production       |
| Any other branch (feature/fix/…) | No |

Feature and fix branches do **not** deploy automatically on push. Deploy
them manually only when a live preview is needed (see below). This keeps
day-to-day work under the quota while preserving previews for the PRs that
need them (authentication, sessions, migrations, API changes).

## How it is configured

Each project reads a `vercel.json` from its own Root Directory:

- `frontend/vercel.json` (frontend project)
- `backend/vercel.json` (backend project)

Both contain the same allowlist:

```json
{
  "git": {
    "deploymentEnabled": {
      "main": true,
      "production": true,
      "**": false
    }
  }
}
```

- `"main": true` and `"production": true` keep those branches deploying.
- `"**": false` is the catch-all. In minimatch, `*` does not cross `/`, so
  `"*"` would not match branches like `fix/7-...` or `feature/...`;
  `"**"` matches every branch name. Without the catch-all, unspecified
  branches default to `true` and nothing would change.
- When a branch matches more than one rule and at least one is `true`, it
  deploys — so `main` and `production` still deploy despite the catch-all.

The setting is read from the `vercel.json` in the pushed commit, so a
feature branch only stops auto-deploying once it contains this config.
After this lands on `main`, merge `main` into each active feature branch
to bring the setting in. Until then, pushes to those branches may still
auto-deploy.

Nothing else about the deployment setup changes: the Root Directory
skip (a push that touches only `frontend/` does not deploy the backend,
and vice versa), GitHub Actions CI, and the production branch tracking
(`production` → studygnosis.com) are all unchanged.

## Manually deploying a feature branch (on demand)

Manual deployments **count toward the same 100/day quota** — they do not
bypass it. Only deploy a preview when you need to verify something in the
browser.

### Method 1 — Vercel CLI (works for any branch)

Requires the Vercel CLI and a login (`vercel login`, then select the
`gnosis9` team). Deploy the checked-out branch:

```bash
git checkout <branch>   # e.g. fix/7-secure-session-management
cd frontend && vercel deploy    # frontend preview
cd backend  && vercel deploy    # backend preview
```

Or from the repository root:

```bash
vercel --cwd frontend deploy
vercel --cwd backend  deploy
```

`vercel deploy` (no `--prod`) creates a **preview** deployment using the
project's Preview environment variables and prints its URL. Never use
`vercel deploy --prod` for a feature branch — that would deploy to
production.

### Method 2 — Deploy Hooks (one URL per branch, per project)

A Deploy Hook is a secret URL tied to one project and one branch. Sending
a GET or POST request to it deploys that branch. Created in the Vercel
dashboard: Project → Settings → Git → Deploy Hooks. Hobby allows 5 hooks
per project and 60 hook triggers per hour per project.

```bash
curl -X POST <deploy-hook-url>
```

The hook URL is a secret (anyone with it can trigger a deployment and
spend quota). **Do not commit hook URLs to this repository — it is
public.** The URLs live only in the Vercel dashboard (Settings → Git →
Deploy Hooks). Find the hook by name, copy its URL, and POST to it.

Hooks currently set up (names only — get the URL from the dashboard):

| PR | Branch | Frontend hook | Backend hook |
| -- | ------ | ------------- | ------------ |
| #39 Secure Session Management | `fix/7-secure-session-management` | `preview-fix-7` | `preview-fix-7` |
| #52 Original Language Analysis | `feature/original-language-analysis` | `preview-ola` | `preview-ola` |
| #54 Performance Optimization | `perf/full-site-optimization` | `preview-perf` | `preview-perf` |
| #57 ESV Fix | `fix/esv-single-chapter-books` | `preview-esv` | `preview-esv` |

Verified 2026-11-07: triggering a Deploy Hook creates a preview even
for a branch whose automatic deployments are disabled (tested on the
config branch for this change — the hook produced a completed `gnosis`
preview deployment).

## Production promotion

Unchanged: merge `main` into `production` via a PR, check that PR's
preview, then merge. A push to `production` still deploys to production
automatically (`"production": true`).

## If the quota is hit anyway

Vercel will refuse new deployments with "Deployment rate limited — retry
in 24 hours". The 100/day limit is a rolling 24-hour window, not a
calendar day. Wait for the window to clear, or reduce preview deployments
until then. Upgrading the team to Pro ($20/month) raises the limit to
6,000 deployments/day.
