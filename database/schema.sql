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
    text TEXT
);

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
    content TEXT
);

-- stores account info for users who create accounts
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

