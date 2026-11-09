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
// The script issues SELECTs only; it never writes. Run it with a
// read-only role or the owner. It never prints a connection string,
// password, or row data — only table names, counts, and hashes.
//
// What it checks, per public table present on the source:
//   * row count matches on the restored branch;
//   * for bible_verses and commentary_entries, an md5 over the ordered
//     id list also matches (catches silent row substitution);
//   * the pgmigrations history (when present) has the same row count and
//     the same migration names in the same order.
// Exit 0 when everything matches, 1 on any mismatch or error.
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

async function main() {
    const source = new Client(connectionConfig(process.env.RESTORE_SOURCE_DATABASE_URL, 'RESTORE_SOURCE_DATABASE_URL'));
    const target = new Client(connectionConfig(process.env.RESTORE_TARGET_DATABASE_URL, 'RESTORE_TARGET_DATABASE_URL'));
    const checks = [];
    try {
        await source.connect();
        await target.connect();
        await warmUp(source);
        await warmUp(target);
        const tables = await publicTables(source);
        for (const table of tables) {
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
        const failed = checks.filter((c) => !c.match);
        const summary = { tables: checks.length, mismatches: failed.map((c) => c.table), history };
        console.log(JSON.stringify(summary, null, 2));
        if (failed.length || !historyMatch) {
            process.exitCode = 1;
        }
    } finally {
        await source.end().catch(() => {});
        await target.end().catch(() => {});
    }
}

main().catch((error) => {
    console.error(`Restore verification failed: ${error.message}`);
    process.exitCode = 1;
});
