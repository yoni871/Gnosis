// Requires an explicit target before loading any tests or database configuration.
const { spawnSync } = require('node:child_process');
if (process.argv.slice(2).join(' ') !== '--target test') {
    console.error('Use npm run test:migrations -- --target test.');
    process.exitCode = 1;
} else {
    const result = spawnSync(process.execPath, ['--test', 'test/migrations/config.test.js',
        'test/migrations/integration.test.js'], {cwd:require('node:path').resolve(__dirname,'..'),
        env:{...process.env, GNOSIS_MIGRATION_TEST_TARGET:'test'}, stdio:'inherit'});
    process.exitCode = result.status ?? 1;
}
