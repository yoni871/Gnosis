const { Pool } = require("pg");
const { logPoolError } = require("../utils/authErrors");
require("../config/env").loadEnvironment();

if (process.env.GNOSIS_LOCAL_DEV === '1') {
    require('../config/localDevelopment').assertLocalDatabase(process.env);
}

// One pool per Neon project. GNOSIS_<PROJECT>_DATABASE_URL selects a
// project; an unset project URL falls back to DATABASE_URL (or the local
// DB_* settings), so a single-database deployment keeps working with one
// shared pool: projects that resolve to the same connection string share
// one Pool instance, and the connection count is unchanged. Set the three
// GNOSIS_*_DATABASE_URL values to split the projects.
//
//   App:        users, auth, notes, bookmarks, highlights, reading state,
//               licensed cache, rate limits (the default export)
//   Bible:      bible_books/chapters/verses/translations, ol_* tables
//   Commentary: commentaries, sources, commentary_entries, bible_books copy
// Boot-time guard for the split configuration. Per-project fallback to
// DATABASE_URL stays allowed (a staged split may set one project URL at
// a time), but once GNOSIS_SPLIT_REQUIRED=1 is set — at the production
// cutover, when all three project URLs are in place — a missing split
// URL fails the boot instead of silently falling back to DATABASE_URL
// and reading Bible/Commentary data from the App database. Before the
// cutover the flag stays unset and the fallback is the intended
// transition behavior (and the rollback path). createPools runs at
// require time, so a bad configuration fails the boot, not a query.
const SPLIT_URL_NAMES = ['GNOSIS_APP_DATABASE_URL', 'GNOSIS_BIBLE_DATABASE_URL', 'GNOSIS_COMMENTARY_DATABASE_URL'];
function assertSplitConfiguration(env) {
    if (env.GNOSIS_SPLIT_REQUIRED !== '1') return;
    const missing = SPLIT_URL_NAMES.filter((name) => !env[name]);
    if (missing.length > 0) {
        throw new Error(`Split databases are required (GNOSIS_SPLIT_REQUIRED=1) but unset: ${missing.join(', ')}.`);
    }
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

// Remote databases must use verified TLS, whatever the connection string
// says. The pool previously relied on the URL carrying sslmode=require,
// which encrypts but never verifies the server certificate — and a URL
// with no sslmode falls back to pg's `prefer`. The OL importer already
// enforces verified TLS for non-loopback hosts
// (tools/bible-import/src/cli.js); the app pools now do the same.
// Loopback stays plain: local development and tests use a
// certificate-less local database. sslmode=disable fails the boot.
function tlsOptionsFor(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error("Invalid database connection URL.");
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, "");
    if (LOOPBACK_HOSTS.has(host)) return {};
    if (parsed.searchParams.get("sslmode") === "disable") {
        throw new Error("Refusing a database connection with sslmode=disable.");
    }
    return { ssl: { rejectUnauthorized: true } };
}

function boundedInteger(env, name, fallback, min, max) {
    const value = env[name];
    if (value === undefined || value === "") return fallback;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
        throw new Error("Invalid database resource configuration.");
    }
    return Number(value);
}

function createPools(env = process.env) {
    assertSplitConfiguration(env);
    const appUrl = env.GNOSIS_APP_DATABASE_URL || env.DATABASE_URL || null;
    const bibleUrl = env.GNOSIS_BIBLE_DATABASE_URL || appUrl;
    const commentaryUrl = env.GNOSIS_COMMENTARY_DATABASE_URL || appUrl;
    // Production uses one connection URL.
    // Local development keeps using the existing DB_* settings.
    const localConfig = appUrl ? null : {
        user: env.DB_USER,
        host: env.DB_HOST,
        database: env.DB_NAME,
        password: env.DB_PASSWORD,
        port: env.DB_PORT
    };
    const statement = boundedInteger(env, "DB_STATEMENT_TIMEOUT_MS", 5000, 100, 30000);
    const lock = boundedInteger(env, "DB_LOCK_TIMEOUT_MS", 1000, 50, 5000);
    const idleTransaction = boundedInteger(env, "DB_IDLE_TRANSACTION_TIMEOUT_MS", 5000, 100, 30000);
    const max = boundedInteger(env, "DB_POOL_MAX", 5, 1, 10);
    if (lock >= statement) throw new Error("Database lock timeout must be shorter than the statement timeout.");
    const byKey = new Map();
    const poolFor = (url) => {
        const key = url || 'local';
        if (!byKey.has(key)) {
            let config = localConfig;
            if (url) {
                try {
                    // Parse once, then enforce policy. pg otherwise reparses a
                    // connectionString after config.ssl and timeout overrides.
                    config = require("pg-connection-string").parse(url);
                    const policy = tlsOptionsFor(url);
                    if (policy.ssl) config.ssl = { ...config.ssl, ...policy.ssl,
                        checkServerIdentity: require("node:tls").checkServerIdentity };
                } catch {
                    throw new Error("Invalid or unsafe database connection configuration.");
                }
            } else if (config.host && !LOOPBACK_HOSTS.has(config.host)) {
                config = { ...config, ssl: { rejectUnauthorized: true } };
            }
            // Arbitrary startup options can override enforced GUC limits.
            const { options: _options, ...safeConfig } = config;
            // Each backend instance maintains a small pool of reusable connections.
            const created = new Pool({
                ...safeConfig,
                options: `-c statement_timeout=${statement} -c lock_timeout=${lock} -c idle_in_transaction_session_timeout=${idleTransaction}`,
                statement_timeout: statement,
                lock_timeout: lock,
                idle_in_transaction_session_timeout: idleTransaction,
                query_timeout: statement + 1000,
                max,
                idleTimeoutMillis: 10000,
                connectionTimeoutMillis: 10000
            });
            // Handle errors from connections that are sitting idle.
            // Only the subsystem and the safe code are logged (audit
            // F02) — never the connection string or the message.
            created.on("error", (error) => {
                logPoolError(error);
            });
            byKey.set(key, created);
        }
        return byKey.get(key);
    };
    return {
        app: poolFor(appUrl),
        bible: poolFor(bibleUrl),
        commentary: poolFor(commentaryUrl)
    };
}

const pools = createPools();
const pool = pools.app;

module.exports = pool;
module.exports.appPool = pools.app;
module.exports.biblePool = pools.bible;
module.exports.commentaryPool = pools.commentary;
module.exports.createPools = createPools;
