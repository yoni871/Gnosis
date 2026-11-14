// Same-origin proxy for the session/auth endpoints (PR #39).
//
// The browser calls the frontend's own /api/auth/* (same origin) and this
// function forwards the request to the Express API. The refresh cookie is
// SameSite=Strict, HttpOnly and Secure, so the browser only sends it on a
// same-site request; proxying makes the cookie same-origin without weakening
// any of those protections. No endpoint, cookie attribute, or auth behaviour
// changes — only the route the browser uses to reach the API.
//
// The forwarding itself lives in _proxy.js, shared with the explicit MFA
// route files under mfa/ (Vercel does not route two-segment paths such as
// /api/auth/mfa/enroll to this catch-all, so those endpoints need their own
// route files — see the MFA fix PR).
import { authSubPath, handleAuthProxy } from "./_proxy.js";

export default async function handler(req, res) {
    await handleAuthProxy(req, res, authSubPath(req.url || ""));
}
