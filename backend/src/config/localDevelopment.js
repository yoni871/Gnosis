const path = require('node:path');
const fs = require('node:fs');
const loopback = value => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(value);
function assertLocalDatabase(env) {
    if (env.NODE_ENV !== 'development' || env.DATABASE_URL || !loopback(env.DB_HOST)
        || env.DB_NAME !== 'gnosis_local' || !env.DB_USER || !env.DB_PASSWORD
        || !/^\d+$/.test(env.DB_PORT || '') || Number(env.DB_PORT) < 1 || Number(env.DB_PORT) > 65535) {
        throw new Error('Local development requires an isolated gnosis_local database on loopback; DATABASE_URL is forbidden.');
    }
}
function loadLocalEnvironment() {
    if (process.env.NODE_ENV === 'production') throw new Error('Local development is forbidden in production.');
    const file = path.resolve(__dirname, '../../.env.local');
    if (!fs.existsSync(file)) throw new Error('Run npm run local:setup first. Existing .env is never used by npm run dev.');
    require('dotenv').config({ path: file, quiet: true });
    process.env.NODE_ENV = 'development';
    process.env.GNOSIS_LOCAL_DEV = '1';
    assertLocalDatabase(process.env);
}
module.exports = { loopback, assertLocalDatabase, loadLocalEnvironment };
