const test = require("node:test");
const assert = require("node:assert/strict");
const {
    NOTIFICATION_KINDS,
    renderAccountSecurityEmail,
    sendAccountSecurityEmail,
    notifyAccountSecurityEvent,
    notifyNewDeviceLogin,
} = require("../../src/services/accountNotifications");

const ENV = {
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "Gnosis <notify@example.com>",
    FRONTEND_URL: "https://frontend.example.invalid",
};
const WHEN = new Date("2026-11-09T19:05:00.000Z");
const RESET_LINK = "https://frontend.example.invalid/forgot-password";

// The four notifiable kinds, keyed on the audit kind strings — never
// renamed here. MFA verification events are deliberately absent:
// verifying a code is routine, not a change to what can sign in.
test("the notifiable kinds are the audit kinds, and nothing else", () => {
    assert.deepEqual(NOTIFICATION_KINDS, {
        "login.new_device": "newDevice",
        "password.changed": "passwordChanged",
        "mfa.enrolled": "mfaEnrolled",
        "mfa.removed": "mfaRemoved",
    });
    assert.ok(!("mfa.verified" in NOTIFICATION_KINDS));
    assert.ok(!("mfa.verification_failed" in NOTIFICATION_KINDS));
    assert.ok(!("password_reset.completed" in NOTIFICATION_KINDS));
});

test("the new-device template states what happened and when, with the wasn't-you link", () => {
    const email = renderAccountSecurityEmail("login.new_device", { when: WHEN, frontendUrl: ENV.FRONTEND_URL });
    assert.equal(email.subject, "New sign-in to your Gnosis account");
    assert.match(email.text, /A new device signed in to your Gnosis account at Mon, 09 Nov 2026 19:05:00 GMT\./);
    assert.match(email.text, /If this was you, you don't need to do anything\./);
    assert.ok(email.text.includes("If this wasn't you, use the button above to reset your password right away."));
    assert.ok(email.text.includes(`Reset your password: ${RESET_LINK}`));
    assert.ok(email.html.includes(`href="${RESET_LINK}"`));
    assert.ok(email.html.includes("Reset your password"));
});

test("the password-change template states what happened and when", () => {
    const email = renderAccountSecurityEmail("password.changed", { when: WHEN, frontendUrl: ENV.FRONTEND_URL });
    assert.equal(email.subject, "Your Gnosis password was changed");
    assert.match(email.text, /Your Gnosis password was changed at Mon, 09 Nov 2026 19:05:00 GMT\./);
    assert.match(email.text, /If you made this change, you don't need to do anything\./);
    assert.ok(email.text.includes(RESET_LINK));
    assert.ok(email.html.includes(`href="${RESET_LINK}"`));
});

test("the MFA templates cover enrolment and removal", () => {
    const enrolled = renderAccountSecurityEmail("mfa.enrolled", { when: WHEN, frontendUrl: ENV.FRONTEND_URL });
    assert.equal(enrolled.subject, "Two-factor authentication was turned on for your Gnosis account");
    assert.match(enrolled.text, /Two-factor authentication was turned on for your Gnosis account at Mon, 09 Nov 2026 19:05:00 GMT\./);
    assert.ok(enrolled.text.includes(RESET_LINK));
    const removed = renderAccountSecurityEmail("mfa.removed", { when: WHEN, frontendUrl: ENV.FRONTEND_URL });
    assert.equal(removed.subject, "Two-factor authentication was turned off for your Gnosis account");
    assert.match(removed.text, /Two-factor authentication was turned off for your Gnosis account at Mon, 09 Nov 2026 19:05:00 GMT\./);
    assert.match(removed.text, /no longer asks for a second step/);
    assert.ok(removed.text.includes(RESET_LINK));
});

test("templates never render a token, password, IP, or device fingerprint", () => {
    for (const kind of Object.keys(NOTIFICATION_KINDS)) {
        const email = renderAccountSecurityEmail(kind, { when: WHEN, frontendUrl: ENV.FRONTEND_URL });
        const combined = `${email.subject}\n${email.html}\n${email.text}`;
        assert.ok(!/203\.0\.113\.7/.test(combined), kind);
        assert.ok(!/SyntheticAgent/.test(combined), kind);
        assert.ok(!/token|password_hash|Bearer/i.test(combined), kind);
        // The only URL is the forgot-password link, built from FRONTEND_URL.
        const urls = combined.match(/https:\/\/[^\s"'<>]+/g) || [];
        assert.ok(urls.length > 0, kind);
        assert.ok(urls.every((url) => url === RESET_LINK), kind);
    }
});

test("rendering rejects an unknown kind, a bad time, and a missing frontend URL", () => {
    assert.throws(() => renderAccountSecurityEmail("login.success", { when: WHEN, frontendUrl: ENV.FRONTEND_URL }), /Unknown account notification kind/);
    assert.throws(() => renderAccountSecurityEmail("login.new_device", { when: "soon", frontendUrl: ENV.FRONTEND_URL }), /valid Date/);
    assert.throws(() => renderAccountSecurityEmail("login.new_device", { when: WHEN, frontendUrl: "" }), /frontend URL is required/);
});

test("sends the new-device email through the Resend client with the validated config", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ id: "synthetic-id" }) };
    };
    const result = await sendAccountSecurityEmail({
        to: "user@example.com", kind: "login.new_device", when: WHEN, fetchImpl, env: ENV,
    });
    assert.deepEqual(result, { id: "synthetic-id" });
    assert.equal(calls.length, 1);
    const { url, options } = calls[0];
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer re_test_key");
    const body = JSON.parse(options.body);
    assert.equal(body.from, "Gnosis <notify@example.com>");
    assert.equal(body.to, "user@example.com");
    assert.equal(body.subject, "New sign-in to your Gnosis account");
    assert.ok(body.text.includes("A new device signed in"));
    assert.ok(body.html.includes("A new device signed in"));
    assert.ok(options.signal instanceof AbortSignal, "a timeout signal must guard the provider call");
});

