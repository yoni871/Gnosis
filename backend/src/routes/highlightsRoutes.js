const express = require("express");
const router = express.Router();
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