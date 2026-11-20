// Shared pagination parsing for private list endpoints (F04), matching
// the search route's convention: limit defaults to 100 and is clamped
// to 1-100, offset defaults to 0 and is clamped to >= 0. Non-numeric,
// zero, and negative values fall back to the defaults instead of a 400,
// so a bad query parameter can never produce an unbounded result set or
// an unbounded OFFSET. The applied values are returned so callers can
// expose them (list responses carry X-Limit / X-Offset headers).
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

function parsePagination(query) {
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(query.limit, 10) || DEFAULT_LIMIT));
    const offset = Math.max(0, Number.parseInt(query.offset, 10) || 0);
    return { limit, offset };
}

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, parsePagination };
