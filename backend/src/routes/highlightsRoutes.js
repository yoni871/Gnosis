const express = require("express");
const router = express.Router();
// Private data is never cached (PR #91). The router.param(recordId)
// line from #91 is dropped: it requires #75's apiValidation module,
// which does not exist in main.
router.use((req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
const authenticateToken = require("../middleware/authMiddleware");
const { 
    createHighlight, 
    getHighlights, 
    deleteHighlight,
    deleteHighlightsInPassage
} = require("../controllers/highlightsController");

// Run authentication first, then handle the validated user's request.
router.post("/", authenticateToken, createHighlight);
router.get("/", authenticateToken, getHighlights);
router.delete("/passage", authenticateToken, deleteHighlightsInPassage);
router.delete("/:id", authenticateToken, deleteHighlight);

// Let server.js mount this router under /api/highlights.
module.exports = router;