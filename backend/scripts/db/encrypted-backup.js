#!/usr/bin/env node
'use strict';

// Independent, encrypted backups for the three Gnosis PostgreSQL projects.
// No command modifies a source database. Restore refuses non-loopback targets.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Client } = require('pg');

const PROJECTS = ['app', 'bible', 'commentary'];
const MAGIC = Buffer.from('GNOSISB1');
const HEADER_BYTES = MAGIC.length + 12;
const TAG_BYTES = 16;
const REQUIRED_TABLES = {
    app: ['users', 'notes', 'bookmarks', 'highlights', 'user_reading_state'],
    bible: ['bible_books', 'bible_translations', 'bible_verses'],
    commentary: ['sources', 'commentaries', 'commentary_entries'],
};

function keyFromEnvironment() {
    const raw = process.env.GNOSIS_BACKUP_KEY_HEX;
    if (typeof raw !== 'string' || !/^[a-fA-F0-9]{64}$/.test(raw)) {
        throw new Error('GNOSIS_BACKUP_KEY_HEX must be 32 random bytes encoded as 64 hex characters.');
    }
    return Buffer.from(raw, 'hex');
}

function connection(value, label, restore = false) {
    let url;
    try { url = new URL(value); } catch { throw new Error(`${label} must be an explicit PostgreSQL URL.`); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password || !url.pathname.slice(1)) {
        throw new Error(`${label} must include host, database, user, and password.`);
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const local = ['127.0.0.1', '::1', 'localhost'].includes(host);
    if (restore && !local) throw new Error('Restore targets must be loopback databases.');
    if (!local && (process.env.GNOSIS_BACKUP_ALLOW_REMOTE !== '1' || url.searchParams.get('sslmode') !== 'verify-full' || host.includes('-pooler'))) {
        throw new Error(`${label}: remote backup requires explicit opt-in, direct endpoint, and sslmode=verify-full.`);
    }
    if (url.searchParams.size && !(url.searchParams.size === 1 && url.searchParams.get('sslmode') === 'verify-full')) {
        throw new Error(`${label} contains unsupported connection parameters.`);
    }
    return { host, port: Number(url.port) || 5432, database: decodeURIComponent(url.pathname.slice(1)),
        user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), local };
}

function pgEnvironment(config) {
    return { PATH: process.env.PATH || '/usr/bin:/bin', PGPASSWORD: config.password,
        PGSSLMODE: config.local ? 'disable' : 'verify-full', PGCONNECT_TIMEOUT: '30' };
}

function dbClient(config) {
    return new Client({ host: config.host, port: config.port, database: config.database,
        user: config.user, password: config.password, ssl: config.local ? false : { rejectUnauthorized: true },
        connectionTimeoutMillis: 30000, statement_timeout: 120000 });
}

function quoted(name) { return `"${name.replace(/"/g, '""')}"`; }

async function inventory(client, project) {
    const role = (await client.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`)).rows[0];
    const forced = (await client.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relforcerowsecurity ORDER BY c.relname`)).rows.map(row => row.relname);
    if (forced.length && !role.rolsuper && !role.rolbypassrls) {
        throw new Error(`${project}: source role cannot bypass FORCE RLS; refusing an incomplete backup.`);
    }
    const tables = (await client.query(`SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`)).rows.map(row => row.table_name);
    if (REQUIRED_TABLES[project]?.some(table => !tables.includes(table))) {
        throw new Error(`${project}: expected project tables are missing; refusing a mislabeled backup.`);
    }
    const counts = {};
    for (const table of tables) {
        counts[table] = (await client.query(`SELECT count(*)::text AS n FROM public.${quoted(table)}`)).rows[0].n;
    }
    return { counts, forced };
}

function command(binary, args, config, inputFile = null) {
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args, { env: pgEnvironment(config), stdio: [inputFile ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4096); });
        child.on('error', () => reject(new Error(`${binary} could not start.`)));
        if (inputFile) pipeline(fs.createReadStream(inputFile), child.stdin).catch(() => {});
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`${binary} failed (exit ${code}); details withheld to protect credentials.`)));
    });
}

async function dumpEncrypted(config, snapshot, destination, key) {
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    const output = fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 });
    output.write(Buffer.concat([MAGIC, nonce]));
    const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--snapshot', snapshot,
        '--host', config.host, '--port', String(config.port), '--username', config.user, '--dbname', config.database],
    { env: pgEnvironment(config), stdio: ['ignore', 'pipe', 'pipe'] });
    // pg_dump's diagnostics may contain connection details; never emit them.
    child.stderr.resume();
    const exited = new Promise((resolve, reject) => {
        child.on('error', () => reject(new Error('pg_dump could not start.')));
        child.on('close', code => code === 0 ? resolve() : reject(new Error('pg_dump failed; encrypted partial backup discarded.')));
    });
    try {
        await Promise.all([pipeline(child.stdout, cipher, output), exited]);
        await fsp.appendFile(destination, cipher.getAuthTag());
    } catch (error) {
        child.kill();
        await fsp.rm(destination, { force: true });
        throw error;
    }
}

