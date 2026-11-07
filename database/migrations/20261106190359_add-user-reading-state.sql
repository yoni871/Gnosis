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

CREATE TABLE user_reading_state (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES bible_books(id),
    chapter_number INTEGER NOT NULL,
    translation TEXT NOT NULL,
    commentary_id INTEGER REFERENCES commentaries(id) ON DELETE SET NULL,
    verse_number INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Down Migration
DROP TABLE user_reading_state;
