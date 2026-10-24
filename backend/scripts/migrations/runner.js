const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');
const { catalog, differences } = require('./catalog');
const { connectionFor, safeError, migrationsDir, baselineName, lockId } = require('./config');

async function migrationFiles(dir) {
    const files = (await fs.readdir(dir)).filter(name => name.endsWith('.sql')).sort();
    if (!files.length || files[0] !== `${baselineName}.sql` ||
        files.some(name => !/^\d{14}_[a-z][a-z0-9_-]*\.sql$/.test(name)) ||
        new Set(files.map(name => name.slice(0,14))).size !== files.length) {
        throw safeError('Invalid migration filenames or missing baseline.');
    }
    return files.map(name => name.slice(0,-4));
}

async function history(client, names) {
    const exists = (await client.query("SELECT to_regclass('public.pgmigrations') IS NOT NULL AS exists")).rows[0].exists;
    if (!exists) return [];
    const columns = (await client.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='pgmigrations' ORDER BY ordinal_position")).rows;
    if (JSON.stringify(columns) !== JSON.stringify([
        {column_name:'id',data_type:'integer',is_nullable:'NO'},
        {column_name:'name',data_type:'character varying',is_nullable:'NO'},
        {column_name:'run_on',data_type:'timestamp without time zone',is_nullable:'NO'}
    ]) || (await client.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.pgmigrations'::regclass AND contype='p'")).rows[0]?.definition !== 'PRIMARY KEY (id)') {
        throw safeError('Unexpected migration tracking schema; no automatic repair performed.');
    }
    const rows = (await client.query('SELECT name FROM public.pgmigrations ORDER BY id')).rows.map(row => row.name);
    if (rows.some((name, i) => name !== names[i])) {
        throw safeError('Migration history does not match the ordered migration files.');
    }
    return rows;
}

async function execute({command, target, env = process.env, dir = migrationsDir}) {
    const config = connectionFor(target, env);
    if (target === 'production' && command !== 'check' && env.MIGRATION_CONFIRM_PRODUCTION !== 'yes') {
        throw safeError('Production writes require MIGRATION_CONFIRM_PRODUCTION=yes after operator review.');
    }
    const names = await migrationFiles(dir);
    const expected = JSON.parse(await fs.readFile(path.join(__dirname, '../../../database/baseline.catalog.json'), 'utf8'));
    const client = new Client({...config, connectionTimeoutMillis: 10000,
        application_name: 'gnosis-migrations'});
    // Do not forward driver diagnostics: they can contain credentials or SQL data.
    client.on('error', () => {});
    let locked = false;
    try {
        await client.connect();
        await client.query("SET search_path TO public; SET lock_timeout TO '5s'; SET statement_timeout TO '60s'");
        const lock = await client.query('SELECT pg_try_advisory_lock($1::bigint) AS locked', [lockId]);
        if (!lock.rows[0].locked) throw safeError('Another migration operation is running. Retry later.');
        locked = true;
        const applied = await history(client, names);
        const actual = await catalog(client);
        const diff = differences(actual, expected);
        if (command === 'check') {
            return {applied, pending: names.slice(applied.length), baselineMatches: diff.length === 0,
                differences: diff};
        }
        if (command === 'baseline') {
            if (applied.length) throw safeError('Database already has migration history; baseline adoption refused.');
            if (diff.length) throw safeError('Schema differs from the baseline. Run db:migrate:check; no adoption performed.');
            await client.query('BEGIN');
            // Prevent concurrent writes/DDL on known tables while revalidating.
            const tables = expected.filter(row => row.kind === 'relation' && row.definition.kind === 'r');
            await client.query(`LOCK TABLE ${tables.map(row => `public."${row.name}"`).join(',')} IN SHARE MODE`);
            if (differences(await catalog(client), expected).length) throw safeError('Schema changed during validation.');
        } else if (!applied.length && actual.length) {
            throw safeError('Existing schema has no history. Use validated baseline adoption; baseline DDL was not run.');
        }
        if (command === 'down' && applied.length <= 1) throw safeError('The baseline is irreversible.');
        const { runner } = await import('node-pg-migrate');
        const result = await runner({dbClient:client, dir, migrationsTable:'pgmigrations', schema:'public',
            direction: command === 'down' ? 'down' : 'up', count: command === 'baseline' || command === 'down' ? 1 : Infinity,
            fake:command === 'baseline', checkOrder:true, singleTransaction:true,
            logger:{info() {}, warn() {}, error() {}}});
        if (command === 'baseline') await client.query('COMMIT');
        return {migrations:result.map(row => row.name)};
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.safe) throw error;
        throw safeError('Migration operation failed. No driver details are printed; inspect schema/history and recovery guidance before retrying.');
    } finally {
        if (locked) await client.query('SELECT pg_advisory_unlock($1::bigint)', [lockId]).catch(() => {});
        await client.end().catch(() => {});
    }
}

module.exports = { execute, migrationFiles };