function sealBuffer(plain, key) {
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    return Buffer.concat([MAGIC, nonce, cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
}

function openBuffer(value, key) {
    if (value.length < HEADER_BYTES + TAG_BYTES || !value.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid backup envelope.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(MAGIC.length, HEADER_BYTES));
    decipher.setAuthTag(value.subarray(-TAG_BYTES));
    return Buffer.concat([decipher.update(value.subarray(HEADER_BYTES, -TAG_BYTES)), decipher.final()]);
}

async function decryptFile(source, destination, key) {
    const stat = await fsp.lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < HEADER_BYTES + TAG_BYTES) throw new Error('Invalid backup artifact.');
    const handle = await fsp.open(source, 'r');
    const header = Buffer.alloc(HEADER_BYTES), tag = Buffer.alloc(TAG_BYTES);
    try {
        await handle.read(header, 0, HEADER_BYTES, 0);
        await handle.read(tag, 0, TAG_BYTES, stat.size - TAG_BYTES);
    } finally { await handle.close(); }
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid backup envelope.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
    decipher.setAuthTag(tag);
    try {
        await pipeline(fs.createReadStream(source, { start: HEADER_BYTES, end: stat.size - TAG_BYTES - 1 }),
            decipher, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
    } catch {
        await fsp.rm(destination, { force: true });
        throw new Error('Backup authentication failed.');
    }
}

async function sha256(file) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

async function syncFile(file) {
    const handle = await fsp.open(file, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
}

async function backup(root, key) {
    const configs = Object.fromEntries(PROJECTS.map(project => [project,
        connection(process.env[`GNOSIS_BACKUP_${project.toUpperCase()}_URL`], project)]));
    if (new Set(PROJECTS.map(project => `${configs[project].host}:${configs[project].port}/${configs[project].database}`)).size !== 3) {
        throw new Error('Each project must use a distinct source database.');
    }
    const parent = path.resolve(root);
    await fsp.mkdir(parent, { recursive: true, mode: 0o700 });
    const dir = await fsp.mkdtemp(path.join(parent, 'gnosis-'));
    await fsp.chmod(dir, 0o700);
    const manifest = { format: 1, createdAt: new Date().toISOString(), projects: {} };
    try {
        for (const project of PROJECTS) {
            const config = configs[project];
            const client = dbClient(config);
            try {
                await client.connect();
                await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
                const snapshot = (await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
                const checkedAt = (await client.query('SELECT transaction_timestamp() AS at')).rows[0].at.toISOString();
                const { counts, forced } = await inventory(client, project);
                const file = `${project}.dump.gnb`;
                await dumpEncrypted(config, snapshot, path.join(dir, file), key);
                await syncFile(path.join(dir, file));
                manifest.projects[project] = { file, sha256: await sha256(path.join(dir, file)), checkedAt, counts, forced };
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                throw error;
            } finally { await client.end().catch(() => {}); }
        }
        await fsp.writeFile(path.join(dir, 'manifest.gnb'), sealBuffer(Buffer.from(JSON.stringify(manifest)), key), { flag: 'wx', mode: 0o600 });
        await syncFile(path.join(dir, 'manifest.gnb'));
        await openedBundle(dir, key, async () => {});
        return dir;
    } catch (error) {
        await fsp.rm(dir, { recursive: true, force: true });
        throw error;
    }
}

async function openedBundle(dir, key, work) {
    const directory = path.resolve(dir);
    const metadata = JSON.parse(openBuffer(await fsp.readFile(path.join(directory, 'manifest.gnb')), key));
    if (metadata.format !== 1 || Object.keys(metadata.projects || {}).sort().join() !== [...PROJECTS].sort().join()) {
        throw new Error('Incomplete or unsupported backup bundle.');
    }
    const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'gnosis-restore-'));
    await fsp.chmod(temporary, 0o700);
    try {
        const dumps = {};
        for (const project of PROJECTS) {
            const entry = metadata.projects[project];
            if (entry.file !== `${project}.dump.gnb` || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid backup manifest.');
            const source = path.join(directory, entry.file);
            if (await sha256(source) !== entry.sha256) throw new Error(`${project}: backup artifact hash mismatch.`);
            dumps[project] = path.join(temporary, `${project}.dump`);
            await decryptFile(source, dumps[project], key);
            await command('pg_restore', ['--list', dumps[project]], { local: true, password: '' });
        }
        return await work(metadata, dumps);
    } finally { await fsp.rm(temporary, { recursive: true, force: true }); }
}

async function verifyRestored(config, expected) {
    const client = dbClient(config);
    try {
        await client.connect();
        const actual = await inventory(client, 'restored');
        if (JSON.stringify(actual.counts) !== JSON.stringify(expected.counts) ||
            JSON.stringify(actual.forced) !== JSON.stringify(expected.forced)) {
            throw new Error('Restored table counts or FORCE RLS flags differ from the backup snapshot.');
        }
        return client;
    } catch (error) { await client.end().catch(() => {}); throw error; }
}

async function crossProjectIntegrity(clients) {
    const ids = async (client, sql) => new Set((await client.query(sql)).rows.map(row => String(row.id)));
    const bibleBooks = await ids(clients.bible, 'SELECT id FROM bible_books');
    const commentaryBooks = await ids(clients.commentary, 'SELECT id FROM bible_books');
    if (bibleBooks.size !== commentaryBooks.size || [...bibleBooks].some(id => !commentaryBooks.has(id))) {
        throw new Error('Cross-project Bible/Commentary book catalogs differ.');
    }
    const translations = await ids(clients.bible, 'SELECT id FROM bible_translations');
    const commentaries = await ids(clients.commentary, 'SELECT id FROM commentaries');
    const checks = [
        ['app', 'notes', 'book_id', bibleBooks], ['app', 'bookmarks', 'book_id', bibleBooks],
        ['app', 'highlights', 'book_id', bibleBooks], ['app', 'user_reading_state', 'book_id', bibleBooks],
        ['app', 'user_reading_state', 'commentary_id', commentaries],
        ['app', 'licensed_chapter_cache', 'book_id', bibleBooks],
        ['app', 'licensed_chapter_cache', 'translation_id', translations],
        ['commentary', 'commentary_entries', 'book_id', bibleBooks],
    ];
    for (const [project, table, column, valid] of checks) {
        const rows = await clients[project].query(`SELECT DISTINCT ${quoted(column)} AS id FROM ${quoted(table)} WHERE ${quoted(column)} IS NOT NULL`);
        if (rows.rows.some(row => !valid.has(String(row.id)))) throw new Error(`Cross-project reference mismatch: ${project}.${table}.${column}.`);
    }
}

async function restore(dir, key) {
    const configs = Object.fromEntries(PROJECTS.map(project => [project,
        connection(process.env[`GNOSIS_RESTORE_${project.toUpperCase()}_URL`], project, true)]));
    if (new Set(PROJECTS.map(project => `${configs[project].host}:${configs[project].port}/${configs[project].database}`)).size !== 3) {
        throw new Error('Each restore target must be a distinct loopback database.');
    }
    return openedBundle(dir, key, async (manifest, dumps) => {
        for (const project of PROJECTS) {
            const config = configs[project];
            const client = dbClient(config);
            try {
                await client.connect();
                const count = (await client.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                    WHERE n.nspname='public' AND c.relkind IN ('r','v','m','S')`)).rows[0].n;
                if (count !== 0) throw new Error(`${project}: restore target must be empty.`);
            } finally { await client.end(); }
            await command('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--host', config.host,
                '--port', String(config.port), '--username', config.user, '--dbname', config.database, dumps[project]], config);
        }
        const clients = {};
        try {
            for (const project of PROJECTS) clients[project] = await verifyRestored(configs[project], manifest.projects[project]);
            await crossProjectIntegrity(clients);
        } finally { await Promise.all(Object.values(clients).map(client => client.end())); }
        return { verified: true, projects: PROJECTS };
    });
}

async function main() {
    const [action, location] = process.argv.slice(2);
    if (!['backup', 'verify', 'restore'].includes(action) || !location || process.argv.length !== 4) {
        throw new Error('Usage: encrypted-backup.js backup|verify|restore <directory>.');
    }
    const key = keyFromEnvironment();
    if (action === 'backup') {
        const dir = await backup(location, key);
        console.log(JSON.stringify({ created: dir, projects: PROJECTS }));
    } else if (action === 'verify') {
        console.log(JSON.stringify(await openedBundle(location, key, async manifest =>
            ({ verified: true, projects: Object.keys(manifest.projects), createdAt: manifest.createdAt }))));
    } else console.log(JSON.stringify(await restore(location, key)));
}

if (require.main === module) main().catch(error => { console.error(`Backup operation failed: ${error.message}`); process.exitCode = 1; });
module.exports = { connection, sealBuffer, openBuffer, backup, openedBundle, restore, crossProjectIntegrity };
