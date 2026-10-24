-- HISTORICAL REFERENCE ONLY. Do not execute for installation or upgrades.
-- Authoritative schema history: database/migrations/. See docs/Database_Migrations.md.
-- Stores the Bible translations available in the application.
CREATE TABLE bible_translations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    abbreviation VARCHAR(20)
);

-- stores the books of the bible
CREATE TABLE bible_books (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50),
    abbreviation VARCHAR(10),
    testament VARCHAR(2),
    book_order INTEGER
);

-- Stores each chapter and connects it to a Bible book.
CREATE TABLE bible_chapters (
    id SERIAL PRIMARY KEY,
    book_id INTEGER REFERENCES bible_books(id), -- FOREIGN KEY referencing the bible books
    chapter_number INTEGER
);

-- stores the actual bible text
CREATE TABLE bible_verses (
    id SERIAL PRIMARY KEY,
    chapter_id INTEGER REFERENCES bible_chapters(id),
    translation_id INTEGER REFERENCES bible_translations(id),
    verse_number INTEGER,
    text TEXT,
    search_vector TSVECTOR
);
-- Speeds up full-text searches across Bible verses.
CREATE INDEX bible_verses_search_idx
ON bible_verses
USING GIN (search_vector);

-- Builds the searchable Bible text whenever a verse is inserted or edited.
CREATE OR REPLACE FUNCTION update_bible_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector(
        'english',
        COALESCE(NEW.text, '')
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bible_search_vector_trigger
BEFORE INSERT OR UPDATE OF text
ON bible_verses
FOR EACH ROW
EXECUTE FUNCTION update_bible_search_vector();

--stores info about the author, publisher, and licensing
CREATE TABLE sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200),
    type VARCHAR(50),
    description TEXT,
    license VARCHAR(200),
    created_at TIMESTAMP
);

--Stores info about each commentary
CREATE TABLE commentaries (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES sources(id),
    title VARCHAR(200),
    description TEXT
);

-- Stores the actual commentary text and connects it to the bible passage
CREATE TABLE commentary_entries (
    id SERIAL PRIMARY KEY,
    commentary_id INTEGER REFERENCES commentaries(id),
    book_id INTEGER REFERENCES bible_books(id),
    start_chapter INTEGER,
    start_verse INTEGER,
    end_chapter INTEGER,
    end_verse INTEGER,
    content TEXT,
    title TEXT,
    search_vector TSVECTOR,
    CONSTRAINT unique_commentary_passage UNIQUE (
        commentary_id,
        book_id,
        start_chapter,
        start_verse,
        end_chapter,
        end_verse
    )
);

-- Speeds up full-text searches across commentary entries.
CREATE INDEX commentary_entries_search_idx
ON commentary_entries
USING GIN (search_vector);

-- Builds the searchable text whenever commentary is inserted or edited.
CREATE OR REPLACE FUNCTION update_commentary_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector(
        'english',
        COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, '')
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER commentary_search_vector_trigger
BEFORE INSERT OR UPDATE OF title, content
ON commentary_entries
FOR EACH ROW
EXECUTE FUNCTION update_commentary_search_vector();

-- stores account info for users who create accounts
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Stores passage-based notes created by authenticated users.
CREATE TABLE notes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES bible_books(id),
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
    book_id INTEGER NOT NULL REFERENCES bible_books(id),
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
    book_id INTEGER NOT NULL REFERENCES bible_books(id),

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


