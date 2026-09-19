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


