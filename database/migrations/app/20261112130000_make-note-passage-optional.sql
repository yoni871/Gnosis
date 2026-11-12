-- Up Migration
-- Notes are independent documents. Existing passage coordinates remain intact,
-- while new notes may rely on Scripture references embedded in their content.
ALTER TABLE notes
    ALTER COLUMN book_id DROP NOT NULL,
    ALTER COLUMN start_chapter DROP NOT NULL,
    ALTER COLUMN start_verse DROP NOT NULL,
    ALTER COLUMN end_chapter DROP NOT NULL,
    ALTER COLUMN end_verse DROP NOT NULL;

-- Down Migration
-- Refuse to restore NOT NULL while independent notes exist; operators must
-- deliberately attach or remove them before attempting the rollback again.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM notes
        WHERE book_id IS NULL
           OR start_chapter IS NULL
           OR start_verse IS NULL
           OR end_chapter IS NULL
           OR end_verse IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot restore passage requirements while independent notes exist';
    END IF;
END $$;

ALTER TABLE notes
    ALTER COLUMN book_id SET NOT NULL,
    ALTER COLUMN start_chapter SET NOT NULL,
    ALTER COLUMN start_verse SET NOT NULL,
    ALTER COLUMN end_chapter SET NOT NULL,
    ALTER COLUMN end_verse SET NOT NULL;
