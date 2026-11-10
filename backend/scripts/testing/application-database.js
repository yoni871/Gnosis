// Operator-only lifecycle. Never import this module in application test workers.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');
const { testEnvironment } = require('../test');
const { connectionFor } = require('../migrations/config');

async function withApplicationDatabase(admin, operator, migrationDatabase, callback) {
    const suffix = randomBytes(8).toString('hex');
    const name = `gnosis_migration_test_${suffix}`;
    const role = `gnosis_app_${suffix}`;
    const password = `synthetic-${randomBytes(16).toString('hex')}`;
    assert.notEqual(name, migrationDatabase, 'Application and migration databases must differ.');
    assert.equal(operator.host, '127.0.0.1');
    assert.equal(operator.user, 'gnosis_test');
    const context = { host: operator.host, port: operator.port, database: name, user: role, password };
    let databaseCreated = false;
    let roleCreated = false;
    let provisioning;
    let original;
    let cleaned = false;

    async function assertRemoved() {
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM pg_database WHERE datname=$1', [name])).rows[0].n, 0);
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM pg_roles WHERE rolname=$1', [role])).rows[0].n, 0);
    }
    async function cleanup() {
        if (cleaned) return assertRemoved();
        const errors = [];
        if (provisioning) {
            try { await provisioning.end(); } catch (error) { errors.push(error); }
            provisioning = undefined;
        }
        if (databaseCreated) {
            try { await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); }
            catch (error) { errors.push(error); }
        }
        if (roleCreated) {
            try { await admin.query(`DROP ROLE IF EXISTS "${role}"`); }
            catch (error) { errors.push(error); }
        }
        try { await assertRemoved(); } catch (error) { errors.push(error); }
        if (errors.length) throw new Error('Disposable application database/role cleanup failed.');
        cleaned = true;
    }

    try {
        await admin.query(`CREATE DATABASE "${name}"`);
        databaseCreated = true;
        const url = new URL('postgresql://127.0.0.1');
        url.port = String(operator.port); url.username = operator.user;
        url.password = operator.password; url.pathname = `/${name}`;
        const env = { ...testEnvironment(), MIGRATION_TEST_DATABASE_URL: url.href };
        connectionFor('test', env, 'app');
        // One database holds all three histories (one tracking table per
        // project). Bible first: in a shared database its baseline must
        // run before the Commentary baseline creates the bible_books copy.
        for (const project of ['bible', 'app', 'commentary']) {
            for (const command of ['up', 'check']) {
                const result = spawnSync(process.execPath, ['scripts/migrate.js', command, '--target', 'test', '--project', project], {
                    cwd: path.resolve(__dirname, '../..'), env, encoding: 'utf8', timeout: 90000,
                });
                if (result.status !== 0) throw new Error(`Application fixture migrations failed for ${project}.`);
                const state = JSON.parse(result.stdout);
                if (command === 'check') {
                    assert.deepEqual(state.pending, []);
                    assert.equal(state.baselineMatches, true);
                }
            }
        }
        // These identifiers/passwords contain only generated, validated characters.
        await admin.query(`CREATE ROLE "${role}" LOGIN NOINHERIT NOSUPERUSER
            NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
        roleCreated = true;
        await admin.query(`REVOKE ALL ON DATABASE "${name}" FROM PUBLIC;
            GRANT CONNECT ON DATABASE "${name}" TO "${role}"`);
        provisioning = new Client({ ...operator, database: name });
        provisioning.on('error', () => {});
        await provisioning.connect();
        await provisioning.query(`REVOKE ALL ON SCHEMA public FROM PUBLIC;
            REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
            REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
            REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
            GRANT USAGE ON SCHEMA public TO "${role}";
            GRANT SELECT ON bible_translations,bible_books,bible_chapters,bible_verses,
                sources,commentaries,commentary_entries TO "${role}";
            GRANT SELECT ON ol_sources,ol_lexical_entries,ol_word_occurrences,ol_morphology_codes TO "${role}";
            GRANT SELECT,INSERT ON users TO "${role}";
            GRANT SELECT,INSERT,UPDATE,DELETE ON notes,bookmarks,highlights TO "${role}";
            GRANT SELECT,INSERT,UPDATE ON user_reading_state TO "${role}";
            GRANT USAGE ON SEQUENCE users_id_seq,notes_id_seq,bookmarks_id_seq,highlights_id_seq TO "${role}";
            GRANT SELECT,INSERT,DELETE ON rate_limit_attempts TO "${role}";
            GRANT SELECT,UPDATE ON rate_limit_sweep_state TO "${role}";
            GRANT SELECT,INSERT,UPDATE ON auth_sessions,auth_refresh_tokens TO "${role}";
            GRANT SELECT,INSERT ON email_verification_tokens TO "${role}";
            GRANT UPDATE (used_at, consumed_reason) ON email_verification_tokens TO "${role}";
            GRANT SELECT,INSERT ON password_reset_tokens TO "${role}";
            GRANT UPDATE (email_verified_at, password_hash) ON users TO "${role}";
            GRANT UPDATE (used_at, consumed_reason) ON password_reset_tokens TO "${role}"`);
        // Small reference fixture; no imports, application data or test-owned schema.
        await provisioning.query("INSERT INTO bible_books(name) VALUES ('Synthetic harness book')");
        await provisioning.query(`WITH chapter AS (
            INSERT INTO bible_chapters(book_id,chapter_number)
            SELECT id,1 FROM bible_books WHERE name='Synthetic harness book' RETURNING id)
            INSERT INTO bible_verses(chapter_id,verse_number,text)
            SELECT chapter.id,g,'Synthetic fixture verse' FROM chapter CROSS JOIN generate_series(1,3) g`);
        await provisioning.end();
        provisioning = undefined;
        await callback(context);
    } catch (error) { original = error; }
    try {
        await cleanup();
        await cleanup(); // Idempotence is exercised on success and failure alike.
    } catch (error) {
        if (!original) original = error;
        else {
            console.error('Application cleanup failed after the primary failure.');
            original.cleanupFailed = true;
        }
    }
    if (original) throw original;
}

module.exports = { withApplicationDatabase };
