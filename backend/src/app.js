const express = require("express");
const cors = require("cors");

const bibleRoutes = require("./routes/bibleRoutes");
const authRoutes = require("./routes/authRoutes");
const searchRoutes = require("./routes/searchRoutes");
const notesRoutes = require("./routes/notesRoutes");
const bookmarksRoutes = require("./routes/bookmarksRoutes");
const highlightsRoutes = require("./routes/highlightsRoutes");
const { CLIENT_AUTH_RESPONSES, isBodyParseError, logAuthFailure } = require("./utils/authErrors");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", bibleRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", searchRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/bookmarks", bookmarksRoutes);
app.use("/api/highlights", highlightsRoutes);

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