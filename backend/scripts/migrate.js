const fs = require('node:fs/promises');
const path = require('node:path');
const { parseArgs, migrationsDir, safeError } = require('./migrations/config');
const { execute } = require('./migrations/runner');

async function main() {
    const options = parseArgs(process.argv.slice(2));
    // Only explicitly local commands load backend/.env; production/tests never do.
    if (options.target === 'local') require('dotenv').config({path:path.resolve(__dirname,'../.env'), quiet:true});
    if (options.command === 'create') {
        const stamp = new Date().toISOString().replace(/\D/g,'').slice(0,14);
        const name = `${stamp}_${options.description}.sql`;
        await fs.writeFile(path.join(migrationsDir,name),
            '-- Up Migration\n\n-- Down Migration\nDO $$ BEGIN RAISE EXCEPTION \'Define a safe reversal or document this migration as irreversible\'; END $$;\n', {flag:'wx'});
        console.log(`Created migration ${name}.`);
    } else {
        console.log(JSON.stringify(await execute(options), null, 2));
    }
}
main().catch(error => {
    console.error(error.safe ? error.message : safeError('Migration command failed; details suppressed to protect credentials.').message);
    process.exitCode = 1;
});
