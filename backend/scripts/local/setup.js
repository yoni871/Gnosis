const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const example = fs.readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');
const values = { JWT_SECRET: randomBytes(32).toString('hex'), RATE_LIMIT_KEY_SECRET: randomBytes(32).toString('hex'),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    DB_PASSWORD: randomBytes(24).toString('hex'), MIGRATION_DB_PASSWORD: randomBytes(24).toString('hex') };
const content = example.replace(/^([A-Z_]+)=(.*)$/gm, (line, key) => key in values ? `${key}=${values[key]}` : line);
try {
    fs.writeFileSync(path.resolve(__dirname, '../../.env.local'), content, { flag: 'wx', mode: 0o600 });
    console.log('Created private backend/.env.local with random local credentials. Existing .env was not read or changed.');
} catch (error) {
    if (error.code === 'EEXIST') {
        const file=path.resolve(__dirname,'../../.env.local');
        const previous=fs.readFileSync(file,'utf8');
        // Upgrade PR #61's reader-only default; no credential or database setting changes.
        if (/^EMAIL_DELIVERY=disabled\s*$/m.test(previous)) {
            fs.writeFileSync(file,previous.replace(/^EMAIL_DELIVERY=disabled[ \t]*$/m,'EMAIL_DELIVERY=mailpit'),{mode:0o600});
            console.log('Enabled the local Mailpit inbox. Existing credentials and database settings were preserved.');
        } else console.log('backend/.env.local already exists; credentials left unchanged.');
    }
    else throw error;
}
