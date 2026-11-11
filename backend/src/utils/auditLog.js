// Audit logging baseline for roadmap T1.16 (audit §4).
//
// One append-only table, `security_events`, records that a security
// event happened — kind, user, timestamp — and nothing else. It never
// stores passwords, tokens, hashes, PII, IP addresses, or request
// data. The helper is the only writer in application code; the kind
// allowlist below is the contract other PRs build on, so keep the
// strings stable and extend them only with a new kind entry plus its
// owner PR (see docs/SecurityEvents.md).
//
// Failure discipline follows backend/src/utils/authErrors.js: logs
// carry route + kind + database code only, never messages, stacks, or
// submitted values. An audit insert must never break the auth flow
// it records, so a database failure is logged once (safe line) and
// swallowed — the caller keeps its original response.

const AUDIT_EVENT_KINDS = Object.freeze([
    // Wired by this PR (T1.16).
    "login.success",
    "login.failure",
    "password_reset.completed",
    "refresh_token.reused",
    "logout.all",
    // Defined only; wired by the owner PR when its feature lands.
    // PR8 (auth hardening): single-session revoke, authenticated change.
    "session.revoked",
    "password.changed",
    // PR7 (auth hardening): TOTP enrol/verify/fail/remove, recovery codes.
    "mfa.enrolled",
    "mfa.verified",
    "mfa.verification_failed",
    "mfa.removed",
    "recovery_code.used",
    "recovery_codes.regenerated",
    // PR5 (auth hardening): account deletion request/completion.
    "account_deletion.requested",
    "account_deletion.completed",
    // PR10 (auth hardening): passkeys.
    "passkey.registered",
    "passkey.login",
    "passkey.removed",
    // PR3 (auth hardening): breached-password rejection, boot secret check.
    "breached_password.rejected",
    "secret_strength.boot_failed",
]);

const AUDIT_KINDS = new Set(AUDIT_EVENT_KINDS);

function isValidAuditKind(kind) {
    return typeof kind === "string" && AUDIT_KINDS.has(kind);
}

// Record one security event. `db` is a pg Pool or Client (uses
// db.query); `kind` must be in AUDIT_EVENT_KINDS or this throws;
// `userId` is an integer user id, or null when no account is known
// (for example a login failure for an unknown email). Resolves once
// the row is written. NEVER throws on a database failure: the failure
// is logged as one safe line (kind + code only) and the caller
// continues with its original response.
async function audit(db, kind, userId) {
    if (!isValidAuditKind(kind)) {
        throw new Error("Unknown audit event kind.");
    }
    if (userId !== null && !Number.isInteger(userId)) {
        throw new TypeError("Audit userId must be an integer or null.");
    }
    try {
        await db.query(
            "INSERT INTO security_events(kind, user_id) VALUES ($1, $2)",
            [kind, userId]
        );
    } catch (error) {
        const code = error && typeof error.code === "string" ? error.code : "none";
        console.error(`[audit] insert failed kind=${kind} code=${code}`);
    }
}

module.exports = { audit, AUDIT_EVENT_KINDS, isValidAuditKind };
