'use strict';
// Verify a restored Neon branch against its source branch (read-only).
//
// Usage:
//   RESTORE_SOURCE_DATABASE_URL=<direct source URL> \
//   RESTORE_TARGET_DATABASE_URL=<direct restored-branch URL> \
//   node backend/scripts/db/verify-restore.js
//
// Both URLs must be direct (not -pooler) endpoints. Remote URLs require
// sslmode=verify-full; loopback URLs (local restore tests) connect plain,
// with no certificates — the same rule as the OL importer.
// The script issues SELECTs only, except for one deliberate exception
// forced by FORCE ROW LEVEL SECURITY (PR #95): the table owner is
// constrained by RLS too when FORCE is on, so an owner-context count
// over an RLS table reads zero rows and 0 = 0 would falsely pass. When
// a connection is the table owner (or a superuser), the script
// temporarily runs ALTER TABLE ... NO FORCE ROW LEVEL SECURITY on the
// FORCE'd RLS tables, runs the counts/hashes, then re-enables FORCE in
// a finally and verifies relforcerowsecurity — a failure mid-run never
// leaves FORCE off. The window only affects owner-context access: the
// app role is constrained by RLS with or without FORCE, so application
// behaviour is unchanged throughout. When a connection is NOT able to
// ALTER a FORCE'd table (e.g. a read-only role), the script cannot
// lift FORCE: those tables are SKIPPED with a loud warning and exit 1,
// never compared as 0 = 0. It also compares FORCE flags between source
// and target and fails if the restored branch lost FORCE. Run it with
// a read-only role or the owner. It never prints a connection string,
// password, or row data — only table names, counts, and hashes.
//
// What it checks, per public table present on the source:
//   * row count matches on the restored branch;
//   * for bible_verses and commentary_entries, an md5 over the ordered
//     id list also matches (catches silent row substitution);
//   * the pgmigrations history (when present) has the same row count and
//     the same migration names in the same order.
//   * the FORCE ROW LEVEL SECURITY flags on the RLS tables agree between
//     source and target — a restored branch that lost FORCE is a broken
//     restore even when the row counts match.
// Exit 0 when everything matches, 1 on any mismatch, on any error, or
// when RLS tables had to be skipped because the connection could not
// lift FORCE (re-run those with the owner URL).
//
// A restored branch is created by the operator (Neon console or API:
// create a branch with parent_id + parent_timestamp inside the 6-hour
// restore window), verified with this script, and then deleted. Creating
// the branch, and deleting it afterwards, are operator steps that need
// Yonatan's approval — this script never creates or deletes anything.

const { Client } = require('pg');

function connectionConfig(value, label) {
    if (!value) throw new Error(`${label} is required.`);
    let url;
    try { url = new URL(value); } catch { throw new Error(`${label} is not a valid URL.`); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
        throw new Error(`${label} must be a PostgreSQL URL.`);
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!host || !url.pathname.slice(1) || !url.username || !url.password) {
        throw new Error(`${label} requires an explicit host, database, user, and password.`);
    }
    if (host.includes('-pooler')) {
        throw new Error(`${label} must be a direct endpoint, not a -pooler host.`);
    }
    const config = {
        host, port: Number(url.port) || 5432,
        database: decodeURIComponent(url.pathname.slice(1)),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        connectionTimeoutMillis: 60000, statement_timeout: 60000,
    };
    // Loopback (local restore tests) has no certificates: plain.
    // Remote (Neon) requires verified TLS, exactly like the migration
    // runner and the OL importer — the URL must also carry
    // sslmode=verify-full, so a mis-pasted URL fails loudly.
    if (['127.0.0.1', '::1', 'localhost'].includes(host)) {
        config.ssl = false;
    } else {
        if (url.searchParams.get('sslmode') !== 'verify-full') {
            throw new Error(`${label} requires sslmode=verify-full.`);
        }
        config.ssl = { rejectUnauthorized: true };
    }
    return config;
}

async function warmUp(client) {
    // Neon Free computes scale to zero; a cold endpoint can take 10-60 s
    // to wake. Warm it once so the checks do not time out on first use.
    await client.query('SELECT 1');
}

