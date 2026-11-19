const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const exceptions = require('./exceptions.json');
const rank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

// Packages formerly covered by the temporary GHSA-fc5q exception (advisory
// withdrawn 2026-11-18; exception removed 2026-11-19). The production-exposure
// check below asserts none of these is reachable from a production dependency
// or imported by runtime source; if one ever is, the gate fails closed. The
// check stays in place permanently: it costs nothing and guards the same
// invariant.
const TEMPORARY_EXCEPTION_PACKAGES = {
    backend: ['anymatch', 'chokidar', 'nodemon', 'picomatch', 'readdirp'],
    frontend: ['@vitejs/plugin-react', 'fdir', 'picomatch', 'tinyglobby', 'vite', 'vitest'],
};

function matchingExceptions(exceptionsList, scope, name, advisoryUrl, today) {
    return exceptionsList.filter(item => item.scope === scope && item.package === name &&
        item.advisories.includes(advisoryUrl) && item.expires >= today);
}

function evaluate(report, scope, today = new Date().toISOString().slice(0, 10), exceptionsList = exceptions) {
    if (report.error || !report.vulnerabilities || !report.metadata?.vulnerabilities) {
        throw new Error('Advisory scan did not return a complete result.');
    }
    const failures = [], accepted = [], acceptedDetails = [];
    const resolve = (name, seen = new Set()) => {
        if (seen.has(name)) return [];
        seen.add(name);
        const record = report.vulnerabilities[name];
        if (!record || !Array.isArray(record.via)) throw new Error('Incomplete advisory dependency chain.');
        return record.via.flatMap(via => typeof via === 'string' ? resolve(via, seen) : [via]);
    };
    for (const [name, record] of Object.entries(report.vulnerabilities)) {
        if (!(record.severity in rank)) throw new Error('Unknown advisory severity.');
        if (rank[record.severity] < rank.moderate) continue;
        const advisories = resolve(name);
        if (!advisories.length) throw new Error('Incomplete advisory dependency chain.');
        const allowed = advisories.every(advisory => {
            // High/critical advisories are never exceptable.
            const severityAllowed = rank[advisory.severity] <= rank.moderate;
            return severityAllowed &&
                matchingExceptions(exceptionsList, scope, name, advisory.url, today).length > 0;
        });
        if (allowed) {
            accepted.push(name);
            const urls = [...new Set(advisories.map(advisory => advisory.url))];
            const expires = urls.flatMap(url =>
                matchingExceptions(exceptionsList, scope, name, url, today).map(item => item.expires));
            acceptedDetails.push({ name, advisories: urls, expires: expires.length ? expires.sort()[0] : null });
        } else {
            failures.push(name);
        }
    }
    return { failures, accepted, acceptedDetails };
}

function productionClosure(lockfile) {
    // Walk the lockfile's `packages` map from the root `dependencies` only,
    // following `dependencies` and `optionalDependencies` edges. devDependencies
    // and peerDependencies are NOT followed: a package reachable only through
    // them is build/test tooling, not production code. (The frontend lockfile
    // carries no `dev: true` flag on picomatch, so lockfile flags cannot be
    // used for this.) Edges to packages absent from the lockfile are skipped:
    // an unlisted package is not installed and cannot pull anything into the
    // tree. Returns a Map of installed path -> how it was reached.
    const packages = lockfile.packages || {};
    if (!packages['']) throw new Error('Lockfile has no root package entry.');
    const seen = new Map();
    const queue = Object.keys(packages[''].dependencies || {}).map(name => [`node_modules/${name}`, 'root dependencies']);
    while (queue.length) {
        const [current, via] = queue.shift();
        if (seen.has(current) || !(current in packages)) continue;
        seen.set(current, via);
        const entry = packages[current];
        for (const field of ['dependencies', 'optionalDependencies']) {
            for (const dep of Object.keys(entry[field] || {})) {
                const nested = `${current}/node_modules/${dep}`;
                const candidate = nested in packages ? nested : `node_modules/${dep}`;
                if (candidate in packages && !seen.has(candidate)) {
                    queue.push([candidate, `${current} -${field}-> ${dep}`]);
                }
            }
        }
    }
    return seen;
}

