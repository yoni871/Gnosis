const { Pool } = require("pg");
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
    const byKey = new Map();
    const poolFor = (url) => {
        const key = url || 'local';
        if (!byKey.has(key)) {
            const config = url ? { connectionString: url } : localConfig;
            // Each backend instance maintains a small pool of reusable connections.
            const created = new Pool({
                ...config,
                max: 5,
                idleTimeoutMillis: 10000,
                connectionTimeoutMillis: 10000
            });
            // Handle errors from connections that are sitting idle.
            created.on("error", (error) => {
                console.error("Unexpected database connection error:", error.message);
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
