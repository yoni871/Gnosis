const { spawnSync } = require('node:child_process');
const path = require('node:path');
const exceptions = require('./exceptions.json');
const rank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
function evaluate(report, scope, today = new Date().toISOString().slice(0, 10)) {
    if (report.error || !report.vulnerabilities || !report.metadata?.vulnerabilities) {
        throw new Error('Advisory scan did not return a complete result.');
    }
    const failures = [], accepted = [];
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
        const allowed = advisories.every(advisory => rank[advisory.severity] <= rank.moderate &&
            exceptions.some(item => item.scope === scope && item.package === name &&
                item.advisories.includes(advisory.url) && item.expires >= today));
        (allowed ? accepted : failures).push(name);
    }
    return { failures, accepted };
}
function main() {
    let failed = false;
    for (const scope of ['backend', 'frontend', 'tools/bible-import']) {
        const scan = spawnSync('npm', ['audit', '--package-lock-only', '--ignore-scripts', '--json'], {
            cwd: path.resolve(__dirname, '../..', scope), encoding: 'utf8', timeout: 120000,
            maxBuffer: 10 * 1024 * 1024,
        });
        try {
            if (scan.error || ![0, 1].includes(scan.status)) throw new Error('Advisory registry unavailable.');
            const result = evaluate(JSON.parse(scan.stdout), scope);
            console.log(`${scope}: ${result.failures.length} unaccepted, ${result.accepted.length} temporary exceptions`);
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
module.exports = { evaluate };
