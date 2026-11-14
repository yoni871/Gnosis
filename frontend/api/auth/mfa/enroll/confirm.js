// Explicit same-origin proxy for POST /api/auth/mfa/enroll/confirm.
//
// Vercel does not route two-segment paths under /api/auth/ (such as
// /api/auth/mfa/enroll/confirm) to the catch-all [...path].js, so the MFA
// endpoints need explicit route files. This reuses the shared auth proxy in
// _proxy.js — same backend origin, cookie/header forwarding, timeout, and
// no-redirect protections as the login/refresh proxy. No MFA or auth
// behaviour changes.
import { handleAuthProxy } from "../../_proxy.js";

export default async function handler(req, res) {
    await handleAuthProxy(req, res, "mfa/enroll/confirm");
}
