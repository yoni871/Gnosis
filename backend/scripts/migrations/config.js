const path = require('node:path');
const { isIP } = require('node:net');

function safeError(message) {
    const error = new Error(message);
    error.safe = true;
    return error;
}

// One migration history per Neon project. The three histories share one
// database in tests and local development (three tracking tables), and
// live in three databases once the projects split. Keep this list in
// sync with the application pools in backend/src/db/db.js.
const projects = ['app', 'bible', 'commentary'];

function projectDir(project) {
    if (!projects.includes(project)) throw safeError('Unknown migration project.');
    return path.resolve(__dirname, '../../../database/migrations', project);
}

// The tracking table is per project so the three histories can coexist
// in one database (tests, local development) as well as in three.
function migrationsTable(project) {
    if (!projects.includes(project)) throw safeError('Unknown migration project.');
    return `pgmigrations_${project}`;
}

function baselineCatalogPath(project) {
    if (!projects.includes(project)) throw safeError('Unknown migration project.');
    return path.resolve(__dirname, `../../../database/baseline.${project}.catalog.json`);
}

function connectionFor(target, env = process.env, project) {
    if (!['local', 'test', 'production'].includes(target)) {
        throw safeError('An explicit --target local, test, or production is required.');
    }
    if (!projects.includes(project)) throw safeError('An explicit --project app, bible, or commentary is required.');
    if (target === 'local') {
        const required = ['MIGRATION_DB_HOST','MIGRATION_DB_PORT','MIGRATION_DB_NAME',
            'MIGRATION_DB_USER','MIGRATION_DB_PASSWORD'];
        const missing = required.filter(name => !env[name]);
        if (missing.length) {
            throw safeError(`Local target requires ${missing.join(', ')}. Application DB_* settings are not used.`);
        }
        if (!['localhost', '127.0.0.1', '::1'].includes(env.MIGRATION_DB_HOST)) {
            throw safeError('Local target requires a loopback MIGRATION_DB_HOST.');
        }
        if (/prod|neon|live/i.test(env.MIGRATION_DB_NAME)) throw safeError('Unsafe local database name in MIGRATION_DB_NAME.');
        if (!/^\d+$/.test(env.MIGRATION_DB_PORT) || Number(env.MIGRATION_DB_PORT) < 1 || Number(env.MIGRATION_DB_PORT) > 65535) {
            throw safeError('Local target requires a valid explicit MIGRATION_DB_PORT.');
        }
        return { host: env.MIGRATION_DB_HOST, database: env.MIGRATION_DB_NAME, user: env.MIGRATION_DB_USER,
            password: env.MIGRATION_DB_PASSWORD, port: Number(env.MIGRATION_DB_PORT) };
    }
    // Test and local targets share one database across projects (the
    // tracking table is per project, so the histories do not collide).
    // Production requires one direct connection per project.
    const value = target === 'test' ? env.MIGRATION_TEST_DATABASE_URL
        : target === 'production' ? env[`MIGRATION_${project.toUpperCase()}_DATABASE_URL`]
        : undefined;
    let url;
    try { url = new URL(value); } catch { throw safeError('The selected target requires a valid migration connection setting.'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw safeError('PostgreSQL connection required.');
    if (!url.hostname || !url.pathname.slice(1)) throw safeError('Explicit host and database required.');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (target === 'test') {
        if (!['127.0.0.1', '::1'].includes(host) || !isIP(host) || url.search || url.hash ||
            !/^gnosis_migration_test_[a-f0-9]{16}$/.test(url.pathname.slice(1))) {
            throw safeError('Tests require an isolated loopback database with a generated test name and no URL options.');
        }
    } else if (host.includes('-pooler') || url.searchParams.get('sslmode') !== 'verify-full') {
        throw safeError('Production migrations require a direct connection and sslmode=verify-full.');
    }
    return { connectionString: value };
}

function parseArgs(args) {
    const [command, ...rest] = args;
    if (!['up', 'check', 'baseline', 'down', 'create'].includes(command)) throw safeError('Unknown migration command.');
    const position = rest.indexOf('--target');
    const target = position < 0 ? undefined : rest[position + 1];
    if (!['local', 'test', 'production'].includes(target)) throw safeError('An explicit --target local, test, or production is required.');
    const projectPosition = rest.indexOf('--project');
    const project = projectPosition < 0 ? undefined : rest[projectPosition + 1];
    if (!projects.includes(project)) throw safeError('An explicit --project app, bible, or commentary is required.');
    const remaining = rest.filter((_, i) => i !== position && i !== position + 1 && i !== projectPosition && i !== projectPosition + 1);
    if (command === 'create') {
        if (remaining.length !== 1 || !/^[a-z][a-z0-9_-]{0,79}$/.test(remaining[0])) throw safeError('Supply one lowercase migration description.');
    } else if (remaining.length) throw safeError('Unexpected command arguments.');
    return { command, target, project, description: remaining[0] };
}

module.exports = { connectionFor, parseArgs, safeError, projects, projectDir, migrationsTable, baselineCatalogPath,
    migrationsDir: path.resolve(__dirname, '../../../database/migrations'),
    baselineName: '20261023000000_baseline', lockId: '7241865325823964' };
