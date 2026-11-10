// Gnosis email identity + reusable HTML template (issue #118).
//
// One layout for every automated email the backend sends: account
// verification, password reset, and (on rebase) the security-notification
// emails owned by PR #84 and the MFA/session email helpers in #93/#94.
// Those PRs should call renderGnosisEmail with their own heading/intro/
// action instead of building HTML inline — the template carries the
// branding, the plain-text alternative, the expiration line, the security
// note, and the footer, so notification emails cannot drift from the
// product's look or drop the fallback link.
//
// Design: forest-green accents (#233e34, the landing-page hero green),
// warm off-white background (#F5EFE0 page, #FAF7EF card), gold rule
// (#B08D57), dark text (#2B2523), muted secondary text (#766A62).
// Table-based layout with inline styles only, max-width 600px, so it
// renders in plain and rich clients alike; the action is a real button
// AND a readable fallback link (some clients strip buttons).
//
// The sender identity lives here, once: Gnosis <noreply@studygnosis.com>.
// emailConfig falls back to it when EMAIL_FROM is unset; EMAIL_FROM still
// overrides it per deployment, and a provided-but-invalid address still
// fails validation. Nothing here touches tokens, links, expiry, or auth
// behavior — callers pass the already-built link in as actionUrl.

const DEFAULT_EMAIL_FROM = "Gnosis <noreply@studygnosis.com>";

function escapeHtml(value) {
    // Minimal escaper: & < > " cover text nodes and double-quoted
    // attributes (every interpolation in the template). Apostrophes need
    // no escaping in those positions and are left readable.
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Renders one email. heading + intro are required; actionUrl and
// actionLabel go together (both or neither — a button without a link, or
// a link without a label, is a bug, so it throws); expiration and
// securityNote are optional lines. Returns { html, text } — every email
// must send both.
function renderGnosisEmail({ preheader = "", heading, intro, actionUrl, actionLabel, expiration, securityNote }) {
    if (typeof heading !== "string" || heading.trim() === "") {
        throw new Error("Email template requires a heading.");
    }
    if (typeof intro !== "string" || intro.trim() === "") {
        throw new Error("Email template requires an intro.");
    }
    if ((actionUrl === undefined) !== (actionLabel === undefined)) {
        throw new Error("Email template action needs both a URL and a label.");
    }
    if (actionUrl !== undefined && !/^https:\/\//.test(actionUrl)) {
        throw new Error("Email template action URL must be an absolute HTTPS URL.");
    }

    const safeHeading = escapeHtml(heading);
    const safeIntro = escapeHtml(intro);
    const safePreheader = escapeHtml(preheader);
    const safeExpiration = expiration === undefined ? "" : escapeHtml(expiration);
    const safeSecurity = securityNote === undefined ? "" : escapeHtml(securityNote);
    const safeUrl = actionUrl === undefined ? "" : escapeHtml(actionUrl);
    const safeLabel = actionLabel === undefined ? "" : escapeHtml(actionLabel);

    const actionHtml = actionUrl === undefined ? "" : `
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0 8px 0;">
                            <tr>
                                <td align="center" bgcolor="#233e34" style="border-radius: 6px;">
                                    <a href="${safeUrl}" style="display: inline-block; padding: 14px 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 600; color: #fff9ed; text-decoration: none;">${safeLabel}</a>
                                </td>
                            </tr>
                        </table>
                        <p style="margin: 16px 0 0 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #766a62;">If the button above doesn&rsquo;t work, copy and paste this link into your browser:</p>
                        <p style="margin: 8px 0 0 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #233e34; word-break: break-all;"><a href="${safeUrl}" style="color: #233e34;">${safeUrl}</a></p>`;
    const expirationHtml = safeExpiration === "" ? "" : `
                        <p style="margin: 24px 0 0 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #766a62;">${safeExpiration}</p>`;
    const securityHtml = safeSecurity === "" ? "" : `
                        <hr style="border: none; border-top: 1px solid #d8cdbb; margin: 28px 0 0 0;">
                        <p style="margin: 16px 0 0 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #766a62;">${safeSecurity}</p>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${safeHeading} — Gnosis</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5efe0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${safePreheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5efe0;">
<tr>
<td align="center" style="padding: 32px 16px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 600px;">
<tr>
<td style="padding: 0 0 20px 0; text-align: center;">
<span style="font-family: Georgia, 'Times New Roman', serif; font-size: 28px; letter-spacing: 2px; color: #233e34;">Gnosis</span>
</td>
</tr>
<tr>
<td style="background-color: #faf7ef; border: 1px solid #d8cdbb; border-radius: 8px; padding: 32px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td>
<h1 style="margin: 0 0 16px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 22px; line-height: 1.3; color: #2b2523;">${safeHeading}</h1>
<p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #2b2523;">${safeIntro}</p>${actionHtml}${expirationHtml}${securityHtml}
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding: 20px 0 0 0; text-align: center;">
<p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #766a62;">Gnosis &mdash; Explore Scripture. Discover Its Depth.</p>
<p style="margin: 8px 0 0 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #766a62;">This is an automated message from Gnosis. Replies to this address are not monitored.</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

    const textParts = [
        heading,
        intro,
        actionUrl === undefined ? "" : `${actionLabel}: ${actionUrl}`,
        expiration === undefined ? "" : expiration,
        securityNote === undefined ? "" : securityNote,
        "Gnosis — Explore Scripture. Discover Its Depth.",
        "This is an automated message from Gnosis. Replies to this address are not monitored.",
    ].filter((part) => part !== "");
    const text = textParts.join("\n\n");

    return { html, text };
}

module.exports = {
    DEFAULT_EMAIL_FROM,
    renderGnosisEmail,
};
