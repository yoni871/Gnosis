# Resume Where You Left Off

Logged-in readers return to the exact spot they left: book, chapter,
translation, selected commentary, and focused verse. The landing page
offers it back as a **Continue reading** button; there is no
auto-redirect — the reader chooses to go back. Logging in is the one
exception: after a successful login the reader is taken straight to
the saved position (the button is for coming back mid-session, not
for the login itself). When nothing is saved, or the saved position
cannot be loaded, login lands on Genesis 1 as before.

## How it works

- **Saving.** The study page saves the current position whenever the
  reader moves (a new chapter, translation, commentary, or focused
  verse). Reads are cheap here — one indexed upsert on our own
  database, no publisher call — so every move is saved as it happens,
  including the last one before the reader leaves. A failed save is
  silent; the next move retries, and the reader never blocks on it.
- **Restoring.** The position is restored through the reader URL
  itself (`/bible/:book/:chapter?translation=&commentary=&verse=`),
  which the study page already honors, including scrolling to the
  focused verse. The Continue button is just a link to that URL.
- **The button.** On the landing page, a logged-in reader with a saved
  position sees **Continue reading →** as the primary hero button (with
  a small `Genesis 1 · ESV` note under it) instead of Start Exploring.
  Guests and readers with nothing saved see the page exactly as before.
- **Privacy.** One row per user (`user_reading_state`, keyed by
  `user_id`). It is deleted with the account (`ON DELETE CASCADE`) and
  a deleted commentary clears only the commentary (`ON DELETE SET NULL`).
  Writes are scoped by the reader's own token, so a save can never land
  under a different account.

## Endpoints

Both behind `authenticateToken` (`GET /api/reading-state`, `PUT
/api/reading-state`).

- `GET /api/reading-state` → the saved row (`user_id, book_id,
  chapter_number, translation, commentary_id, verse_number, updated_at`,
  plus `book`, the book name) or `404 { "error": "No saved reading
  position." }` when nothing is saved.
- `PUT /api/reading-state` with `{ bookId, chapter, translation,
  commentaryId?, verse? }` → upserts the row and returns it. Validates
  that the book, translation, and commentary (when given) exist;
  `400` for a missing or invalid position or an unknown
  book/translation/commentary.

## Migration

`database/migrations/20261106190359_add-user-reading-state.sql` creates
`user_reading_state`; its catalog delta is
`database/migration-catalogs/20261106190359_add-user-reading-state.catalog.json`
(the delta is pinned by the migration suite — a migration must never
ship without a current one).

## Operator steps

The app role needs `SELECT/INSERT/UPDATE` on `user_reading_state`.
Apply the migration and the grants on the preview branch first, then on
production at promotion time:

```sql
GRANT SELECT, INSERT, UPDATE ON user_reading_state TO gnosis_preview_app;
-- at production promotion:
GRANT SELECT, INSERT, UPDATE ON user_reading_state TO gnosis_app;
```

No new environment variables. Nothing else to configure.
