const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_EMAIL_FROM, renderGnosisEmail } = require("../../src/utils/emailTemplate");

const LINK = "https://frontend.example.invalid/verify-email#token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

test("the default sender is the product identity", () => {
    assert.equal(DEFAULT_EMAIL_FROM, "Gnosis <noreply@studygnosis.com>");
});

test("renders heading, button, fallback link, expiration, and security note", () => {
    const { html, text } = renderGnosisEmail({
        preheader: "Confirm your email address.",
        heading: "Verify your email address",
        intro: "Welcome to Gnosis. Confirm your email address to finish creating your account.",
        actionUrl: LINK,
        actionLabel: "Verify your email",
        expiration: "This link expires in 24 hours and works only once.",
        securityNote: "If you didn't create a Gnosis account, you can safely ignore this email.",
    });
    assert.ok(html.includes("Verify your email address"), "heading");
    assert.ok(html.includes("Welcome to Gnosis"), "intro");
    assert.ok(html.includes(`href="${LINK}"`), "button links to the action URL");
    assert.ok(html.includes(">Verify your email</a>"), "button label");
    assert.ok(html.includes("copy and paste this link into your browser"), "fallback instruction");
    assert.ok(html.includes(LINK), "fallback link is readable as text");
    assert.ok(html.includes("This link expires in 24 hours"), "expiration");
    assert.ok(html.includes("safely ignore this email"), "security note");
    assert.ok(html.includes("Explore Scripture. Discover Its Depth."), "footer tagline");
    assert.ok(html.includes("Replies to this address are not monitored"), "noreply footer");
    assert.ok(html.includes("Confirm your email address."), "preheader is present for inbox preview");
    assert.ok(html.includes("#233e34"), "forest-green accent");
    assert.ok(html.includes("#f5efe0"), "warm off-white background");
    assert.ok(html.includes("#faf7ef"), "warm card background");
    assert.ok(html.includes("#b08d57"), "gold rule");
    assert.ok(!html.includes("<style"), "no style block: all styles are inline for client compatibility");
    assert.ok(text.includes("Verify your email address"));
    assert.ok(text.includes(`Verify your email: ${LINK}`), "text version carries label + link");
    assert.ok(text.includes("This link expires in 24 hours"));
    assert.ok(text.includes("safely ignore this email"));
    assert.ok(!text.includes("<"), "text version has no HTML");
});

test("renders without an action: no button, no fallback link", () => {
    const { html, text } = renderGnosisEmail({
        heading: "Your sign-in was noticed",
        intro: "Someone signed in to your Gnosis account just now.",
        securityNote: "If this wasn't you, change your password.",
    });
    assert.ok(!html.includes("copy and paste this link"), "no fallback without an action");
    assert.ok(!html.includes("href="), "no link without an action");
    assert.ok(text.includes("Your sign-in was noticed"));
    assert.ok(text.includes("If this wasn't you"));
});

test("escapes interpolated content in HTML but keeps the text version raw", () => {
    const tricky = "https://frontend.example.invalid/verify-email#token=aaa&next=/read?x=1";
    const { html, text } = renderGnosisEmail({
        heading: "Verify <b>now</b>",
        intro: "Confirm & finish.",
        actionUrl: tricky,
        actionLabel: "Verify \"now\"",
        expiration: "Expires in 24 hours.",
    });
    assert.ok(!html.includes("Verify <b>now</b>"), "heading markup is escaped");
    assert.ok(html.includes("Verify &lt;b&gt;now&lt;/b&gt;"));
    assert.ok(html.includes("Confirm &amp; finish."));
    assert.ok(html.includes("token=aaa&amp;next=/read?x=1"), "ampersands in the URL are escaped in href");
    assert.ok(text.includes(tricky), "text version keeps the raw URL");
    assert.ok(text.includes("Verify <b>now</b>"), "text version keeps raw text");
});

test("rejects incomplete or unsafe inputs", () => {
    assert.throws(() => renderGnosisEmail({ intro: "x" }), /heading/);
    assert.throws(() => renderGnosisEmail({ heading: "x" }), /intro/);
    assert.throws(
        () => renderGnosisEmail({ heading: "x", intro: "y", actionUrl: LINK }),
        /both a URL and a label/
    );
    assert.throws(
        () => renderGnosisEmail({ heading: "x", intro: "y", actionLabel: "Go" }),
        /both a URL and a label/
    );
    assert.throws(
        () => renderGnosisEmail({ heading: "x", intro: "y", actionUrl: "http://frontend.example.invalid/x", actionLabel: "Go" }),
        /absolute HTTPS URL/
    );
});
