# Application/API security remediation

Scope: audit F02, F03, F04, F05 and F12. Changes are review-only source changes;
no deployment, live infrastructure, database, session or authentication-handler
changes are authorized by this work. Each PR targets `main` independently.

## Transport and configuration

- `TRUST_PROXY` defaults to false. Only explicit valid IPs/CIDRs and Express
  named subnets are accepted. Blanket trust, numeric hops, zero-prefix networks,
  malformed addresses and extra slash segments fail startup.
- The same-origin proxy removes incoming forwarding/client-IP headers. Do not
  enable blanket trust to recover client addresses. Until a trusted ingress
  path is verified, auth requests through that proxy share its socket-IP bucket.
  This prevents arbitrary caller buckets but can cause shared-bucket throttling.
- Proxy buffering stops at 100 KiB. Express explicitly limits decoded JSON to
  100 KiB. Oversized/unsupported/malformed bodies and unknown endpoints return
  controlled JSON with no-store, without paths, diagnostics or stacks.
- Non-local app imports (and all production imports), including serverless imports, reject JWT/rate-limit
  secrets shorter than 32 UTF-8 bytes, low-diversity or obvious placeholder
  values, and identical secrets. Generate each independently from at least
  32 random bytes; length/diversity checks cannot prove entropy. Development
  retains compatibility with existing local fixtures. Secret rotation and
  deployment configuration remain operator work coordinated with Muse 3.
- Browser/API responses enforce CSP, deny framing, nosniff and capability limits.
  The preload script is self-hosted; the initial JSON-LD has an exact CSP hash.
  Inline styles remain allowed for React/GSAP. HTTPS connect destinations remain
  allowed because API origins are environment-specific; narrowing this to the
  approved deployment origin is still required. No unsafe-inline/eval scripts.

## Release verification still required

Verify headers on deployed HTML, errors and API routes, actual proxy topology
and ingress overwrites, per-client limiting through the full frontend/backend
chain, reader/licensed-provider flows, and recovery/browser CSP behavior in an
approved preview before production sign-off. Do not infer live fixes from tests.

Source references: [Vercel request-header trust boundary](https://vercel.com/docs/headers/request-headers).
