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
            b.name AS book,
            bt.abbreviation AS translation
        FROM bible_verses v
        JOIN bible_chapters c
            ON v.chapter_id = c.id
        JOIN bible_books b
            ON c.book_id = b.id
        JOIN bible_translations bt
            ON v.translation_id = bt.id
        WHERE v.search_vector @@ plainto_tsquery('english', $1)
        AND bt.abbreviation = $2
        `,
        [req.query.q, req.query.translation || "BSB"],
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
        SELECT
            e.id,
            e.commentary_id,
            ts_headline(
                'english',
                e.content,
                plainto_tsquery('english', $1),
                'MaxWords=35, MinWords=15, MaxFragments=2'
            ) AS excerpt,
            e.start_chapter,
            e.start_verse,
            e.end_chapter,
            e.end_verse,
            e.title AS entry_title,
            b.name AS book,
            c.title AS commentary_title,
            s.name AS source
        FROM commentary_entries e
        JOIN commentaries c
            ON e.commentary_id = c.id
        JOIN sources s
            ON c.source_id = s.id
        JOIN bible_books b
            ON e.book_id = b.id
        WHERE e.search_vector @@ plainto_tsquery('english', $1)
        ORDER BY ts_rank(
            e.search_vector,
            plainto_tsquery('english', $1)
        ) DESC
        LIMIT 100
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

