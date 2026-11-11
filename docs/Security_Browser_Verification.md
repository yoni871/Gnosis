# Isolated browser and proxy policy verification

Five Playwright/Chromium tests exercise the source CSP and headers
on the built application, using fresh browser contexts and ephemeral loopback
servers. The fixture blocks every external browser request except intercepted
synthetic api.example.invalid responses. It removes database environment settings
before importing any backend helper. It never attaches to an existing browser,
uses a real account, connects to a database, or contacts the preview/soak.
This suite verifies the merged defenses from PR #79 (headers/CSP), #117
(TRUST_PROXY) and #85 (413 body limit) in a real browser; it changes no
production code.

Coverage: public, login/register, recovery and reader routes load self-hosted
scripts under enforced CSP; inline execution and object embedding are denied;
cross-origin framing is rejected (the policy is frame-ancestors 'self' /
SAMEORIGIN, so same-origin framing is allowed by design). API headers use the
actual middleware and trust parser, and no X-Powered-By header is exposed.

All five tests run (no fixme). The two proxy tests verify the protections
as they exist in main, not #72's approach: the spoof test verifies #117's
TRUST_PROXY=1 — the backend trusts exactly one hop and takes the last
X-Forwarded-For entry (the real client IP, appended by the trusted Vercel
edge — simulated in the fixture) as the client IP, ignoring spoofed earlier
entries, while the proxy forwards XFF unchanged (PR #39, so rate limiting
sees the real client IP) and does NOT strip headers. The body-cap test
verifies #85's backend `express.json({ limit: '100kb' })` — the proxy
forwards the oversized body and the backend's parser rejects it with a
controlled 413 before the auth route handler runs. #72's header-stripping
and proxy body cap were NOT adopted: stripping would hide the real client
IP from rate limiting, and the protections already exist in main (#117
trust, #85 body cap). The fixture's mock backend uses trust proxy '1'
(matching production) and enforces the same 100 KiB body cap as the real
backend, so both tests verify the real protections. The five tests verify
the merged #79/#85/#117 defenses.

```
npm run test:security-browser --prefix frontend
```

CI installs its own Chromium. Local runs can select an installed executable with
GNOSIS_SECURITY_BROWSER; Playwright still creates its own temporary profile.
CSP bypass is explicitly false. There is one worker and no automatic retries.
Test artifacts are ignored. CI also runs the full backend/frontend/PostgreSQL
matrix; this workflow does not deploy or change hosted configuration.

All five local tests pass. These checks prove browser enforcement and HTTP
behavior of the source configuration in the fixture, not deployed Vercel routing
or trust topology. Approved preview validation remains required after the soak.
The reviewed inline-style and HTTPS-connect CSP exceptions in the merged
headers (PR #79) remain visible; no unsafe-inline/eval script permission
was introduced.

Reference: [Playwright configuration](https://playwright.dev/docs/test-configuration).
