# Phase 5: independent encrypted backups and recovery

Status: **tooling rehearsed locally; off-site backup gate remains OPEN**. This document
does not attest to the current Neon plan, restore window, scheduled jobs, object
storage, or any live backup. No hosted database was queried for this work.

## Data and recovery priorities

| Project | Data | Recovery treatment |
| --- | --- | --- |
| App | Accounts and password hashes; notes, bookmarks, highlights, reading state; MFA factors and recovery codes; passkeys; sessions and refresh-token hashes; email verification/reset state; security events | **Non-reconstructible.** Back up the complete database. Sessions are sensitive even after restore: revoke or carefully assess all restored sessions before accepting traffic. |
| Bible | Imported licensed/public-domain Scripture and original-language data, translation metadata, canonical book IDs | Often reconstructible only from separately preserved, versioned source files and licenses. Back up the complete database to preserve IDs, edits, and an immediately usable recovery point. |
| Commentary | Sources, commentators, entries, and the copied book catalog | Reimport may be possible only if source artifacts and import versions survive. Back up the complete database. |

The App and Commentary databases contain plain integer references to Bible IDs;
App reading state also references Commentary IDs. PostgreSQL cannot enforce
foreign keys across the three projects. Restore them as one **set** and run the
cross-project checks before serving traffic. The tool checks these references,
table row counts, and the App FORCE RLS flags after an isolated restore. It does
not prove that every row value is semantically correct or that a concurrent
three-database backup is one atomic point in time.

## Proposed operational policy (requires approval before activation)

- Take one encrypted three-project bundle every **6 hours**, with alerting if a
  complete verified bundle has not arrived within 7 hours. Target RPO is up to
  6 hours **after the schedule is operating**; RTO must be measured in a hosted
  rehearsal and is not yet known.
- Store encrypted bundles in independent object storage in a separate account
  from Neon, with versioning and immutable retention where available. The
  proposed schedule is 14 days of six-hourly bundles, 30 days of daily copies,
  and 90 days of monthly copies. Configure lifecycle rules on the destination;
  do not prune the last verified bundle. The privacy policy and account-deletion
  documentation currently describe a much shorter backup deletion window and
  **must be reconciled and approved before this retention is activated**.
- Generate a unique 32-byte backup key in an approved secret manager. Supply
  its 64-character hex encoding as `GNOSIS_BACKUP_KEY_HEX` only to the backup
  runner. Preserve previous keys until every bundle they protect has expired.
  Loss of the key makes independent backups unrecoverable. Limit key access to
  backup and incident responders; separate read, write, delete, and lifecycle
  permissions on the object store. Never place keys or database URLs in Git,
  logs, command arguments, or an artifact directory.
- Use a dedicated backup identity with `SELECT` on all project tables and
  effective `BYPASSRLS` on the App project's FORCE RLS tables. The runtime App
  role must remain `NOBYPASSRLS`. PostgreSQL `pg_dump` defaults to
  `row_security=off` and fails if it would omit RLS rows; the tool additionally
  rejects an App source role that cannot bypass FORCE RLS. **Do not use
  `--enable-row-security`, owner-only dumps, or a temporary NO FORCE window on
  a live source** for scheduled backups. If Neon cannot provision a suitable
  backup identity, use an isolated, authorized Neon branch/copy procedure and
  document its completeness before enabling the schedule.
- Run a decrypt-and-archive verification after every upload, then perform a
  full three-project isolated restore at least monthly and after backup tool,
  schema, encryption-key, or PostgreSQL-version changes. Record duration,
  counts, FORCE flags, reference-check result, and the encrypted bundle ID.
  Keep sanitized evidence; do not retain restored personal data outside the
  protected drill environment.

The proposed backup schedule should use a private runner and an approved
object-store upload job. This PR intentionally adds **no active CI schedule or
live credentials**. A repository CI runner must not gain production database
credentials merely by merging code.

## Bundle format and safeguards

`backend/scripts/db/encrypted-backup.js` accepts `backup`, `verify`, and
`restore`. Each backup runs `pg_dump --format=custom` against an exported
repeatable-read snapshot for each project. A table-count/RLS inventory is read
from that same database snapshot. Dumps stream through AES-256-GCM into
`app.dump.gnb`, `bible.dump.gnb`, and `commentary.dump.gnb`; plaintext dumps
are never written during backup. The manifest, including counts and timestamps,
is also AES-256-GCM encrypted. Artifacts are created with mode `0600` inside a
`0700` bundle directory. An incomplete bundle lacks the manifest and fails
verification. `verify` checks all three ciphertext hashes, authentication
tags, and PostgreSQL archive lists before reporting success.

The three snapshots are taken sequentially, not atomically across projects.
For a recovery-grade set, pause application writes/imports and record the
maintenance interval. Without that freeze, cross-project references can change
between snapshots even though each individual dump is internally consistent.

