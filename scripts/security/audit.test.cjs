const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('./audit.cjs');
function report({ severity = 'moderate', url = 'https://github.com/advisories/GHSA-g3hv-75wg-m249', name = 'minimatch' } = {}) {
    return { metadata: { vulnerabilities: {} }, vulnerabilities: {
        [name]: { severity, via: [{ severity, url }] },
    } };
}
test('known backend exception is time-bound and scoped to exact advisory', () => {
    assert.deepEqual(evaluate(report(), 'backend', '2026-11-09').accepted, ['minimatch']);
    assert.deepEqual(evaluate(report(), 'backend', '2026-11-24').failures, ['minimatch']);
    assert.deepEqual(evaluate(report(), 'frontend', '2026-11-09').failures, ['minimatch']);
    assert.deepEqual(evaluate(report({ url: 'https://example.invalid/new' }), 'backend', '2026-11-09').failures, ['minimatch']);
    assert.deepEqual(evaluate(report({ severity: 'high' }), 'backend', '2026-11-09').failures, ['minimatch']);
});
test('registry errors, partial reports and unknown severity cannot pass', () => {
    for (const invalid of [{}, { error: {} }, { vulnerabilities: {} }, report({ severity: 'unknown' })]) {
        assert.throws(() => evaluate(invalid, 'backend'));
    }
});
test('propagated parent records resolve through their actual advisories', () => {
    const scan = report();
    scan.vulnerabilities.nodemon = { severity: 'moderate', via: ['minimatch'] };
    assert.deepEqual(evaluate(scan, 'backend', '2026-11-09').accepted, ['minimatch', 'nodemon']);
    scan.vulnerabilities.minimatch.via[0].url = 'https://example.invalid/new';
    assert.deepEqual(evaluate(scan, 'backend', '2026-11-09').failures, ['minimatch', 'nodemon']);
});
