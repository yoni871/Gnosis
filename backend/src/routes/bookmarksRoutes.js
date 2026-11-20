const express = require("express");
const router = express.Router();
// Private data is never cached (PR #91). The router.param(recordId)
// line from #91 is dropped: it requires #75's apiValidation module,
// which does not exist in main.
router.use((req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
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