// Resend delivery for issue #9, behind an injectable client.
//
// The production path always talks to https://api.resend.com. Tests
// inject a fetch implementation (unit tests) or a loopback stub through
// the environment override (application tests). RESEND_API_BASE_URL is
// never an unrestricted production setting: the override is honored
// only when GNOSIS_TEST_ISOLATION=1, and production ignores it even if
// it is set.
//
// The client never logs: no token, no link, no address, no key, and no
// provider body ever reaches a log line. Callers log route, kind, and
// status only, per issue #5.

const { validateEmailConfig, RESEND_API_BASE_URL_DEFAULT } = require("../config/emailConfig");
const { buildVerificationLink } = require("./verification");

const RESEND_TIMEOUT_MS = 5000;

// Pure resolution, unit-testable without a network call. Injected base
// URLs (tests) win; otherwise the environment override applies only
// under test isolation; otherwise the Resend API is used.
function resolveResendBaseUrl({ injectedBaseUrl, env = process.env } = {}) {
    if (typeof injectedBaseUrl === "string" && injectedBaseUrl.length > 0) {
        return injectedBaseUrl;
    }
    if (env.GNOSIS_TEST_ISOLATION === "1"
        && typeof env.RESEND_API_BASE_URL === "string"
        && env.RESEND_API_BASE_URL.length > 0) {
        return env.RESEND_API_BASE_URL;
    }
    return RESEND_API_BASE_URL_DEFAULT;
}

function createResendClient({ fetchImpl = globalThis.fetch, baseUrl: injectedBaseUrl, env = process.env } = {}) {
    const baseUrl = resolveResendBaseUrl({ injectedBaseUrl, env });
    return {
        baseUrl,
        // Sends one verification email. Throws on bad configuration, on
        // a non-2xx provider response (with .status attached), and on a
        // timeout. Callers treat every throw as a provider failure: the
        // account is preserved unverified and the user can resend.
        async sendVerificationEmail({ to, token }) {
            const result = validateEmailConfig(env);
            if (result.errors) {
                throw new Error("Email configuration is invalid.");
            }
            const { config } = result;
            if (env.EMAIL_DELIVERY === 'disabled') {
                throw new Error('Email delivery is disabled for local reader testing.');
            }
            const verificationLink = buildVerificationLink(config.frontendUrl, token);
            if (env.EMAIL_DELIVERY === 'mailpit') {
                // Fixed loopback destination, no credentials, no relay and no token logging.
                // Validation above forbids this mode outside explicit local development.
                const response = await fetchImpl('http://127.0.0.1:8025/api/v1/send', {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({From:{Email:'gnosis@example.invalid',Name:'Gnosis Local'},
                        To:[{Email:to}],Subject:'Verify your Gnosis account',
                        Text:`Confirm your local Gnosis account: ${verificationLink}`}),
                    signal:AbortSignal.timeout(RESEND_TIMEOUT_MS),
                });
                if(!response.ok) throw new Error('Local mailbox delivery failed.');
                return {};
            }
            const response = await fetchImpl(`${baseUrl}/emails`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${config.resendApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from: config.emailFrom,
                    to,
                    subject: "Verify your Gnosis account",
                    html: `<p>Welcome to Gnosis. Confirm your email address to finish creating your account:</p>`
                        + `<p><a href="${verificationLink}">Verify your email</a></p>`
                        + `<p>If you did not create this account, you can ignore this email.</p>`,
                    text: `Welcome to Gnosis. Confirm your email address to finish creating your account: ${verificationLink}\n`
                        + `If you did not create this account, you can ignore this email.`,
                }),
                signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
            });
            if (!response.ok) {
                const error = new Error("Resend request failed.");
                error.status = response.status;
                throw error;
            }
            return response.json().catch(() => ({}));
        },
    };
}

module.exports = {
    createResendClient,
    resolveResendBaseUrl,
    RESEND_API_BASE_URL_DEFAULT,
    RESEND_TIMEOUT_MS,
};
