const express = require("express");
const pool = require("../db/db");
const { cacheControl } = require("../middleware/cacheHeaders");
const router = express.Router();

// Search results are public and deterministic for a given query, and
// the data changes only on import — so a repeated search for a common
// term can be served from the edge for five minutes instead of
// re-running the full-text query. Shorter than the reference-data
// cache: a fresh import should show up quickly.
const cacheSearch = cacheControl({ maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 60 });

router.get("/search/bible", cacheSearch, (req, res) => {
    // Pagination design (offset-based: ?page= is 1-based, ?limit=
    // defaults to 100 and is clamped to 1-100, so no single response
    // can grow back to the old multi-MB payload). Offset fits here
    // because the result set is static between imports and the ORDER BY
    // below is fully deterministic — rank, then book/chapter/verse — so
    // a page boundary can neither skip nor repeat a verse. A cursor
    // would have to encode the float rank plus the tiebreak keys for
    // no benefit on a flat ranked list with a Load More button.
    // COUNT(*) OVER() returns the exact match total in the same scan,
    // so the UI can show "Showing 100 of 6,687" and know when to stop.
    // Page and limit are parsed defensively: non-numeric, zero, and
    // negative values fall back to the first page of 100.
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const offset = (page - 1) * limit;
    pool.query(
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

router.get("/search/commentary", cacheSearch, (req, res) => {
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

