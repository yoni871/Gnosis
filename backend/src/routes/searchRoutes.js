const express = require("express");
const { biblePool, commentaryPool } = require("../db/db");
const { cacheControl } = require("../middleware/cacheHeaders");
const router = express.Router();
const { validateSearch } = require("../utils/apiValidation");

// Search results are public and deterministic for a given query, and
// the data changes only on import — so a repeated search for a common
// term can be served from the edge for five minutes instead of
// re-running the full-text query. Shorter than the reference-data
// cache: a fresh import should show up quickly.
const cacheSearch = cacheControl({ maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 60 });

router.get("/search/bible", validateSearch, cacheSearch, (req, res) => {
    // Validation bounds text, page, limit and total offset before database work.
    // Rank/book/chapter/verse ordering keeps pagination deterministic.
    // F04: page is capped at 100 — at limit 100 that is OFFSET 9,900, and a
    // ranked top-100-per-page search has no useful result past it; deeper
    // pages are only a slow full scan. validateSearch already rejects page
    // 102+ with a 400, so the clamp covers page 101, the one page it allows
    // past the cap.
    const MAX_SEARCH_PAGE = 100;
    const page = Math.min(MAX_SEARCH_PAGE, Number(req.query.page || 1));
    const limit = Number(req.query.limit || 100);
    const offset = (page - 1) * limit;
    biblePool.query(
        `
        SELECT
            v.text,
            v.verse_number,
            c.chapter_number,
            b.name AS book,
            bt.abbreviation AS translation,
            COUNT(*) OVER() AS total
        FROM bible_verses v
        JOIN bible_chapters c
            ON v.chapter_id = c.id
        JOIN bible_books b
            ON c.book_id = b.id
        JOIN bible_translations bt
            ON v.translation_id = bt.id
        WHERE v.search_vector @@ plainto_tsquery('english', $1)
        AND bt.abbreviation = $2
        -- Ranked and capped like the commentary search: without this,
        -- a common word returned every match (6,489 verses / 1.5 MB
        -- for "Lord") in arbitrary order, and the results page rendered
        -- all of them. The top 100 by rank is the useful set.
        -- The tiebreak (book_order, chapter, verse) makes the order
        -- total: many verses share one rank, so rank alone is not a
        -- stable page boundary — without it, a verse could appear on
        -- two pages or on none.
        ORDER BY ts_rank(v.search_vector, plainto_tsquery('english', $1)) DESC,
            b.book_order, c.chapter_number, v.verse_number
        LIMIT $3 OFFSET $4
        `,
        [req.query.q, req.query.translation || "BSB", limit, offset],
        (error, result) => {
            if(error) {
                 res.status(500).json({
                    error: "No value found."
                 });
            } else {
                // The window total rides on every row; strip it from the
                // verse objects before responding.
                const total = result.rows.length ? Number(result.rows[0].total) : 0;
                res.json({
                    results: result.rows.map(({ total: _total, ...verse }) => verse),
                    total,
                    page,
                    limit,
                    hasMore: offset + result.rows.length < total,
                });
            }
        }
    )
});

router.get("/search/commentary", validateSearch, cacheSearch, (req, res) => {
    commentaryPool.query(
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

