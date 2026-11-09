// Request-correlation middleware (ported from #75's safeLog.js by the
// integration disposition, pair 2). ADDITIVE layer only: every /api
// response carries a fresh X-Request-ID, and the id is available to
// later middleware/handlers through the AsyncLocalStorage context. It
// is not a logger — failure logging lives in the shared allowlisted
// logger in utils/authErrors.js (#80), which does not read this
// context. The id is always server-generated; an attacker-provided
// correlation id is never accepted.
const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");

const context = new AsyncLocalStorage();

function requestContext(req, res, next) {
    const id = randomUUID(); // Never accept an attacker-provided correlation ID.
    res.set("X-Request-ID", id);
    context.run(id, next);
}

function getRequestId() {
    return context.getStore() || null;
}

module.exports = { requestContext, getRequestId };
