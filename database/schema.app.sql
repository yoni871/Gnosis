-- REFERENCE COPY ONLY. Do not execute for installation or upgrades.
-- Versioned migrations in database/migrations/app/ are authoritative.
-- Mirrors the approved initial app baseline; later changes belong in new migrations.
-- App project baseline: users and the user-owned data that belongs to
-- them (notes, bookmarks, highlights), plus the tables the application
-- runtime writes (sessions, tokens, rate limits, reading state, licensed
-- cache). See database/migrations/bible/ and
-- database/migrations/commentary/ for the other two projects.
--
-- notes, bookmarks and highlights keep book_id as a plain integer: the
-- foreign key to bible_books lives in the Bible project, so the
-- application validates book_id against the Bible pool before writing
-- (see backend/src/controllers/* and backend/src/services/highlightsService.js).
-- The Bible project owns bible_books; this project never creates it.

-- stores account info for users who create accounts
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    first_name VARCHAR(100),
    last_name VARCHAR(100)
);

-- Stores passage-based notes created by authenticated users.
CREATE TABLE notes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL,
    start_chapter INTEGER NOT NULL,
    start_verse INTEGER NOT NULL,
    end_chapter INTEGER NOT NULL,
    end_verse INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Speeds up loading all notes belonging to the current user.
CREATE INDEX notes_user_id_idx
ON notes(user_id);

-- Stores Bible passages bookmarked by authenticated users.
CREATE TABLE bookmarks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL,
    start_chapter INTEGER NOT NULL,
    start_verse INTEGER NOT NULL,
    end_chapter INTEGER NOT NULL,
    end_verse INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_bookmark UNIQUE (
        user_id,
        book_id,
        start_chapter,
        start_verse,
        end_chapter,
        end_verse
    )
);

-- Speeds up loading all bookmarks belonging to the current user.
CREATE INDEX bookmarks_user_id_idx
ON bookmarks(user_id);

-- Stores colored passages belonging to authenticated users.
CREATE TABLE highlights (
    id SERIAL PRIMARY KEY,

    -- Delete a user's highlights if their account is deleted.
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Identify the Bible book independently of translation.
    -- Validated against the Bible project by the application; no
    -- foreign key crosses the project boundary.
    book_id INTEGER NOT NULL,

    -- One row represnts one highlighted verse.
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    -- Store the chosen RGB color; the frontend applies readable transparency.
    color VARCHAR(7) NOT NULL DEFAULT '#FFD54F',

    -- Record when the highlight was created and last changed.
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Require "#" followed by exactly six hexadecimal characters.
        CONSTRAINT highlights_valid_color CHECK (
            color ~ '^#[0-9A-Fa-f]{6}$'
        ),

    -- Chapters and verses must be positive.
    CONSTRAINT highlights_positive_passage CHECK (
        chapter > 0 AND verse > 0
    ),

    -- only one highlight color per user and verse
    CONSTRAINT highlights_unique_verse UNIQUE (
        user_id,
        book_id,
        chapter,
        verse
    )
);
-- Speed up loading a user's highlights within a book.
CREATE INDEX highlights_user_book_idx
ON highlights(user_id, book_id);