function productionExposure(lockfile, packagesToCheck) {
    // Returns [{ package, path, via }] for every checked package reachable
    // from production dependencies, [] when none is. Fail-closed input: a
    // malformed lockfile throws instead of passing vacuously.
    const closure = productionClosure(lockfile);
    const found = [];
    for (const [entryPath, via] of closure) {
        const name = entryPath.split('node_modules/').pop();
        if (packagesToCheck.includes(name)) found.push({ package: name, path: entryPath, via });
    }
    return found;
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runtimeImports(srcDirs, packagesToCheck) {
    // Returns [{ file, package }] for every static import/require of a checked
    // package in runtime source. import.meta.glob literals are not package
    // imports and do not match. Test files (*.test.* / *.spec.*) and files
    // under test/ or __tests__/ directories are skipped: they run under the
    // test runner and are never bundled into production, so importing vitest
    // there is ordinary dev usage, not production exposure. A hit is a real
    // exposure: the frontend bundler and the backend runtime both resolve
    // transitive packages from node_modules, so a runtime import would ship
    // picomatch to production even though the lockfile check alone cannot
    // see it.
    const names = packagesToCheck.map(escapeRegExp).join('|');
    const pattern = new RegExp(`(?:from\\s+['"]|require\\(\\s*['"]|import\\s*\\(\\s*['"]|import\\s+['"])(${names})(?:['"/])`, 'g');
    const isTestFile = (full, name) => /\.(?:test|spec)\./.test(name) || full.split(path.sep).includes('test') || full.split(path.sep).includes('__tests__');
    const hits = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules') walk(full);
            } else if (/\.(?:js|jsx|ts|tsx|cjs|mjs)$/.test(entry.name) && !isTestFile(full, entry.name)) {
                const text = fs.readFileSync(full, 'utf8');
                for (const match of text.matchAll(pattern)) {
                    hits.push({ file: full, package: match[1] });
                }
            }
        }
    };
    for (const dir of srcDirs) {
        if (fs.existsSync(dir)) walk(dir);
    }
    return hits;
}

function checkProductionExposure() {
    // Fail-closed production-exposure check (offline, runs before the advisory
    // scan): none of the listed dev-only packages may be reachable from a
    // production dependency or imported by runtime source. Returns true when
    // a violation was found.
    let violated = false;
    for (const scope of ['backend', 'frontend']) {
        const packagesToCheck = TEMPORARY_EXCEPTION_PACKAGES[scope];
        try {
            const lockfile = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../..', scope, 'package-lock.json'), 'utf8'));
            for (const hit of productionExposure(lockfile, packagesToCheck)) {
                console.error(`Production exposure: ${scope}/${hit.package} is reachable from production dependencies (${hit.path} via ${hit.via}); the gate fails closed.`);
                violated = true;
            }
            const srcDir = path.resolve(__dirname, '../..', scope, 'src');
            for (const hit of runtimeImports([srcDir], packagesToCheck)) {
                console.error(`Production exposure: ${scope} runtime source imports ${hit.package} in ${hit.file}; the gate fails closed.`);
                violated = true;
            }
        } catch (err) {
            console.error(`${scope}: production-exposure check failed (${err.message}); refusing to pass without a complete result.`);
            violated = true;
        }
    }
    return violated;
}

function main() {
    let failed = checkProductionExposure();
    for (const scope of ['backend', 'frontend', 'tools/bible-import']) {
        const scan = spawnSync('npm', ['audit', '--package-lock-only', '--ignore-scripts', '--json'], {
            cwd: path.resolve(__dirname, '../..', scope), encoding: 'utf8', timeout: 120000,
            maxBuffer: 10 * 1024 * 1024,
        });
        try {
            if (scan.error || ![0, 1].includes(scan.status)) throw new Error('Advisory registry unavailable.');
            const result = evaluate(JSON.parse(scan.stdout), scope);
            console.log(`${scope}: ${result.failures.length} unaccepted, ${result.accepted.length} temporary exceptions`);
            for (const detail of result.acceptedDetails) {
                console.log(`Accepted temporary exception: ${scope}/${detail.name} ${detail.advisories.join(', ')} (expires ${detail.expires})`);
            }
            for (const name of result.failures) console.error(`Unaccepted dependency advisory: ${scope}/${name}`);
            failed ||= result.failures.length > 0;
        } catch {
            console.error(`${scope}: advisory scan failed; refusing to pass without a complete result.`);
            failed = true;
        }
    }
    process.exitCode = failed ? 1 : 0;
}
if (require.main === module) main();
module.exports = { evaluate, productionExposure, runtimeImports, TEMPORARY_EXCEPTION_PACKAGES };
