// Per-worker protection complements edge/distributed limits. Bounded state,
// bounded in-flight SQL work, and socket identity avoid trusting caller headers.
function createSearchBudget({ maxRequests = 60, maxConcurrent = 8, windowMs = 60000,
    maxClients = 4096, now = Date.now } = {}) {
    const clients = new Map();
    let concurrent = 0;
    return (req, res, next) => {
        const time = now();
        for (const [key, value] of clients) if (value.until <= time) clients.delete(key);
        const key = req.socket.remoteAddress;
        let bucket = clients.get(key);
        if (!bucket && clients.size < maxClients) {
            bucket = { used: 0, until: time + windowMs };
            clients.set(key, bucket);
        }
        if (!key || !bucket || bucket.used >= maxRequests || concurrent >= maxConcurrent) {
            return res.status(429).set({ 'Cache-Control': 'no-store', 'Retry-After': '60' })
                .json({ error: 'Too many search requests.', code: 'RATE_LIMITED' });
        }
        bucket.used++;
        concurrent++;
        let released = false;
        const release = () => { if (!released) { released = true; concurrent--; } };
        res.once('finish', release);
        res.once('close', release);
        next();
    };
}
module.exports = { createSearchBudget };
