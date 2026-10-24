const path = require('node:path');
const { isIP } = require('node:net');

function safeError(message) {
    const error = new Error(message);
    error.safe = true;
    return error;
}

function connectionFor(target, env = process.env) {
    if (!['local', 'test', 'production'].includes(target)) {
        throw safeError('An explicit --target local, test, or production is required.');
    }
    if (target === 'local') {
        if (!env.DB_HOST || !env.DB_NAME || !env.DB_USER || !env.DB_PORT) {
            throw safeError('Local target requires DB_HOST, DB_NAME, DB_USER, and DB_PORT.');
        }
        if (!['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST)) {
            throw safeError('Local target requires a loopback host.');
        }
        if (/prod|neon|live/i.test(env.DB_NAME)) throw safeError('Unsafe local database name.');
        if (!/^\d+$/.test(env.DB_PORT) || Number(env.DB_PORT) < 1 || Number(env.DB_PORT) > 65535) {
            throw safeError('Local target requires a valid explicit port.');
        }
        return { host: env.DB_HOST, database: env.DB_NAME, user: env.DB_USER,
            password: env.DB_PASSWORD, port: Number(env.DB_PORT) };
    }
    const value = env[target === 'test' ? 'MIGRATION_TEST_DATABASE_URL' : 'MIGRATION_DATABASE_URL'];
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
    const remaining = rest.filter((_, i) => i !== position && i !== position + 1);
    if (command === 'create') {
        if (remaining.length !== 1 || !/^[a-z][a-z0-9_-]{0,79}$/.test(remaining[0])) throw safeError('Supply one lowercase migration description.');
    } else if (remaining.length) throw safeError('Unexpected command arguments.');
    return { command, target, description: remaining[0] };
}

module.exports = { connectionFor, parseArgs, safeError,
    migrationsDir: path.resolve(__dirname, '../../../database/migrations'),
    baselineName: '20261023000000_baseline', lockId: '7241865325823964' };
