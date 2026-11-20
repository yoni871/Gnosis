// Security response headers (audit F03) and private-response cache
// control (audit F12). Zero-dependency: the header values are set
// explicitly here instead of adding helmet, so the policy is visible in
// one place and identical in the backend and in frontend/vercel.json.
// Keep the two in sync: the test suite asserts the backend policy and
// that its script hash matches frontend/index.html; the vercel.json
// value must be updated with it (it cannot carry a comment).
//
// Layering: the backend sets these headers on every API response. Vercel
// sets the same values on the static responses it serves (the SPA shell
// and assets). The /api/* requests that reach the frontend deployment go
// through the same-origin auth proxy, which forwards upstream headers
// unchanged, so a proxy response can carry the header twice with the
// same value; that is harmless. HSTS is NOT set here: Vercel applies it
// automatically to every deployment, and a second, possibly shorter
// max-age from the app could only weaken it.
//
// CSP mode: ENFORCED (not Report-Only). Evidence, verified against the
// built frontend (frontend/dist/index.html after `npm run build`):
// - The only executing inline script is the hero-preload script in
//   frontend/index.html; it is byte-identical in source and in the build,
//   and its sha256 is pinned below. The JSON-LD block is a data block
//   (type="application/ld+json") and is not governed by script-src.
// - Every other script is an external file served from 'self'
//   (/theme-init.js, /assets/*.js). No eval, no `new Function`, no
//   workers, no blob URLs in frontend/src.
// - style-src carries 'unsafe-inline' because React renders inline style
//   attributes (10 uses of style={{...}} in frontend/src); there are no
//   inline <style> elements. Hashing dynamic style attributes is not
//   possible, so this is the documented trade-off, not an oversight.
// - connect-src allows 'self' plus https://*.vercel.app because the data
//   API is a separate Vercel deployment whose hostname varies by
//   environment (production gnosis-api-liard, preview
//   gnosis-api-git-main-...), baked into the build via VITE_API_URL.
//   Auth requests use the same-origin /api proxy and stay 'self'. If the
//   API ever moves off *.vercel.app, this directive must be updated with
//   it; the app will fail loudly (blocked fetches) rather than silently.
// - Fonts are self-hosted (/fonts), images are self-hosted or Vite-inlined
//   data: URIs; no external images, fonts, or fetches exist in the app.
//
// If the inline hero-preload script in frontend/index.html ever changes,
// recompute its hash and update INLINE_SCRIPT_SHA256:
//   node -e "const fs=require('fs'),c=require('crypto');
//     const h=fs.readFileSync('frontend/dist/index.html','utf8');
//     const m=h.match(/<script>([\s\S]*?)<\/script>/);
//     console.log('sha256-'+c.createHash('sha256').update(m[1],'utf8').digest('base64'))"
// The test suite (test/dependencies/securityHeaders.test.js) recomputes
// the hash from frontend/index.html and fails if it no longer matches,
// so a changed script cannot silently break the page under this CSP.

// sha256 of the inline hero-preload <script> in frontend/index.html
// (byte-identical in the built dist/index.html). See the note above.
const INLINE_SCRIPT_SHA256 =
    "Yi08cC8J3ON02f+iMwrEr19OkIsdcsybBSIxPOVVecQ=";

const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    `script-src 'self' 'sha256-${INLINE_SCRIPT_SHA256}'`,
    // 'unsafe-inline' is required for React inline style attributes; see
    // the header comment. script-src stays hash-only on purpose.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    // The data API lives on a separate *.vercel.app deployment; see above.
    "connect-src 'self' https://*.vercel.app",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "X-Content-Type-Options": "nosniff",
    // SAMEORIGIN matches CSP frame-ancestors 'self' and covers browsers
    // without CSP frame-ancestors support. DENY would be stricter than
    // the CSP and inconsistent with it; the app is never framed
    // cross-origin, and same-origin framing is not used either, so
    // SAMEORIGIN is the consistent choice.
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
};

function securityHeaders(req, res, next) {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        res.set(name, value);
    }
    next();
}

// Audit F12: every authenticated/private response must carry
// `Cache-Control: private, no-store`, including error responses. This
// middleware is mounted on the private routers in app.js (auth, notes,
// bookmarks, highlights, reading-state) so the header is set before any
// handler runs and survives the central error handler. It deliberately
// does NOT touch the public reference/search routes: those keep their
// intentional public caching from middleware/cacheHeaders.js.
function privateNoStore(req, res, next) {
    res.set("Cache-Control", "private, no-store");
    next();
}

module.exports = {
    CONTENT_SECURITY_POLICY,
    INLINE_SCRIPT_SHA256,
    SECURITY_HEADERS,
    securityHeaders,
    privateNoStore,
};
