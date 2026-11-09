// Integration (#85 over #75, pair 5/N2): the per-note cap is 100,000
// bytes, not 32 KiB — it matches the 100,000-character controller cap and
// the 100 KiB JSON body limit, so a note at the cap is reachable in one
// request. For ASCII text bytes equal characters; multi-byte content hits
// this byte cap first. Owner call: 100,000 vs 32 KiB.
const MAX_NOTE_BYTES = 100_000;
function positiveInt(value, max = 2147483647) {
    return Number.isSafeInteger(value) && value > 0 && value <= max;
}
function validNote(body, partial = false) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    const coordinates = ['startChapter', 'startVerse', 'endChapter', 'endVerse'];
    const allowed = ['bookId', ...coordinates, 'content'];
    if (!Object.keys(body).length || Object.keys(body).some(key => !allowed.includes(key))) return false;
    if (!partial && allowed.some(key => body[key] === undefined)) return false;
    if (body.bookId !== undefined && !positiveInt(body.bookId)) return false;
    if (body.content !== undefined && (typeof body.content !== 'string' ||
        !body.content.trim() || Buffer.byteLength(body.content, 'utf8') > MAX_NOTE_BYTES)) return false;
    if (coordinates.some(key => body[key] !== undefined)) {
        if (!coordinates.every(key => positiveInt(body[key], 1000))) return false;
        if (body.endChapter < body.startChapter ||
            (body.endChapter === body.startChapter && body.endVerse < body.startVerse)) return false;
    }
    return true;
}
function recordId(req, res, next, value) {
    if (!/^[1-9]\d{0,9}$/.test(value) || !positiveInt(Number(value))) {
        return res.status(400).json({ error: 'Invalid resource ID.' });
    }
    next();
}
function validateSearch(req, res, next) {
    const { q, translation, page, limit } = req.query;
    const decimal = (value, max) => value === undefined ||
        (typeof value === 'string' && /^[1-9]\d*$/.test(value) && positiveInt(Number(value), max));
    if (Object.keys(req.query).some(key => !['q', 'translation', 'page', 'limit'].includes(key)) ||
        typeof q !== 'string' || !q.trim() || Buffer.byteLength(q, 'utf8') > 256 ||
        (translation !== undefined && (typeof translation !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(translation))) ||
        !decimal(page, 10001) || !decimal(limit, 100) ||
        (Number(page || 1) - 1) * Number(limit || 100) > 10000) {
        return res.status(400).set('Cache-Control', 'no-store').json({ error: 'Invalid search parameters.' });
    }
    next();
}
module.exports = { MAX_NOTE_BYTES, positiveInt, validNote, recordId, validateSearch };
