// This validation also runs when a serverless wrapper imports app.js directly.
// Length and diversity catch mistakes; operators must generate random secrets.
function strongSecret(value) {
    return typeof value === 'string' && Buffer.byteLength(value, 'utf8') >= 32
        && new Set(value).size >= 12 && !/^(.)\1+$/.test(value)
        && !/change.?me|replace.?me|your.?secret|example.?secret/i.test(value);
}
function requireSecurityConfig(env = process.env) {
    if (!strongSecret(env.JWT_SECRET) || !strongSecret(env.RATE_LIMIT_KEY_SECRET)
        || env.JWT_SECRET === env.RATE_LIMIT_KEY_SECRET) {
        throw new Error('Server configuration error: invalid security configuration.');
    }
}
module.exports = { strongSecret, requireSecurityConfig };
