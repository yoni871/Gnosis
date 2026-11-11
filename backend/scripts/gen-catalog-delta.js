// Development helper: generate the catalog delta for one migration,
// using the same logic as backend/test/migrations/integration.test.js
// ("post-baseline migration catalog deltas match regenerated schemas").
// The integration suite regenerates every delta and pins the committed
// files, so run this after writing a new migration and before running
// the migration tests. Usage:
//   MIGRATION_TEST_DATABASE_URL=<redacted> node scripts/gen-catalog-delta.js <migration-file-name> --project app
// Writes database/migration-catalogs/<name>.catalog.json. Requires a
// disposable test database (see docs/Database_Migrations.md); never
// run it against a real database.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Client } = require('pg');
const { execute } = require('./migrations/runner');
const { catalog } = require('./migrations/catalog');
const { projectDir } = require('./migrations/config');

async function main() {
    const migrationName = process.argv[2];
    const projectPosition = process.argv.indexOf('--project');
    const project = projectPosition < 0 ? undefined : process.argv[projectPosition + 1];
    if (!migrationName) throw new Error('Pass the migration file name, e.g. 20261106234443_add-original-language-analysis.sql');
    if (!project) throw new Error('Pass --project app, bible, or commentary.');
    const migrationsDir = projectDir(project);
    const db = new Client({ connectionString: process.env.MIGRATION_TEST_DATABASE_URL, connectionTimeoutMillis: 5000 });
    await db.connect();
    try {
        await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
        const files = (await fs.readdir(migrationsDir)).filter(n => n.endsWith('.sql')).sort();
        const idx = files.indexOf(migrationName);
        if (idx < 1) throw new Error(`Migration ${migrationName} not found (or is the baseline)`);
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gnosis-delta-'));
        for (const name of files.slice(0, idx)) {
            await fs.copyFile(path.join(migrationsDir, name), path.join(dir, name));
        }
        await execute({ command: 'up', target: 'test', project, dir });
        const before = await catalog(db);
        await fs.copyFile(path.join(migrationsDir, migrationName), path.join(dir, migrationName));
        await execute({ command: 'up', target: 'test', project, dir });
        const after = await catalog(db);
        const added = after.filter(row => {
            const prev = before.find(item => item.kind === row.kind && item.name === row.name);
            return !prev || JSON.stringify(prev.definition) !== JSON.stringify(row.definition);
        });
        const removed = before.filter(row => !after.some(item => item.kind === row.kind && item.name === row.name))
            .map(row => `${row.kind}:${row.name}`);
        const out = path.resolve(migrationsDir, '../../migration-catalogs', `${migrationName.slice(0, -4)}.catalog.json`);
        await fs.writeFile(out, JSON.stringify({ added, removed }, null, 2) + '\n');
        console.log(`Wrote ${out} (${added.length} added, ${removed.length} removed)`);
        await fs.rm(dir, { recursive: true, force: true });
    } finally {
        await db.end();
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
