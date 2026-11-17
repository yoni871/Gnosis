const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { evaluate, productionExposure, runtimeImports, TEMPORARY_HIGH_SEVERITY_ADVISORY } = require('./audit.cjs');
const FC5Q = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
function report({ severity = 'moderate', url = 'https://github.com/advisories/GHSA-g3hv-75wg-m249', name = 'minimatch' } = {}) {
    return { metadata: { vulnerabilities: {} }, vulnerabilities: {
        [name]: { severity, via: [{ severity, url }] },
    } };
}
// The real audit chains for GHSA-fc5q (see the CI gate output): each package
// resolves through its `via` chain to the single picomatch advisory.
const BACKEND_CHAIN = {
    picomatch: { severity: 'high', via: [{ severity: 'high', url: FC5Q }] },
    anymatch: { severity: 'high', via: ['picomatch'] },
    readdirp: { severity: 'high', via: ['picomatch'] },
    chokidar: { severity: 'high', via: ['anymatch', 'readdirp'] },
    nodemon: { severity: 'high', via: ['chokidar'] },
};
const FRONTEND_CHAIN = {
    picomatch: { severity: 'high', via: [{ severity: 'high', url: FC5Q }] },
    fdir: { severity: 'high', via: ['picomatch'] },
    tinyglobby: { severity: 'high', via: ['fdir', 'picomatch'] },
    vite: { severity: 'high', via: ['picomatch', 'tinyglobby'] },
    vitest: { severity: 'high', via: ['picomatch', 'tinyglobby', 'vite'] },
    '@vitejs/plugin-react': { severity: 'high', via: ['vite'] },
};
function chainReport(chain) {
    return { metadata: { vulnerabilities: {} }, vulnerabilities: chain };
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
test('temporary GHSA-fc5q exception accepts all 11 packages in both scopes', () => {
    assert.equal(TEMPORARY_HIGH_SEVERITY_ADVISORY, FC5Q);
    const backend = evaluate(chainReport(BACKEND_CHAIN), 'backend', '2026-11-17');
    assert.deepEqual(backend.accepted.sort(), ['anymatch', 'chokidar', 'nodemon', 'picomatch', 'readdirp']);
    assert.deepEqual(backend.failures, []);
    const frontend = evaluate(chainReport(FRONTEND_CHAIN), 'frontend', '2026-11-17');
    assert.deepEqual(frontend.accepted.sort(), ['@vitejs/plugin-react', 'fdir', 'picomatch', 'tinyglobby', 'vite', 'vitest']);
    assert.deepEqual(frontend.failures, []);
    // The accepted advisory stays visible: every accepted package is logged
    // with its advisory URL and expiry.
    for (const detail of [...backend.acceptedDetails, ...frontend.acceptedDetails]) {
        assert.deepEqual(detail.advisories, [FC5Q]);
        assert.equal(detail.expires, '2026-12-15');
    }
    assert.equal(backend.acceptedDetails.length + frontend.acceptedDetails.length, 11);
    // The expiry date itself is still accepted (the check is inclusive).
    assert.deepEqual(evaluate(chainReport(BACKEND_CHAIN), 'backend', '2026-12-15').failures, []);
});
test('temporary GHSA-fc5q exception fails closed after expiry', () => {
    assert.deepEqual(evaluate(chainReport(BACKEND_CHAIN), 'backend', '2026-12-16').accepted, []);
    assert.deepEqual(evaluate(chainReport(BACKEND_CHAIN), 'backend', '2026-12-16').failures.sort(),
        ['anymatch', 'chokidar', 'nodemon', 'picomatch', 'readdirp']);
    assert.deepEqual(evaluate(chainReport(FRONTEND_CHAIN), 'frontend', '2026-12-16').failures.sort(),
        ['@vitejs/plugin-react', 'fdir', 'picomatch', 'tinyglobby', 'vite', 'vitest']);
});
test('temporary GHSA-fc5q exception fails closed on a changed dependency path', () => {
    const chain = { ...BACKEND_CHAIN, 'some-new-package': { severity: 'high', via: ['picomatch'] } };
    const result = evaluate(chainReport(chain), 'backend', '2026-11-17');
    assert.deepEqual(result.failures, ['some-new-package']);
    assert.deepEqual(result.accepted.sort(), ['anymatch', 'chokidar', 'nodemon', 'picomatch', 'readdirp']);
});
test('a different high-severity advisory is still refused even with a matching exception entry', () => {
    const other = 'https://github.com/advisories/GHSA-ffff-ffff-ffff';
    const exceptionsList = [
        { scope: 'backend', package: 'minimatch', advisories: [other], expires: '2026-12-15', reason: 'test fixture' },
    ];
    const high = report({ severity: 'high', url: other });
    assert.deepEqual(evaluate(high, 'backend', '2026-11-17', exceptionsList).failures, ['minimatch']);
    // Control: the same entry does accept the same advisory at moderate
    // severity, so only the high-severity rule is doing the refusing.
    const moderate = report({ severity: 'moderate', url: other });
    assert.deepEqual(evaluate(moderate, 'backend', '2026-11-17', exceptionsList).accepted, ['minimatch']);
});
test('a second advisory on the same package is rejected', () => {
    const other = 'https://github.com/advisories/GHSA-aaaa-aaaa-aaaa';
    const scan = chainReport({
        picomatch: { severity: 'high', via: [
            { severity: 'high', url: FC5Q },
            { severity: 'moderate', url: other },
        ] },
    });
    assert.deepEqual(evaluate(scan, 'backend', '2026-11-17').failures, ['picomatch']);
});
test('production-exposure check flags a prod-reachable package and passes a dev-only tree', () => {
    const devOnly = { packages: {
        '': { dependencies: { app: '^1.0.0' }, devDependencies: { tool: '^1.0.0' } },
        'node_modules/app': { dependencies: {} },
        'node_modules/tool': { dependencies: { picomatch: '^4.0.7' } },
        'node_modules/picomatch': { dependencies: {} },
    } };
    assert.deepEqual(productionExposure(devOnly, ['picomatch']), []);
    const prodReachable = { packages: {
        '': { dependencies: { app: '^1.0.0' } },
        'node_modules/app': { dependencies: { helper: '^1.0.0' } },
        'node_modules/helper': { dependencies: { picomatch: '^4.0.7' } },
        'node_modules/picomatch': { dependencies: {} },
    } };
    const found = productionExposure(prodReachable, ['picomatch']);
    assert.equal(found.length, 1);
    assert.equal(found[0].package, 'picomatch');
    assert.equal(found[0].path, 'node_modules/picomatch');
    // A nested copy under a production package is still exposure.
    const nested = { packages: {
        '': { dependencies: { app: '^1.0.0' } },
        'node_modules/app': { dependencies: { helper: '^1.0.0' } },
        'node_modules/helper': { dependencies: { picomatch: '^4.0.7' } },
        'node_modules/helper/node_modules/picomatch': { dependencies: {} },
    } };
    assert.equal(productionExposure(nested, ['picomatch'])[0].path, 'node_modules/helper/node_modules/picomatch');
    // Peer and dev edges do not make a package production-reachable.
    const peerOnly = { packages: {
        '': { dependencies: { app: '^1.0.0' } },
        'node_modules/app': { peerDependencies: { vite: '^8.0.0' } },
        'node_modules/vite': { dependencies: { picomatch: '^4.0.7' } },
        'node_modules/picomatch': { dependencies: {} },
    } };
    assert.deepEqual(productionExposure(peerOnly, ['picomatch', 'vite']), []);
    // A malformed lockfile throws instead of passing vacuously.
    assert.throws(() => productionExposure({ packages: {} }, ['picomatch']));
});
test('runtime-import check finds a real import and ignores import.meta.glob literals', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
    try {
        fs.writeFileSync(path.join(dir, 'a.js'), "import picomatch from 'picomatch';\n");
        fs.writeFileSync(path.join(dir, 'b.js'), "const loaders = import.meta.glob(\"../generated/*.json\", { eager: true });\n");
        fs.writeFileSync(path.join(dir, 'c.js'), "const x = require(\"vite\");\n");
        fs.writeFileSync(path.join(dir, 'd.jsx'), "export default function App() { return null; }\n");
        // Test files are dev usage, not production exposure: a vitest import
        // in a *.test.* file (or under a test/ directory) must not be flagged.
        fs.writeFileSync(path.join(dir, 'e.test.js'), "import { describe } from 'vitest';\n");
        fs.mkdirSync(path.join(dir, 'test'));
        fs.writeFileSync(path.join(dir, 'test', 'setup.js'), "import { expect } from 'vitest';\n");
        const hits = runtimeImports([dir], ['picomatch', 'vite']);
        assert.deepEqual(hits.map(hit => [path.basename(hit.file), hit.package]), [['a.js', 'picomatch'], ['c.js', 'vite']]);
        assert.deepEqual(runtimeImports([dir], ['tinyglobby']), []);
        // vitest is only flaggable in runtime (non-test) source.
        assert.deepEqual(runtimeImports([dir], ['vitest']), []);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
