# Saved-data pagination and storage budgets

Stacked on #75. No schema migration, live database, deployment, shared service or
soak changes. The PostgreSQL fixtures use only generated disposable databases.

Notes/bookmarks/highlights list endpoints accept strict `limit` and numeric
`cursor` parameters and sort by descending immutable ID. SQL always filters the
authenticated owner before the cursor/limit. Notes default/max 20; other lists
default 50/max 100. Fetching one extra row determines the next cursor. Serialized
pages are capped at 512 KiB, with resumable cursors when bytes cut a page short.
Invalid query shapes/duplicates return controlled 400s; a single oversized legacy
item returns a controlled 413. All private route responses are no-store.

New requests explicitly ask for bounded pages and receive `{ items, hasMore,
nextCursor }`. For rollout compatibility, requests without pagination parameters
receive a bounded array plus X-Next-Cursor/X-Has-More headers. Old clients do not
automatically show additional pages; publish the server before the new client.
The new client has visible Load more controls and session-ownership guards on
late pages. No background request follows the global journal to completion.

Current-chapter bookmark/highlight requests support bookId/chapter filters.
The client separately loads that passage in bounded sequential pages (at most
20 bookmark / 10 highlight pages), so older saved colors/bookmarks do not vanish
because the journal's first page covers another location. Loaded context items
are deduplicated with journal pages, preserving newer local edits.

Per-user write limits: 1000 notes, 2 MiB aggregate note text, 2000 bookmarks and
10000 highlighted verses. A per-user PostgreSQL transaction advisory lock covers
the count/byte check and write, so concurrent requests cannot overshoot. Recoloring
existing highlights and note edits that free space still work at a limit.
Deletes remain available; legacy accounts above a quota can reduce their usage.
Violations return a controlled 409 with RESOURCE_LIMIT and a delete-older-items
message. #75's 32 KiB per-note/500-coordinate request limits remain enforced.

Tests cover cursor continuity/ownership, byte budgets, input rejection, note and
bookmark races, highlight recoloring at capacity, stale account pages, duplicate
page records, and current-chapter colors outside the global first page. Query
cancellation/pool limits are supplied by the independent follow-up to #77.

Remaining operational validation: product review of quota defaults, legacy large
items, hosted query plans and actual ingress/edge budgets. No production data was
queried or resized by this work.
