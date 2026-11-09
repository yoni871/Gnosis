// Opt-in diagnostics: field names only, no values and no database connection.
require('../src/config/env').loadEnvironment({quiet:true});
const { isStrongSecret } = require('../src/utils/secretStrength');
const env = process.env;
const fields = ['JWT_SECRET','RATE_LIMIT_KEY_SECRET'].filter(key => !isStrongSecret(env[key]));
// Ported from #72: the two secrets must differ. Listed under both names
// when both are individually strong but equal.
if (fields.length === 0 && env.JWT_SECRET === env.RATE_LIMIT_KEY_SECRET) {
    fields.push('JWT_SECRET', 'RATE_LIMIT_KEY_SECRET');
}
const email = require('../src/config/emailConfig').validateEmailConfig(env);
fields.push(...(email.errors || []).map(error => error.field));
try { require('../src/utils/rateLimit').resolveTrustProxy(env.TRUST_PROXY); } catch { fields.push('TRUST_PROXY'); }
console.log(fields.length ? `Missing or invalid configuration fields: ${fields.join(', ')}` : 'Startup configuration fields are valid.');
console.log(env.DATABASE_URL ? 'Database selection: DATABASE_URL overrides DB_* (connection not attempted).' : 'Database selection: DB_* (connection not attempted).');
process.exitCode = fields.length ? 1 : 0;
