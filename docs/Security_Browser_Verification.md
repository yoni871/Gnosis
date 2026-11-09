# Isolated browser and proxy policy verification

Stacked on #72. Five Playwright/Chromium tests exercise the source CSP and headers
on the built application, using fresh browser contexts and ephemeral loopback
servers. The fixture blocks every external browser request except intercepted
synthetic api.example.invalid responses. It removes database environment settings
before importing any backend helper. It never attaches to an existing browser,
uses a real account, connects to a database, or contacts the preview/soak.

Coverage: public, login/register, recovery and reader routes load self-hosted
scripts under enforced CSP; inline execution and object embedding are denied;
even same-origin framing is rejected; the real frontend proxy strips spoofed
forwarding/Host values before a known-trusted loopback API; oversized bodies are
rejected before any upstream request. API headers use the actual middleware and
trust parser, and no X-Powered-By header is exposed.

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
The reviewed inline-style and HTTPS-connect CSP exceptions in #72 remain visible;
no unsafe-inline/eval script permission was introduced.

Reference: [Playwright configuration](https://playwright.dev/docs/test-configuration).
