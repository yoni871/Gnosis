const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const example = fs.readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');
const values = { JWT_SECRET: randomBytes(32).toString('hex'), RATE_LIMIT_KEY_SECRET: randomBytes(32).toString('hex'),
    DB_PASSWORD: randomBytes(24).toString('hex'), MIGRATION_DB_PASSWORD: randomBytes(24).toString('hex') };
const content = example.replace(/^([A-Z_]+)=(.*)$/gm, (line, key) => key in values ? `${key}=${values[key]}` : line);
try {
    fs.writeFileSync(path.resolve(__dirname, '../../.env.local'), content, { flag: 'wx', mode: 0o600 });
    console.log('Created private backend/.env.local with random local credentials. Existing .env was not read or changed.');
} catch (error) {
    if (error.code === 'EEXIST') console.log('backend/.env.local already exists; left unchanged.');
    else throw error;
}
