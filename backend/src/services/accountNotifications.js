// Account-security notification emails for roadmap PR3.
//
// One email per security event that changes what can sign in to an
// account: a first login from a new device, a password change, and a
// two-factor authentication change (enrolled or removed). The email is
// the user's own notice — plain language, what happened and when, and
// what to do if it was not them.
//
// Transport reuses the existing Resend client
// (backend/src/utils/resendClient.js): this module is the policy layer
// only — kind-to-template mapping, content, and failure discipline —
// so the transport file keeps one method per provider call and this
// file owns the notification rules. The "wasn't you" link is the
// frontend forgot-password page (frontend/src/App.jsx, issue #10),
// built from FRONTEND_URL like the verification and reset links; no
// other URL is invented here.
//
// Content policy: the only personal data in an email is the recipient
// address itself (the To field, never repeated in the body). No token,
// no password, no raw IP, no user-agent, and no device fingerprint is
// ever rendered: the new-device email says only that a new device
// signed in, never which one.
//
// Failure discipline: best-effort, always. notifyAccountSecurityEvent
// never throws — a missing user row, a bad stored address, bad email
// configuration, or a provider failure is logged as one safe line
// (kind + code only, per backend/src/utils/authErrors.js) and the
// caller keeps its original response. Sending failure must never
// break auth.
//
// Wiring (see docs/AccountNotifications.md): the new-device email is
// sent from services/loginDevices.js when login.new_device is
// emitted. The password-change and MFA-change emails have templates
// and a helper here, but no live call site yet — their features land
// in Muse 3's PR8 (authenticated password change) and PR7 (TOTP),
// which call notifyAccountSecurityEvent from the service function
// that audits the matching kind. This module never re-emits
// password_reset.completed: a password reset already notifies the
// user through its own reset email.

const { validateEmailConfig } = require("../config/emailConfig");
const { validateEmailAddress } = require("../utils/authValidation");
const { createResendClient } = require("../utils/resendClient");
const { renderGnosisEmail } = require("../utils/emailTemplate");

// Audit kinds (backend/src/utils/auditLog.js) that trigger a user
// notification email, mapped to their template. Kind strings are the
// audit contract — never renamed here. MFA verification events are
// deliberately absent: verifying a code is routine, not a change to
// what can sign in; only enrolment and removal notify.
const NOTIFICATION_KINDS = Object.freeze({
    "login.new_device": "newDevice",
    "password.changed": "passwordChanged",
    "mfa.enrolled": "mfaEnrolled",
    "mfa.removed": "mfaRemoved",
});

function formatWhen(when) {
    if (!(when instanceof Date) || Number.isNaN(when.getTime())) {
        throw new TypeError("Account notification time must be a valid Date.");
    }
    return when.toUTCString();
}

function buildForgotPasswordLink(frontendUrl) {
    if (typeof frontendUrl !== "string" || frontendUrl.length === 0) {
        throw new TypeError("Account notification frontend URL is required.");
    }
    return `${frontendUrl.replace(/\/+$/, "")}/forgot-password`;
}

