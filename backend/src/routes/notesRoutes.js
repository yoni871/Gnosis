const express = require("express")
const router = express.Router();

const authenticatedToken = require("../middleware/authMiddleware");
const { createNote, getNotes, getNoteById, updateNote, deleteNote } = require("../controllers/notesController");

router.post("/", authenticatedToken, createNote);
router.get("/", authenticatedToken, getNotes);
router.get("/:id", authenticatedToken, getNoteById);
router.patch("/:id", authenticatedToken, updateNote);
router.delete("/:id", authenticatedToken, deleteNote);

module.exports = router;