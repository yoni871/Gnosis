const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { testEnvironment } = require('../../scripts/test');

const loader = require.resolve('../../src/config/env');

test('isolated children ignore dotenv in both startup modes; normal loading and precedence remain intact', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnosis-env-test-'));
    try {
        fs.writeFileSync(path.join(dir, '.env'),
            'JWT_SECRET=synthetic-poison-secret\nDATABASE_URL=synthetic-poison-url\n');
        function probe(isolated, mode, extra = {}) {
            const env = { ...testEnvironment(), NODE_ENV: mode, ...extra };
            if (!isolated) delete env.GNOSIS_TEST_ISOLATION;
            const child = spawnSync(process.execPath, ['-e', `
                require(${JSON.stringify(loader)}).loadEnvironment({ quiet: true });
                process.stdout.write(JSON.stringify({
                    jwt: process.env.JWT_SECRET, database: process.env.DATABASE_URL
                }));`], { cwd: dir, env, encoding: 'utf8' });
            assert.equal(child.status, 0);
            return JSON.parse(child.stdout);
        }
        for (const mode of ['development', 'production']) {
            assert.deepEqual(probe(true, mode), {});
            assert.deepEqual(probe(false, mode), {
                jwt: 'synthetic-poison-secret', database: 'synthetic-poison-url',
            });
            assert.equal(probe(false, mode, { JWT_SECRET: 'synthetic-injected' }).jwt,
                'synthetic-injected');
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('test launcher drops inherited database settings, secrets and Node preload options', () => {
    const env = testEnvironment();
    assert.deepEqual(Object.keys(env).filter(key => ![
        'PATH', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TMP', 'TEMP',
        'GNOSIS_TEST_ISOLATION', 'TZ',
        // Issue #9: synthetic, non-routable email configuration for
        // application code imported by unit tests. These are not secrets
        // and must never be replaced with real values in tests.
        'RESEND_API_KEY', 'EMAIL_FROM', 'FRONTEND_URL',
    ].includes(key)), []);
    assert.equal(env.GNOSIS_TEST_ISOLATION, '1');
});
