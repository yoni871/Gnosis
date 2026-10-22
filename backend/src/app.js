const express = require("express");
const cors = require("cors");

const bibleRoutes = require("./routes/bibleRoutes");
const authRoutes = require("./routes/authRoutes");
const searchRoutes = require("./routes/searchRoutes");
const notesRoutes = require("./routes/notesRoutes");
const bookmarksRoutes = require("./routes/bookmarksRoutes");
const highlightsRoutes = require("./routes/highlightsRoutes");

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

// Export the configured app so other files can use it.
module.exports = app;