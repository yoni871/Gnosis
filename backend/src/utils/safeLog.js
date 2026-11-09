const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const context = new AsyncLocalStorage();
function requestContext(req, res, next) {
    const id = randomUUID(); // Never accept an attacker-provided correlation ID.
    res.set('X-Request-ID', id);
    context.run(id, next);
}
function logFailure(operation, error) {
    const code = error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
        ? error.code : 'INTERNAL';
    // Call sites supply constant operation names. No error messages, details,
    // stack traces, connection strings, SQL, request data or provider URLs.
    console.error(JSON.stringify({ operation, code, requestId: context.getStore() || 'background' }));
}
module.exports = { requestContext, logFailure };
