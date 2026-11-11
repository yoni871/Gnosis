const express = require("express")
const router = express.Router();
// Private data is never cached (PR #91). The router.param(recordId)
// line from #91 is dropped: it requires #75's apiValidation module,
// which does not exist in main.
router.use((req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });

const authenticatedToken = require("../middleware/authMiddleware");
const { createNote, getNotes, getNoteById, updateNote, deleteNote } = require("../controllers/notesController");

router.post("/", authenticatedToken, createNote);
router.get("/", authenticatedToken, getNotes);
router.get("/:id", authenticatedToken, getNoteById);
router.patch("/:id", authenticatedToken, updateNote);
router.delete("/:id", authenticatedToken, deleteNote);

module.exports = router;