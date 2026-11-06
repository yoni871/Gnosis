'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
function testEnvironment() {
    const env = { GNOSIS_TEST_ISOLATION: '1', TZ: 'UTC', JWT_SECRET: 'synthetic-offline-test-secret',
        RESEND_API_KEY: 're_synthetic_offline_test', EMAIL_FROM: 'test@example.invalid',
        FRONTEND_URL: 'https://example.invalid' };
    for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TMP', 'TEMP']) {
        if (process.env[key]) env[key] = process.env[key];
    }
    return env;
}
if (require.main === module) {
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1',
        'test/parser.test.js', 'test/importer.test.js', 'test/cli.test.js', 'test/production-boundary.test.js'], {
        cwd: path.resolve(__dirname, '..'), env: testEnvironment(), stdio: 'inherit', timeout: 120000,
    });
    process.exitCode = result.status === 0 ? 0 : 1;
}
module.exports = { testEnvironment };
