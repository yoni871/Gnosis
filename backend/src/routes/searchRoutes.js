const express = require("express");
const pool = require("../db/db");
const router = express.Router();

router.get("/search/bible", (req, res) => {
    pool.query(
        `
        SELECT
            v.text,
            v.verse_number,
            c.chapter_number,
            b.name AS book
        FROM bible_verses v
        JOIN bible_chapters c
            ON v.chapter_id = c.id
        JOIN bible_books b
            ON c.book_id = b.id
        WHERE v.search_vector @@ plainto_tsquery('english', $1)
        `,
        [req.query.q],
        (error, result) => {
            if(error) {
                 res.status(500).json({
                    error: "No value found."
                 });
            } else {
                res.json(result.rows);
            }
        }
    )
});

router.get("/search/commentary", (req, res) => {
    pool.query(
        `
        SELECT e.content,
            e.start_chapter,
            e.start_verse,
            e.end_chapter,
            e.end_verse,
            e.title,
            b.name
        FROM commentary_entries e
        JOIN bible_books b ON e.book_id = b.id
        WHERE e.search_vector @@ plainto_tsquery('english', $1)
        `,
        [req.query.q],
        (error, result) => {
            if(error) {
                 res.status(500).json({
                    error: "No commentary found."
                 });
            } else {
                res.json(result.rows);
            }
        }
    )
})

module.exports = router;

