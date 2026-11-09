// Thin wrapper over the single secret-strength bar in
// utils/secretStrength.js (integration of #72 over #81): #72's
// distinct-char floor, placeholder ban, and JWT!=RATE_LIMIT rule live
// there now, so the import-time check (app.js), the boot check
// (server.js), and check-config.js all enforce the same bar. Kept so
// existing import sites and tests keep working.
const { isStrongSecret, requireStrongSecrets } = require("../utils/secretStrength");

function strongSecret(value) {
    return isStrongSecret(value);
}

function requireSecurityConfig(env = process.env) {
    requireStrongSecrets(env);
}

module.exports = { strongSecret, requireSecurityConfig };
