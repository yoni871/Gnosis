# Private schema snapshot review — prerequisite to baseline approval

The current baseline candidate is provisional. Stale schema.sql is not evidence
of the application's actual schema. Do not adopt it on local/Neon application
databases until the following metadata has been compared and the intended schema
has explicit approval. These commands are for the owner to run; no Neon connection
is made by the implementation or tests.

## What to collect

From both the existing local `bible_commentary` database and the deployed Neon
application database, collect public-schema definitions (tables, columns/types,
defaults, nullability, keys, indexes, sequences, functions, triggers, views and
policies), PostgreSQL version, schema names, extensions, and configured search
path. Schema inventory identifies whether another application schema also needs
review. No row data, current sequence values, role passwords or connection URLs
are requested.

Use pg_dump/psql from a stable PostgreSQL client version at least as new as the
servers, preferably the same version for both snapshots. An older pg_dump refuses
a newer server. `pg_dump --version` checks the client without connecting. The
implementation host currently has client 14.17; that may be too old for Neon.

## Exact read-only commands (Bash)

Run outside the repository. No passwords or connection URLs go in command lines.
Passwords are entered only at PostgreSQL's hidden prompt. Disable shell tracing.
The generated directory is private, outside the repository; do not commit it.

```bash
set +x
umask 077
snapshot_dir=$(mktemp -d "${TMPDIR:-/tmp}/gnosis-schema-review.XXXXXX")

collect_schema_snapshot() (
    snapshot_label=$1
    # Remove inherited routing/password settings so the chosen target is explicit.
    unset PGSERVICE PGSERVICEFILE PGHOSTADDR PGPASSWORD PGDATABASE PGUSER PGHOST PGPORT
    export PGHOST=$2 PGPORT=$3 PGDATABASE=$4 PGSSLMODE=$5
    read -r -p "$snapshot_label PostgreSQL role: " PGUSER
    export PGUSER
    export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=60000'
    export PGCONNECT_TIMEOUT=10
    export PGAPPNAME=gnosis-schema-review

    pg_dump --schema-only --schema=public --format=plain \
        --no-owner --no-privileges --no-comments --no-security-labels \
        --no-publications --no-subscriptions --lock-wait-timeout=5s \
        --password --file="$snapshot_dir/$snapshot_label.schema.sql" || exit 1

    psql -X --password --set=ON_ERROR_STOP=1 \
        --output="$snapshot_dir/$snapshot_label.metadata.txt" <<'SQL'
BEGIN READ ONLY;
SELECT current_setting('server_version') AS server_version;
SELECT current_setting('search_path') AS configured_search_path;
SELECT nspname AS schema_name
FROM pg_namespace
WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
ORDER BY nspname;
SELECT e.extname, e.extversion, n.nspname AS extension_schema
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
ORDER BY e.extname;
COMMIT;
SQL
)

# Use your actual local PostgreSQL port if it is not 5432.
collect_schema_snapshot local 127.0.0.1 5432 bible_commentary disable

# Enter only the direct Neon hostname, not a URL or -pooler hostname.
read -r -p 'Direct Neon hostname: ' snapshot_neon_host
read -r -p 'Neon application database name: ' snapshot_neon_database
read -r -p 'Trusted CA bundle file path for Neon TLS: ' snapshot_neon_ca
export PGSSLROOTCERT="$snapshot_neon_ca"
collect_schema_snapshot neon "$snapshot_neon_host" 5432 "$snapshot_neon_database" verify-full
unset PGSSLROOTCERT snapshot_neon_host snapshot_neon_database snapshot_neon_ca
```

The CA bundle must be an existing trusted bundle appropriate for the Neon server
certificate, not a downloaded untrusted certificate. If export fails, stop and
resolve the client/TLS/permission issue; do not disable certificate verification.
Use an authorized read-only role with sufficient schema visibility if available;
these commands enforce read-only sessions and do not create or change roles.
`pg_dump` reads a consistent snapshot and takes normal read locks; the separate
metadata query is also read-only. Avoid concurrent manual DDL during collection.

This intentionally exports only the public application schema, suppresses object
owners/grants/comments, and excludes publication/subscription definitions. It does
not export row data or role passwords. Schema definitions can themselves contain
hardcoded secrets in function bodies, defaults, or foreign-table options. Inspect
both files privately before sharing; redact any embedded secrets with an explicit
placeholder and retain structural details. If inventory shows other application
schemas, stop and identify those before requesting additional targeted snapshots;
do not send a whole-cluster dump or pg_dumpall.

Share the reviewed `local.schema.sql`, `local.metadata.txt`, `neon.schema.sql`, and
`neon.metadata.txt` privately in this conversation. Do not commit or attach raw
snapshots to a public issue/PR, and do not share .env, connection strings, passwords,
row exports, or credentials. These are review artifacts, not restore scripts.
Do not execute either exported SQL file against any database.

## Comparison and stop point

After receiving the reviewed metadata, compare local, Neon, application SQL,
importer SQL and the baseline candidate. Report a matrix of differences including:

- users.first_name/last_name presence, types, defaults and nullability;
- bible_chapters uniqueness on (book_id, chapter_number), including exact index
  and constraint definitions required by ON CONFLICT;
- verse uniqueness described by documentation versus actual/importer requirements;
- all other tables, column definitions, constraints/indexes, sequences, functions,
  triggers, extensions, schemas and relevant search-path differences.

Do not infer definitions from column names or treat source documentation as proof
of deployed state. If metadata is incomplete or redacted in a structural location,
report the unknowns. Stop after the comparison and obtain explicit approval of the
intended schema before modifying baseline SQL/catalog or adding reconciliation
migrations. This review does not authorize Neon access or changes.
