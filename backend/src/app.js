const express = require("express");
const cors = require("cors");

// Issue #9: email configuration is validated at import time, through
// this module, because Vercel does not run server.js: any serverless
// wrapper must import the exported app, so this check runs on every
// entry path. A failure throws the generic message (issue #5) before
// the server listens. Test processes that import the app run with
// synthetic email configuration from the test launchers.
require("./config/emailConfig").requireEmailConfig();

const bibleRoutes = require("./routes/bibleRoutes");
const authRoutes = require("./routes/authRoutes");
const searchRoutes = require("./routes/searchRoutes");
const notesRoutes = require("./routes/notesRoutes");
const bookmarksRoutes = require("./routes/bookmarksRoutes");
const highlightsRoutes = require("./routes/highlightsRoutes");
const readingStateRoutes = require("./routes/readingStateRoutes");
const { CLIENT_AUTH_RESPONSES, isBodyParseError, logAuthFailure } = require("./utils/authErrors");
const { resolveTrustProxy } = require("./utils/rateLimit");
const { securityHeaders, privateNoStore } = require("./middleware/securityHeaders");

// Production includes serverless entry points that bypass server.js.
// This import-time check is the enforcement point ported from #72: it
// runs on every entry path, including serverless wrappers that never
// execute server.js. (#81's secret-strength check will be wired into
// this same point when it lands.)
if (process.env.NODE_ENV === "production" ||
    (process.env.GNOSIS_TEST_ISOLATION !== "1" && process.env.GNOSIS_LOCAL_DEV !== "1")) {
    require("./config/securityConfig").requireSecurityConfig();
}

const app = express();

// Audit F03: Express sends `X-Powered-By: Express` by default. Disable
// it so responses do not advertise the framework.
app.disable("x-powered-by");

// Audit F03: security headers on every response, including errors and
// the JSON 404 below. HSTS is not set here; Vercel applies it.
app.use(securityHeaders);

// Issue #4: trust proxy is disabled by default and set only from the
// validated TRUST_PROXY environment setting. No production value is
// guessed here: the operator sets the value that matches the real proxy
// chain when the backend host is chosen, and an invalid value fails fast.
app.set("trust proxy", resolveTrustProxy(process.env.TRUST_PROXY));

app.use(cors({ origin: new URL(process.env.FRONTEND_URL).origin, credentials: true }));
app.use(express.json({ limit: "100kb", strict: true }));

app.use("/api", require("./middleware/requestContext").requestContext);
app.use("/api", bibleRoutes);
// Audit F12: every authenticated/private response carries
// `Cache-Control: private, no-store`, including error responses. The
// middleware runs before the router, so it survives the central error
// handler. The auth router keeps its existing per-handler no-store sets
// (login/refresh/logout); this makes the policy uniform for profile and
// error responses too. Public reference/search routes are untouched:
// they keep their intentional public caching from cacheHeaders.js.
app.use("/api/auth", privateNoStore, authRoutes);
app.use("/api", searchRoutes);
app.use("/api/notes", privateNoStore, notesRoutes);
app.use("/api/bookmarks", privateNoStore, bookmarksRoutes);
app.use("/api/highlights", privateNoStore, highlightsRoutes);
app.use("/api/reading-state", privateNoStore, readingStateRoutes);

app.get("/", (req, res) => {
    res.json({
        message: "Bible commentary API is running!"
    });
});

// Audit N05: unmatched /api/* routes return controlled JSON, not
// Express's default HTML "Cannot GET ..." page. This runs after every
// /api router, so only genuinely unmatched API paths reach it. Non-API
// paths are out of scope: in production Vercel rewrites them to the SPA
// shell, and this backend serves no other HTML.
app.use("/api", (req, res) => {
    const { status, body } = CLIENT_AUTH_RESPONSES.notFound;
    return res.status(status).json(body);
});

// Central error handler, registered after every route so no error escapes
// as an Express HTML page or stack trace. Only controlled JSON leaves here:
// malformed JSON becomes a 400, everything else becomes a generic 500.
// This is intentionally app-wide in effect, so an unhandled throw in any
// route gets the same safe treatment instead of the default handler.
app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }
    res.set("Cache-Control", "no-store");
    if (error.type === "entity.too.large") {
        return res.status(413).json({ error: "Request body too large.", code: "BODY_TOO_LARGE" });
    }
    if (error.type === "encoding.unsupported" || error.type === "charset.unsupported") {
        return res.status(415).json({ error: "Unsupported request encoding.", code: "UNSUPPORTED_ENCODING" });
    }
    if (isBodyParseError(error)) {
        const { status, body } = CLIENT_AUTH_RESPONSES.invalidBody;
        return res.status(status).json(body);
    }
    logAuthFailure("unhandled-request", "internal", error);
    const { status, body } = CLIENT_AUTH_RESPONSES.internal;
    return res.status(status).json(body);
});

// Export the configured app so other files can use it.
module.exports = app;