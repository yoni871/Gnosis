-- REFERENCE COPY ONLY. Do not execute for installation or upgrades.
-- Versioned migrations in database/migrations/bible/ are authoritative.
-- Mirrors the approved initial bible baseline; later changes belong in new migrations.
-- Bible project baseline: Scripture text and the Original Language data
-- that is joined to it. bible_books is owned here; the Commentary
-- project keeps a read-only copy, and the App project references book
-- ids that the application validates against this project.
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
    chapter_number INTEGER,
    CONSTRAINT unique_book_chapter UNIQUE (book_id, chapter_number)
);

-- stores the actual bible text
CREATE TABLE bible_verses (
    id SERIAL PRIMARY KEY,
    chapter_id INTEGER REFERENCES bible_chapters(id),
    translation_id INTEGER REFERENCES bible_translations(id),
    verse_number INTEGER,
    text TEXT,
    search_vector TSVECTOR,
    CONSTRAINT unique_chapter_translation_verse UNIQUE (
        chapter_id, translation_id, verse_number
    )
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

