// Sets a public Cache-Control header so Vercel's edge (s-maxage) and
// the browser (max-age) can serve deterministic, public responses
// without invoking the function or hitting Neon on every request.
// Only for GET endpoints whose data changes on deploy or import —
// never on authenticated or user-specific responses. Vercel only
// caches 2xx responses at the edge, so an error body is never served
// from cache, and a new deployment purges the edge cache.
function cacheControl({ maxAge = 60, sMaxAge = 3600, staleWhileRevalidate = 300 } = {}) {
    return (req, res, next) => {
        if (process.env.GNOSIS_LOCAL_DEV === '1' && process.env.NODE_ENV === 'development') {
            // Local imports are not deployments: the next reload must see newly imported data.
            res.set('Cache-Control','no-store');
            return next();
        }
        res.set(
            "Cache-Control",
            `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`
        );
        next();
    };
}

module.exports = { cacheControl };
