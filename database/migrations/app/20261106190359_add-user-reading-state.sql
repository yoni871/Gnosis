-- Up Migration
--
-- Resume where you left off (logged-in readers only).
--
-- One row per user holding the exact reading position: book, chapter,
-- translation, selected commentary, and focused verse. The reader saves
-- it (debounced) as the position changes; the landing page offers it
-- back as a "Continue reading" button. The position is restored through
-- the reader URL itself (/bible/:book/:chapter?translation=&commentary=
-- &verse=), so nothing else needs to know about it.
--
-- No grants are in this file: like the earlier auth migrations, the
-- operator applies them at deploy time. The app role needs
-- SELECT/INSERT/UPDATE on user_reading_state. See docs/ReadingState.md.
--
-- book_id and commentary_id are plain integers: their foreign keys
-- live in other projects (bible_books in the Bible project,
-- commentaries in the Commentary project), so the application validates
-- them before writing (see backend/src/controllers/readingStateController.js).

CREATE TABLE user_reading_state (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    translation TEXT NOT NULL,
    commentary_id INTEGER,
    verse_number INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Down Migration
DROP TABLE user_reading_state;
