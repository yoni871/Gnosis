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
    // Issue #9: application code imported by unit tests (notably app.js)
    // validates email configuration at import time. These are synthetic,
    // clearly non-routable values, never real credentials: the test
    // sender address uses the .invalid TLD and the key is not a Resend
    // key. Real email configuration is never present in unit tests.
    return { ...env, GNOSIS_TEST_ISOLATION: '1', TZ: 'UTC',
        RESEND_API_KEY: 'synthetic-test-resend-key',
        EMAIL_FROM: 'Gnosis Test <test@example.invalid>',
        FRONTEND_URL: 'https://frontend.example.invalid' };
}

if (require.main === module) {
    const result = spawnSync(process.execPath, ['--test',
        'test/auth/authErrors.test.js', 'test/auth/sessions.test.js', 'test/auth/authRoutes.test.js',
        'test/auth/authValidation.test.js', 'test/auth/rateLimit.test.js',
        'test/auth/emailConfig.test.js', 'test/auth/verification.test.js',
        'test/auth/resendClient.test.js', 'test/auth/emailVerification.test.js',
        'test/auth/passwordReset.test.js', 'test/auth/passwordResetRoutes.test.js',
        'test/auth/passkeys.test.js', 'test/auth/serverConfig.test.js', 'test/config/environment.test.js',
        'test/config/localDevelopment.test.js', 'test/local/catalog.test.js',
        'test/local/language-download.test.js',
        'test/migrations/config.test.js', 'test/dependencies/httpSecurity.test.js',
        'test/translations/licensedProviders.test.js',
        'test/translations/licensedService.test.js',
        'test/application/readingState.test.js',
        'test/application/crossProjectValidation.test.js',
        'test/db/pools.test.js',
        'test/application/searchPagination.test.js',
        'test/application/cacheHeaders.test.js',
        'test/importer/originalLanguage.test.js',
        'test/application/originalLanguage.test.js'], {
        cwd: path.resolve(__dirname, '..'), env: testEnvironment(), stdio: 'inherit',
    });
    process.exitCode = result.status ?? 1;
}

module.exports = { testEnvironment };
