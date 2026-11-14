// Administrator allowlist for mandatory MFA (design §9).
//
// Gnosis has no administrator-role architecture (no role column, no
// admin endpoints, no admin panel) and this PR does not invent one.
// The only "administrator" is the infrastructure operator, and the
// mechanism is an operator-controlled env-var allowlist: ADMIN_EMAILS,
// a comma-separated list of lowercase emails, set per scope in
// Vercel. Empty (or unset) means no admins. An admin account must
// have MFA enrolled; the login gate (authRoutes.js) enforces that.
//
// The allowlist is read at request time (not import time) so the
// operator can change it without a redeploy of the code — only the
// env var changes.

function getAdminEmails() {
    const raw = process.env.ADMIN_EMAILS;
    if (typeof raw !== "string" || raw.trim() === "") {
        return new Set();
    }
    return new Set(
        raw.split(",")
            .map((entry) => entry.trim().toLowerCase())
            .filter((entry) => entry !== "")
    );
}

function isAdminEmail(email) {
    if (typeof email !== "string" || email === "") {
        return false;
    }
    return getAdminEmails().has(email.toLowerCase());
}

module.exports = { getAdminEmails, isAdminEmail };
