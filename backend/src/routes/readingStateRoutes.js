const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/authMiddleware");
const {
    getReadingState,
    saveReadingState
} = require("../controllers/readingStateController");

router.get("/", authenticateToken, getReadingState);
router.put("/", authenticateToken, saveReadingState);

module.exports = router;
