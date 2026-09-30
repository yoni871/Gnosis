const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/authMiddleware");
const { 
    createBookmark, 
    getBookmarks,
    getBookmarkById,
    updateBookmark,
    deleteBookmark
} = require("../controllers/bookmarksController");

router.post("/", authenticateToken, createBookmark);
router.get("/", authenticateToken, getBookmarks);
router.get("/:id", authenticateToken, getBookmarkById);
router.put("/:id", authenticateToken, updateBookmark);
router.delete("/:id", authenticateToken, deleteBookmark);

module.exports = router;