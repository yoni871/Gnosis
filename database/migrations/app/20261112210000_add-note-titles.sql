-- Up Migration
-- Titles are optional at the storage layer so every existing note remains valid.
ALTER TABLE notes ADD COLUMN title varchar(200);

-- Down Migration
ALTER TABLE notes DROP COLUMN title;