test("a provider failure throws with its status", async () => {
    const fetchImpl = async () => ({ ok: false, status: 502, json: async () => ({}) });
    await assert.rejects(
        sendAccountSecurityEmail({ to: "user@example.com", kind: "password.changed", when: WHEN, fetchImpl, env: ENV }),
        (error) => error.status === 502
    );
});

test("bad configuration and a bad recipient throw before any fetch", async () => {
    let called = false;
    const fetchImpl = async () => {
        called = true;
        return { ok: true, json: async () => ({}) };
    };
    await assert.rejects(
        sendAccountSecurityEmail({ to: "user@example.com", kind: "login.new_device", when: WHEN, fetchImpl, env: { ...ENV, RESEND_API_KEY: "" } })
    );
    await assert.rejects(
        sendAccountSecurityEmail({ to: "not-an-address", kind: "login.new_device", when: WHEN, fetchImpl, env: ENV }),
        /valid email address/
    );
    assert.equal(called, false);
});

// Fake database holding one user row, like the real users table.
function fakeDb(emailById) {
    return {
        query: async (sql, params) => {
            assert.match(sql, /^SELECT email FROM users WHERE id = \$1$/);
            const email = emailById[params[0]];
            return { rows: email === undefined ? [] : [{ email }] };
        },
    };
}

function captureConsoleError() {
    const lines = [];
    const original = console.error;
    console.error = (...args) => { lines.push(args.join(" ")); };
    return { lines, restore: () => { console.error = original; } };
}

test("notify resolves the recipient from the database and sends once", async () => {
    const sent = [];
    const result = await notifyAccountSecurityEvent(
        fakeDb({ 7: "user@example.com" }), 7, "mfa.enrolled",
        { sendEmail: async (args) => { sent.push(args); }, now: WHEN }
    );
    assert.deepEqual(result, { sent: true });
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], { to: "user@example.com", kind: "mfa.enrolled", when: WHEN });
});

test("notifyNewDeviceLogin is the login.new_device wrapper", async () => {
    const sent = [];
    const result = await notifyNewDeviceLogin(
        fakeDb({ 9: "device@example.com" }), 9,
        { sendEmail: async (args) => { sent.push(args); }, now: WHEN }
    );
    assert.deepEqual(result, { sent: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].kind, "login.new_device");
    assert.equal(sent[0].to, "device@example.com");
});

test("notify sends nothing for an unknown user or a bad stored address, and never throws", async () => {
    const captured = captureConsoleError();
    try {
        let sent = 0;
        const sendEmail = async () => { sent += 1; };
        assert.deepEqual(
            await notifyAccountSecurityEvent(fakeDb({}), 404, "login.new_device", { sendEmail, now: WHEN }),
            { sent: false }
        );
        assert.deepEqual(
            await notifyAccountSecurityEvent(fakeDb({ 7: "not-an-address" }), 7, "login.new_device", { sendEmail, now: WHEN }),
            { sent: false }
        );
        assert.deepEqual(
            await notifyAccountSecurityEvent(fakeDb({ 7: "user@example.com" }), "seven", "login.new_device", { sendEmail, now: WHEN }),
            { sent: false }
        );
        assert.equal(sent, 0);
        assert.equal(captured.lines.length, 0, "a missing recipient is silent, not a failure line");
    } finally {
        captured.restore();
    }
});

test("a sending failure is one safe log line and never throws", async () => {
    const captured = captureConsoleError();
    try {
        const failing = async () => {
            throw Object.assign(new Error("synthetic provider failure naming user@example.com"), { code: "ECONNRESET" });
        };
        const result = await notifyAccountSecurityEvent(
            fakeDb({ 7: "user@example.com" }), 7, "password.changed",
            { sendEmail: failing, now: WHEN }
        );
        assert.deepEqual(result, { sent: false });
        assert.equal(captured.lines.length, 1);
        assert.match(captured.lines[0], /^\[account-notifications\] send failed kind=password\.changed code=ECONNRESET$/);
        assert.ok(!captured.lines[0].includes("user@example.com"));
        assert.ok(!captured.lines[0].includes("synthetic provider failure"));
    } finally {
        captured.restore();
    }
});

test("a database failure in the lookup is one safe log line and never throws", async () => {
    const captured = captureConsoleError();
    try {
        const failingDb = {
            query: async () => { throw Object.assign(new Error("synthetic db failure"), { code: "08006" }); },
        };
        const result = await notifyAccountSecurityEvent(failingDb, 7, "login.new_device", { sendEmail: async () => {}, now: WHEN });
        assert.deepEqual(result, { sent: false });
        assert.equal(captured.lines.length, 1);
        assert.match(captured.lines[0], /^\[account-notifications\] send failed kind=login\.new_device code=08006$/);
        assert.ok(!captured.lines[0].includes("synthetic db failure"));
    } finally {
        captured.restore();
    }
});
