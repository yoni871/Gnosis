// Original Language Analysis (Phase 1) — see docs/OriginalLanguage.md.
// Mounted from bibleRoutes.js so app.js is untouched.
const express = require("express");
const router = express.Router();
const {
    getPassage, getWord, getLemmaOccurrences,
} = require("../controllers/originalLanguageController");

// Specific routes first: "/:book/:chapter" would otherwise swallow
// "/words/:id" (book="words") and "/lemmas/:strong/occurrences".
router.get("/words/:id", getWord);
router.get("/lemmas/:strong/occurrences", getLemmaOccurrences);
router.get("/:book/:chapter", getPassage);

module.exports = router;