`restore` refuses remote targets, duplicate targets, and nonempty targets.
It authenticates all three dumps before writing any target. During restore it
creates temporary plaintext custom archives (mode `0600` under a `0700`
temporary directory), removes them on completion/failure, and checks row
counts, FORCE RLS, and cross-project IDs. For a real drill, run on an encrypted
ephemeral volume or protected host: file deletion is not secure erasure.
The tool never promotes or rewires an application database.

## Operator activation and recovery runbook

1. **Authorize** the backup identity, destination account, key custody,
   retention/privacy terms, and maintenance or branch strategy. Check the
   actual Neon restore window and PITR capability for **each** project in the
   console; do not rely on the older six-hour claim in the incident runbook.
   Use a `pg_dump` client compatible with every source and a `pg_restore`
   client matching the isolated target's PostgreSQL major version. A newer
   dump client can emit settings an older restore server rejects; the
   disposable rehearsal selects PostgreSQL 14 or 18 to match installed
   client tools, and fails if the two clients disagree.
2. Install locked backend dependencies and PostgreSQL client tools on the
   private runner. Set `GNOSIS_BACKUP_APP_URL`, `GNOSIS_BACKUP_BIBLE_URL`, and
   `GNOSIS_BACKUP_COMMENTARY_URL` to distinct **direct** PostgreSQL URLs.
   Remote URLs must include `sslmode=verify-full`; set
   `GNOSIS_BACKUP_ALLOW_REMOTE=1` only in the approved runner. Keep URLs and
   key in the secret manager, not shell history. Run:

   ```sh
   node backend/scripts/db/encrypted-backup.js backup /protected/backup-staging
   node backend/scripts/db/encrypted-backup.js verify /protected/backup-staging/gnosis-<bundle-id>
   ```

3. Upload only the four `.gnb` files (three dumps and the sealed
   manifest) as one bundle. Verify the uploaded copy by downloading it to a
   protected runner and running `verify` there. Alert and retain the previous
   good bundle if any stage fails. Apply the approved destination lifecycle.
4. For a drill or incident, identify a complete bundle and its key. Create
   three **new, empty, disposable loopback** PostgreSQL databases on an
   isolated runner. Set `GNOSIS_RESTORE_APP_URL`,
   `GNOSIS_RESTORE_BIBLE_URL`, and `GNOSIS_RESTORE_COMMENTARY_URL` to those
   targets, then run:

   ```sh
   node backend/scripts/db/encrypted-backup.js verify /protected/bundle
   node backend/scripts/db/encrypted-backup.js restore /protected/bundle
   ```

5. Review the restore report and application smoke checks. Confirm App RLS
   roles/grants, migration histories, and sequence ownership separately; a
   successful local restore does not recreate Neon role grants or environment
   secrets. Reconcile the recovered App references with Bible and Commentary
   IDs, then decide a coordinated cutover point. **Do not point production at
   restored data without separate approval.** After a real rollback, revoke
   restored sessions and recovery credentials as appropriate to the incident,
   verify MFA encryption-key versions, and rotate credentials only under the
   incident plan.
6. Preserve the incident timeline, exact bundle ID, three source snapshot
   timestamps, validation output, measured RPO/RTO, and approved cutover
   decision. Dispose of synthetic drill databases and temporary artifacts.

For a recent single-project corruption, Neon point-in-time recovery may be a
faster option inside its **verified** restore window. It is not an independent
off-site backup. A coordinated three-project restore still needs application
write freeze, timestamp selection, and cross-project validation.

## Local evidence and remaining gate

Run `cd backend && npm run test:backup`. The disposable PostgreSQL 14/18 rehearsal
creates synthetic App, Bible, and Commentary sources and three empty targets;
it verifies encryption/authentication, FORCE RLS rejection for a restricted
source, miswired-source rejection, complete restore, cross-project reference
failure detection, wrong-key rejection, corruption rejection, and cleanup.
No live data or hosted permission was used.

The **Phase 5 launch gate remains FAIL** until the operator activates an
approved off-site schedule, demonstrates an uploaded encrypted bundle from
all three authorized sources, completes an isolated restore from that uploaded
bundle, records measured RPO/RTO, reconciles privacy retention, and obtains
independent security and QA sign-off. This repository work is a rehearsal and
activation plan, not evidence that production backups exist.

References: [PostgreSQL `pg_dump` and RLS behavior](https://www.postgresql.org/docs/current/app-pgdump.html),
[PostgreSQL RLS bypass rules](https://www.postgresql.org/docs/current/ddl-rowsecurity.html),
[Neon recovery background](https://neon.com/blog/database-recovery-strategies-to-help-you-sleep-at-night).
