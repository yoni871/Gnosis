// Public, deterministic fixture bytes. These are deliberately not deployable
// secrets; the test suite checks validation and isolation, not entropy.
const { createHash } = require('node:crypto');
const fixture = label => createHash('sha256').update(`gnosis-public-test-${label}`).digest('hex');
module.exports = { JWT_SECRET: fixture('jwt'), RATE_LIMIT_KEY_SECRET: fixture('rate-limit') };
