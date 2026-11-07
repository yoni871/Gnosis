'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Scan the actual materialized function artifact, not an installation directory.
function checkArtifact(directory) {
    if (!fs.statSync(directory).isDirectory()) throw new Error('Function artifact directory required.');
    let files = 0;
    function walk(dir, ancestors = new Set()) {
        const real = fs.realpathSync(dir);
        if (ancestors.has(real)) throw new Error('Artifact contains a cyclic symlink.');
        const next = new Set([...ancestors, real]);
        for (const name of fs.readdirSync(dir)) {
            const file = path.join(dir, name);
            const relative = path.relative(directory, file).replaceAll(path.sep, '/');
            if (/(^|\/)(xlsx|bible-import)(\/|$)|xlsx-.*\.tgz$|importBible\.js$/.test(relative)) {
                throw new Error('Offline spreadsheet tooling found in function artifact.');
            }
            if (fs.statSync(file).isDirectory()) walk(file, next);
            else {
                files++;
                if (/\.(?:js|cjs|mjs|json)$/.test(name) && /(?:require\s*\(\s*['"]xlsx['"]|tools\/bible-import|SheetJS)/.test(fs.readFileSync(file, 'utf8'))) {
                    throw new Error('Spreadsheet reference found in function artifact.');
                }
            }
        }
    }
    walk(directory);
    if (!files) throw new Error('Artifact is empty.');
    return files;
}
if (require.main === module) {
    try { console.log(`Verified ${checkArtifact(process.argv[2])} function artifact files: no offline spreadsheet tooling.`); }
    catch { console.error('Artifact exclusion check failed.'); process.exitCode = 1; }
}
module.exports = { checkArtifact };