async function publicTables(client) {
    const result = await client.query(
        "SELECT table_name FROM information_schema.tables " +
        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name");
    return result.rows.map((row) => row.table_name);
}

async function countRows(client, table) {
    const result = await client.query(`SELECT count(*)::text AS n FROM "${table}"`);
    return result.rows[0].n;
}

async function idHash(client, table) {
    const result = await client.query(
        `SELECT md5(string_agg(id::text, ',' ORDER BY id)) AS h FROM "${table}"`);
    return result.rows[0].h;
}

// Migration histories live in per-project tables (pgmigrations_app,
// pgmigrations_bible, pgmigrations_commentary); production's pre-split
// history is the single pgmigrations table. Returns a map of table name
// to ordered migration names, for the tables that exist on this branch.
async function migrationHistory(client) {
    const histories = {};
    for (const table of ['pgmigrations', 'pgmigrations_app', 'pgmigrations_bible', 'pgmigrations_commentary']) {
        try {
            const result = await client.query(`SELECT name FROM ${table} ORDER BY id`);
            histories[table] = result.rows.map((row) => row.name);
        } catch {
            // Table absent on this branch — not an error.
        }
    }
    return histories;
}

const HASH_TABLES = new Set(['bible_verses', 'commentary_entries']);

// The per-user tables under FORCE ROW LEVEL SECURITY (PR #95 plus the
// fix pass, which extends the original four to the three MFA/device
// tables; mfa_challenges is a documented exclusion with no policy, so
// it is not listed). Detection below is dynamic — only tables that
// actually have FORCE on a given branch get the NO FORCE treatment —
// so this works both before and after the extension lands.
const RLS_TABLES = ['notes', 'bookmarks', 'highlights', 'user_reading_state',
    'user_mfa', 'mfa_recovery_codes', 'known_login_devices'];

// FORCE RLS state for the RLS tables on this connection: whether FORCE
// is on, and whether the connected user can ALTER the table — the table
// owner, a member of the owning role, or a superuser (local test
// clusters). Only such a connection can lift FORCE; anything else
// reads zero rows on a FORCE'd table.
async function rlsTableStates(client) {
    const result = await client.query(
        `SELECT c.relname AS table_name, c.relforcerowsecurity AS forced,
                (pg_has_role(current_user, c.relowner, 'MEMBER')
                 OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)) AS can_alter
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)
         ORDER BY c.relname`,
        [RLS_TABLES]);
    return result.rows;
}

// Temporarily lift FORCE on the RLS tables this connection can ALTER,
// so the owner-context counts below see real rows instead of zero.
// Records the lifted tables on `lift` (each table is recorded only
// after its ALTER succeeds, so a failure halfway still leaves an exact
// list to restore), the tables this connection cannot lift on
// `lift.skipped`, and the as-found FORCE flags on `lift.statesBefore`.
// The as-found flags matter: the flag comparison in main() must use
// them, because this script's own re-FORCE would otherwise mask a
// target that arrived without FORCE. Tables without FORCE (e.g. a
// pre-RLS branch) need no dance at all.
async function liftForce(client, label, lift) {
    lift.connected = true;
    const states = await rlsTableStates(client);
    lift.statesBefore = states;
    const forced = states.filter((row) => row.forced);
    lift.skipped = forced.filter((row) => !row.can_alter).map((row) => row.table_name);
    for (const row of forced) {
        if (!row.can_alter) {
            continue;
        }
        await client.query(`ALTER TABLE "${row.table_name}" NO FORCE ROW LEVEL SECURITY`);
        lift.lifted.push(row.table_name);
    }
    if (lift.skipped.length) {
        console.error(
            `WARNING (${label}): cannot verify RLS tables ${lift.skipped.join(', ')} — ` +
            'this connection cannot ALTER them, so it cannot lift FORCE ROW LEVEL SECURITY ' +
            'and reads zero rows on those tables. SKIPPING their row-count comparison; ' +
            're-run with the owner URL to verify them. This is NOT a pass.');
    }
    return lift;
}

// Re-enable FORCE on every table liftForce lifted, then verify the
// flags in pg_class. Throws (loudly) if any flag is not back on — the
// caller runs this in a finally, so a failure here must never be
// swallowed: leaving FORCE off is worse than a failed verification.
// Each table is attempted even if another fails, so one bad ALTER
// cannot strand the rest.
async function restoreForce(client, lifted, label) {
    const errors = [];
    for (const table of lifted) {
        try {
            await client.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
        } catch (error) {
            errors.push(`${table}: ${error.message}`);
        }
    }
    try {
        const states = await rlsTableStates(client);
        const byName = new Map(states.map((row) => [row.table_name, row.forced]));
        const stillOff = lifted.filter((table) => byName.get(table) !== true);
        if (stillOff.length) {
            errors.push(`FORCE ROW LEVEL SECURITY still off on: ${stillOff.join(', ')}`);
        }
    } catch (error) {
        errors.push(`could not verify FORCE flags after re-enabling: ${error.message}`);
    }
    if (errors.length) {
        throw new Error(
            `${label}: FAILED to restore FORCE ROW LEVEL SECURITY — ${errors.join('; ')}. ` +
            'Re-enable it manually before relying on this database.');
    }
}

async function main() {
    const source = new Client(connectionConfig(process.env.RESTORE_SOURCE_DATABASE_URL, 'RESTORE_SOURCE_DATABASE_URL'));
    const target = new Client(connectionConfig(process.env.RESTORE_TARGET_DATABASE_URL, 'RESTORE_TARGET_DATABASE_URL'));
    const checks = [];
    const sourceLift = { connected: false, lifted: [], skipped: [], statesBefore: [] };
    const targetLift = { connected: false, lifted: [], skipped: [], statesBefore: [] };
    try {
        await source.connect();
        await target.connect();
        await warmUp(source);
        await warmUp(target);
        await liftForce(source, 'source', sourceLift);
        await liftForce(target, 'target', targetLift);
        const skipped = new Set([...sourceLift.skipped, ...targetLift.skipped]);
        const tables = await publicTables(source);
        for (const table of tables) {
            if (skipped.has(table)) {
                // Never compare a zero-row read against anything: the
                // count is not real, it is RLS hiding the rows.
                checks.push({ table, source: null, target: null, match: false, skipped: true });
                continue;
            }
            const sourceCount = await countRows(source, table);
            const targetCount = await countRows(target, table);
            const entry = { table, source: sourceCount, target: targetCount, match: sourceCount === targetCount };
            if (HASH_TABLES.has(table) && entry.match) {
                const sourceHash = await idHash(source, table);
                const targetHash = await idHash(target, table);
                entry.hashMatch = sourceHash === targetHash;
                entry.match = entry.match && entry.hashMatch;
            }
            checks.push(entry);
        }
        const sourceHistory = await migrationHistory(source);
        const targetHistory = await migrationHistory(target);
        const historyTables = [...new Set([...Object.keys(sourceHistory), ...Object.keys(targetHistory)])];
        const history = {};
        let historyMatch = true;
        for (const table of historyTables) {
            const match = JSON.stringify(sourceHistory[table] || null) === JSON.stringify(targetHistory[table] || null);
            history[table] = {
                match,
                source: sourceHistory[table] ? sourceHistory[table].length : null,
                target: targetHistory[table] ? targetHistory[table].length : null,
            };
            historyMatch = historyMatch && match;
        }
        // FORCE flags must agree between source and target: a restored
        // branch that lost FORCE is a broken restore even when the row
        // counts match. Compare the AS-FOUND flags captured before
        // lifting — the script's own re-FORCE would mask a target that
        // arrived without FORCE. This is the script's own coverage of
        // the restored database; fixing a flagged target is the restore
        // runbook's re-enable step, and a re-run of this script
        // confirms it.
        const sourceForced = new Map(sourceLift.statesBefore.map((row) => [row.table_name, row.forced]));
        const targetForced = new Map(targetLift.statesBefore.map((row) => [row.table_name, row.forced]));
        const forceMismatch = RLS_TABLES.filter((table) =>
            sourceForced.has(table) && targetForced.has(table) &&
            sourceForced.get(table) !== targetForced.get(table));
        if (forceMismatch.length) {
            console.error(
                `WARNING: FORCE ROW LEVEL SECURITY differs between source and target on: ${forceMismatch.join(', ')}. ` +
                'The restored database must have FORCE re-enabled (see the restore runbook) before it is relied on.');
        }
        const failed = checks.filter((c) => !c.match && !c.skipped);
        const summary = {
            tables: checks.length,
            mismatches: failed.map((c) => c.table),
            rlsSkipped: [...skipped],
            forceLifted: { source: sourceLift.lifted, target: targetLift.lifted },
            forceMismatch,
            history,
        };
        console.log(JSON.stringify(summary, null, 2));
        if (failed.length || !historyMatch || skipped.size || forceMismatch.length) {
            process.exitCode = 1;
        }
    } finally {
        // Re-enable FORCE first, while the connections are still open:
        // a failure anywhere above must never leave FORCE off. Each
        // side is attempted even if the other fails; a restore failure
        // is reported loudly instead of being swallowed.
        const restoreErrors = [];
        for (const [client, lift, label] of [[source, sourceLift, 'source'], [target, targetLift, 'target']]) {
            if (lift.connected && lift.lifted.length) {
                try {
                    await restoreForce(client, lift.lifted, label);
                } catch (error) {
                    restoreErrors.push(error.message);
                }
            }
        }
        await source.end().catch(() => {});
        await target.end().catch(() => {});
        if (restoreErrors.length) {
            throw new Error(restoreErrors.join(' '));
        }
    }
}

main().catch((error) => {
    console.error(`Restore verification failed: ${error.message}`);
    process.exitCode = 1;
});
