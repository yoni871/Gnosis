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
const passkeyRoutes = require("./routes/passkeyRoutes");
const searchRoutes = require("./routes/searchRoutes");
const notesRoutes = require("./routes/notesRoutes");
const bookmarksRoutes = require("./routes/bookmarksRoutes");
const highlightsRoutes = require("./routes/highlightsRoutes");
const readingStateRoutes = require("./routes/readingStateRoutes");
const { CLIENT_AUTH_RESPONSES, isBodyParseError, logAuthFailure } = require("./utils/authErrors");
const { resolveTrustProxy } = require("./utils/rateLimit");

const app = express();

// Issue #4: trust proxy is disabled by default and set only from the
// validated TRUST_PROXY environment setting. No production value is
// guessed here: the operator sets the value that matches the real proxy
// chain when the backend host is chosen, and an invalid value fails fast.
app.set("trust proxy", resolveTrustProxy(process.env.TRUST_PROXY));

app.use(cors({ origin: new URL(process.env.FRONTEND_URL).origin, credentials: true }));
app.use(express.json());

app.use("/api", bibleRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth/passkeys", passkeyRoutes);
app.use("/api", searchRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/bookmarks", bookmarksRoutes);
app.use("/api/highlights", highlightsRoutes);
app.use("/api/reading-state", readingStateRoutes);

app.get("/", (req, res) => {
    res.json({
        message: "Bible commentary API is running!"
    });
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
    if (isBodyParseError(error)) {
        const { status, body } = CLIENT_AUTH_RESPONSES.invalidBody;
        return res.status(status).json(body);
    }
    logAuthFailure(`${req.method} ${req.path}`, "internal", error);
    const { status, body } = CLIENT_AUTH_RESPONSES.internal;
    return res.status(status).json(body);
});

// Export the configured app so other files can use it.
module.exports = app;