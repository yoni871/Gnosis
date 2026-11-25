#!/usr/bin/env node
'use strict';

// Disposable local-only rehearsal. Does not read a caller's database URLs.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const backup = require('./encrypted-backup');

function docker(args) {
    const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 120000 });
    if (result.status !== 0) throw new Error('Disposable Docker operation failed.');
    return result.stdout.trim();
}

async function main() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gnosis-backup-test-'));
    await fs.chmod(root, 0o700);
    let container;
    try {
        container = docker(['run', '--detach', '--rm', '--publish', '127.0.0.1::5432',
            '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:14']);
        const port = Number(docker(['port', container, '5432/tcp']).split(':').at(-1));
        assert.ok(Number.isInteger(port) && port > 0);
        const url = name => `postgresql://postgres:synthetic@127.0.0.1:${port}/${name}`;
        let admin;
        for (let attempt = 0; attempt < 60; attempt++) {
            try {
                admin = new Client({ connectionString: url('postgres'), connectionTimeoutMillis: 1000 });
                await admin.connect(); break;
            } catch { await admin?.end().catch(() => {}); await new Promise(resolve => setTimeout(resolve, 250)); }
        }
        if (!admin) throw new Error('Disposable PostgreSQL did not start.');
        try {
            for (const name of ['app_source','bible_source','commentary_source','app_target','bible_target','commentary_target']) {
                await admin.query(`CREATE DATABASE ${name}`);
            }
            await admin.query("CREATE ROLE backup_reader LOGIN PASSWORD 'synthetic'");
        } finally { await admin.end(); }
        const clients = {};
        try {
            for (const project of ['app', 'bible', 'commentary']) {
                clients[project] = new Client({ connectionString: url(`${project}_source`) });
                await clients[project].connect();
            }
            await clients.bible.query(`CREATE TABLE bible_books(id integer PRIMARY KEY, name text);
                CREATE TABLE bible_translations(id integer PRIMARY KEY, abbreviation text);
                CREATE TABLE bible_verses(id integer PRIMARY KEY, text text);
                INSERT INTO bible_books VALUES (1,'Synthetic Book');
                INSERT INTO bible_translations VALUES (1,'SYN');`);
            await clients.commentary.query(`CREATE TABLE bible_books(id integer PRIMARY KEY, name text);
                CREATE TABLE sources(id integer PRIMARY KEY, title text);
                CREATE TABLE commentaries(id integer PRIMARY KEY, title text);
                CREATE TABLE commentary_entries(id integer PRIMARY KEY, book_id integer, content text);
                INSERT INTO bible_books VALUES (1,'Synthetic Book');
                INSERT INTO commentaries VALUES (1,'Synthetic Commentary');
                INSERT INTO commentary_entries VALUES (1,1,'Synthetic entry');`);
            await clients.app.query(`CREATE TABLE users(id integer PRIMARY KEY, email text);
                CREATE TABLE notes(id integer PRIMARY KEY, user_id integer, book_id integer, content text);
                CREATE TABLE bookmarks(id integer PRIMARY KEY, user_id integer, book_id integer);
                CREATE TABLE highlights(id integer PRIMARY KEY, user_id integer, book_id integer);
                CREATE TABLE user_reading_state(user_id integer PRIMARY KEY, book_id integer, commentary_id integer);
                CREATE TABLE licensed_chapter_cache(id integer PRIMARY KEY, book_id integer, translation_id integer);
                ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
                ALTER TABLE notes FORCE ROW LEVEL SECURITY;
                CREATE POLICY user_isolation ON notes USING (user_id = current_setting('app.user_id', true)::integer);
                INSERT INTO notes VALUES (1,7,1,'synthetic private note');
                INSERT INTO bookmarks VALUES (1,7,1);
                INSERT INTO highlights VALUES (1,7,1);
                INSERT INTO user_reading_state VALUES (7,1,1);
                INSERT INTO licensed_chapter_cache VALUES (1,1,1);
                GRANT USAGE ON SCHEMA public TO backup_reader;
                GRANT SELECT ON notes TO backup_reader;`);
        } finally { await Promise.all(Object.values(clients).map(client => client.end())); }

        const key = crypto.randomBytes(32);
        process.env.GNOSIS_BACKUP_KEY_HEX = key.toString('hex');
        for (const project of ['app','bible','commentary']) {
            process.env[`GNOSIS_BACKUP_${project.toUpperCase()}_URL`] = url(`${project}_source`);
            process.env[`GNOSIS_RESTORE_${project.toUpperCase()}_URL`] = url(`${project}_target`);
        }
        // A normal app-like role cannot silently dump FORCE RLS rows.
        const appUrl = process.env.GNOSIS_BACKUP_APP_URL;
        process.env.GNOSIS_BACKUP_APP_URL = appUrl.replace('postgres:synthetic', 'backup_reader:synthetic');
        await assert.rejects(backup.backup(root, key), /cannot bypass FORCE RLS/);
        process.env.GNOSIS_BACKUP_APP_URL = appUrl;
        process.env.GNOSIS_BACKUP_COMMENTARY_URL = process.env.GNOSIS_BACKUP_BIBLE_URL;
        await assert.rejects(backup.backup(root, key), /distinct source database/);
        process.env.GNOSIS_BACKUP_COMMENTARY_URL = url('commentary_source');
        process.env.GNOSIS_BACKUP_APP_URL = url('bible_source');
        await assert.rejects(backup.backup(root, key), /distinct source database/);
        process.env.GNOSIS_BACKUP_BIBLE_URL = url('commentary_source');
        process.env.GNOSIS_BACKUP_COMMENTARY_URL = url('app_source');
        await assert.rejects(backup.backup(root, key), /expected project tables are missing/);
        process.env.GNOSIS_BACKUP_APP_URL = appUrl;
        process.env.GNOSIS_BACKUP_BIBLE_URL = url('bible_source');
        process.env.GNOSIS_BACKUP_COMMENTARY_URL = url('commentary_source');

        const bundle = await backup.backup(root, key);
        assert.equal((await fs.stat(bundle)).mode & 0o777, 0o700);
        const result = await backup.openedBundle(bundle, key, async manifest => manifest);
        assert.equal(result.projects.app.counts.notes, '1');
        assert.deepEqual(result.projects.app.forced, ['notes']);
        assert.equal((await backup.restore(bundle, key)).verified, true);
        const restored = new Client({ connectionString: url('app_target') });
        await restored.connect();
        try {
            assert.equal((await restored.query('SELECT content FROM notes WHERE id=1')).rows[0].content, 'synthetic private note');
            await restored.query('UPDATE notes SET book_id=999 WHERE id=1');
            const bible = new Client({ connectionString: url('bible_target') });
            const commentary = new Client({ connectionString: url('commentary_target') });
            await bible.connect(); await commentary.connect();
            try {
                await assert.rejects(backup.crossProjectIntegrity({ app: restored, bible, commentary }), /Cross-project reference mismatch/);
                await restored.query('UPDATE notes SET book_id=1 WHERE id=1');
                await commentary.query('DELETE FROM bible_books WHERE id=1');
                await assert.rejects(backup.crossProjectIntegrity({ app: restored, bible, commentary }), /book catalogs differ/);
            } finally { await bible.end(); await commentary.end(); }
        } finally { await restored.end(); }
        await assert.rejects(backup.restore(bundle, key), /target must be empty/);
        await assert.rejects(backup.openedBundle(bundle, crypto.randomBytes(32), async () => {}));
        const file = path.join(bundle, 'app.dump.gnb');
        const bytes = await fs.readFile(file);
        bytes[40] ^= 1;
        await fs.writeFile(file, bytes);
        await assert.rejects(backup.openedBundle(bundle, key, async () => {}), /hash mismatch/);
        console.log('PASS: three encrypted backups, authenticated verification, isolated restore, RLS fail-closed, cross-project integrity, and corruption rejection.');
    } finally {
        if (container) docker(['rm', '-f', container]);
        await fs.rm(root, { recursive: true, force: true });
        for (const project of ['APP','BIBLE','COMMENTARY']) {
            delete process.env[`GNOSIS_BACKUP_${project}_URL`]; delete process.env[`GNOSIS_RESTORE_${project}_URL`];
        }
        delete process.env.GNOSIS_BACKUP_KEY_HEX;
    }
}

main().catch(error => { console.error(`Backup rehearsal failed: ${error.message}`); process.exitCode = 1; });
