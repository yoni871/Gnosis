-- REFERENCE COPY ONLY. Do not execute for installation or upgrades.
-- Versioned migrations in database/migrations/commentary/ are authoritative.
-- Mirrors the approved initial commentary baseline; later changes belong in new migrations.
-- Commentary project baseline: commentaries, their sources, and the
-- commentary entries. commentary_entries keeps book_id as a plain
-- integer: the foreign key to bible_books lives in the Bible project,
-- and this project keeps a read-only copy of bible_books (below) so
-- the commentary search query can resolve book names without joining
-- another project.
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
    book_id INTEGER,
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

-- Read-only copy of bible_books (66 static rows, seeded by the same
-- seedBooks run as the Bible project). The Bible project owns the table;
-- the runtime role gets SELECT only on this copy. IF NOT EXISTS lets the
-- three baselines share one database in tests and local development,
-- where the Bible baseline already created the table. In a shared
-- database the Bible baseline must run before this one.
CREATE TABLE IF NOT EXISTS bible_books (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50),
    abbreviation VARCHAR(10),
    testament VARCHAR(2),
    book_order INTEGER
);