// Pure template rendering: kind + time + frontend origin in, subject
// + html + text out. No database, no network, no logs — unit tests pin
// the wording and the content policy here. The body is the shared
// Gnosis template (backend/src/utils/emailTemplate.js, issue #118):
// heading + intro + a "Reset your password" button (the
// forgot-password link, for the wasn't-you case) + the shared footer,
// so notification emails cannot drift from the product's look or drop
// the fallback link. The action URL must be absolute HTTPS —
// renderGnosisEmail enforces that, so a non-HTTPS FRONTEND_URL fails
// the send (best-effort: the caller logs one safe line and keeps its
// original response).
function renderAccountSecurityEmail(kind, { when, frontendUrl } = {}) {
    const template = NOTIFICATION_KINDS[kind];
    if (!template) {
        throw new Error("Unknown account notification kind.");
    }
    const at = formatWhen(when);
    const resetLink = buildForgotPasswordLink(frontendUrl);
    let heading;
    let intro;
    switch (template) {
        case "newDevice":
            heading = "New sign-in to your Gnosis account";
            intro = `A new device signed in to your Gnosis account at ${at}. If this was you, you don't need to do anything.`;
            break;
        case "passwordChanged":
            heading = "Your Gnosis password was changed";
            intro = `Your Gnosis password was changed at ${at}. If you made this change, you don't need to do anything.`;
            break;
        case "mfaEnrolled":
            heading = "Two-factor authentication was turned on for your Gnosis account";
            intro = `Two-factor authentication was turned on for your Gnosis account at ${at}. If you made this change, you don't need to do anything.`;
            break;
        case "mfaRemoved":
            heading = "Two-factor authentication was turned off for your Gnosis account";
            intro = `Two-factor authentication was turned off for your Gnosis account at ${at}. Your account no longer asks for a second step when you sign in. If you made this change, you don't need to do anything.`;
            break;
        default:
            throw new Error("Unknown account notification kind.");
    }
    const { html, text } = renderGnosisEmail({
        preheader: heading,
        heading,
        intro,
        actionUrl: resetLink,
        actionLabel: "Reset your password",
        securityNote: "If this wasn't you, use the button above to reset your password right away.",
    });
    return { subject: heading, html, text };
}

// Sends one notification email through the Resend client. Throws on
// bad configuration, a structurally invalid recipient, an unknown
// kind, or a provider failure (with .status attached) — the caller
// (notifyAccountSecurityEvent) converts every throw into one safe
// log line. `fetchImpl` is injected by tests; production always uses
// the global fetch.
async function sendAccountSecurityEmail({ to, kind, when = new Date(), fetchImpl, env = process.env } = {}) {
    if (typeof to !== "string" || validateEmailAddress(to).error) {
        throw new TypeError("Account notification recipient must be a valid email address.");
    }
    const configResult = validateEmailConfig(env);
    if (configResult.errors) {
        throw new Error("Email configuration is invalid.");
    }
    const { subject, html, text } = renderAccountSecurityEmail(kind, {
        when,
        frontendUrl: configResult.config.frontendUrl,
    });
    const client = createResendClient({ fetchImpl, env });
    return client.sendEmail({ to, subject, html, text });
}

// Best-effort sender for one audited event: resolves the user's email
// from the database, sends the template for `kind`, and reports
// { sent: true } or { sent: false }. NEVER throws: every failure path
// logs one safe line (kind + code only, never an address, message, or
// stack) and returns { sent: false }. `sendEmail` is injectable so
// unit tests never touch the provider; `now` pins the event time.
async function notifyAccountSecurityEvent(db, userId, kind, { sendEmail = sendAccountSecurityEmail, now = new Date() } = {}) {
    try {
        if (!NOTIFICATION_KINDS[kind]) {
            throw new Error("Unknown account notification kind.");
        }
        if (!Number.isInteger(userId)) return { sent: false };
        const result = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
        const email = result.rows && result.rows[0] ? result.rows[0].email : null;
        if (typeof email !== "string" || validateEmailAddress(email).error) return { sent: false };
        await sendEmail({ to: email, kind, when: now });
        return { sent: true };
    } catch (error) {
        const code = error && typeof error.code === "string" ? error.code : "none";
        console.error(`[account-notifications] send failed kind=${kind} code=${code}`);
        return { sent: false };
    }
}

// New-device convenience wrapper: the login path calls this one.
async function notifyNewDeviceLogin(db, userId, deps = {}) {
    return notifyAccountSecurityEvent(db, userId, "login.new_device", deps);
}

module.exports = {
    NOTIFICATION_KINDS,
    renderAccountSecurityEmail,
    sendAccountSecurityEmail,
    notifyAccountSecurityEvent,
    notifyNewDeviceLogin,
};
