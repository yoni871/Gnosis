const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Database tests exercise the local migration CLI in subprocesses. Its normal
// dotenv call must not read backend/.env during those synthetic fixtures.
// This preload is set only by our disposable launcher, never by application startup.
if (process.env.GNOSIS_TEST_DATABASE_PRELOAD === '1' && process.env.GNOSIS_TEST_ISOLATION === '1') {
    require('dotenv').config = () => ({ parsed: {} });
}

// Do not inherit application settings, PG defaults, NODE_OPTIONS or secrets.
function testEnvironment() {
    const env = {};
    for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TMP', 'TEMP']) {
        if (process.env[key]) env[key] = process.env[key];
    }
    return { ...env, GNOSIS_TEST_ISOLATION: '1', TZ: 'UTC' };
}

if (require.main === module) {
    const result = spawnSync(process.execPath, ['--test',
        'test/auth/authErrors.test.js', 'test/auth/authRoutes.test.js',
        'test/auth/authValidation.test.js', 'test/auth/rateLimit.test.js',
        'test/auth/serverConfig.test.js', 'test/config/environment.test.js',
        'test/migrations/config.test.js', 'test/dependencies/httpSecurity.test.js'], {
        cwd: path.resolve(__dirname, '..'), env: testEnvironment(), stdio: 'inherit',
    });
    process.exitCode = result.status ?? 1;
}

module.exports = { testEnvironment };
