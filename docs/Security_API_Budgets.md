# API validation and safe diagnostics

Audit F02/F04 follow-up. No database files, schema, migrations, authentication
handlers, token or session behavior are changed.

- Application controllers and highlight/provider background catches log only
  constant operation names, five-character database codes and server-generated
  correlation IDs. Error objects, messages, stack traces and private values
  never reach those sinks. Database pool startup/error logging remains Muse 1's
  scope; authentication logging remains Muse 3's scope. F02 is therefore not
  fully closed until those independent layers are checked.
- Search requires one nonblank string up to 256 UTF-8 bytes, a bounded translation
  abbreviation, strict positive decimal pagination, limit <=100 and offset
  <=10,000. Invalid input returns 400 before SQL, rather than coercing prefixes
  or silently clamping. Successful search response shapes stay the same.
- Search has a bounded per-worker socket-IP budget (60/minute, 4096 buckets,
  eight in-flight requests). Rejections are uncached 429s. This is local defense,
  not a cross-instance quota. Reverse-proxied users may share a bucket. Edge or
  distributed limits still require deployment-specific review. Database work
  can outlive disconnected requests; statement timeouts remain Muse 1's scope.
- Notes accept known typed fields, positive bounded ordered coordinates and
  nonblank content <=32 KiB (UTF-8). Coordinate edits must include all four
  endpoints so partial edits cannot create an unvalidated range. Content-only
  edits remain supported. Coordinate bounds are sanity limits, not proof that
  every submitted verse exists in the selected book.
- Saved-resource route IDs must be positive decimal PostgreSQL integer IDs.
  Highlight batches cap at 500 coordinates, each <=1000.
- INVALID_PASSAGE responses use constant public text instead of error.message.

Remaining F04: saved-collection pagination and frontend UX, atomic per-user
storage quotas, distributed request budgets, auth refresh limits, and database
statement/lock timeouts. These need coordinated database/auth/product work;
this PR does not claim to close F04 or production release readiness.
