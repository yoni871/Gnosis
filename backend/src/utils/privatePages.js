const MAX_PAGE_BYTES = 512 * 1024;
function publicError(code, message, status) { return Object.assign(new Error(message), { code, status }); }
function readPage(req, resource) {
    const allowed = resource !== 'notes' ? ['limit', 'cursor', 'bookId', 'chapter'] : ['limit', 'cursor'];
    const max = resource === 'notes' ? 20 : 100;
    const defaults = resource === 'notes' ? 20 : 50;
    const integer = (value, cap) => typeof value === 'string' && /^[1-9]\d*$/.test(value)
        && Number.isSafeInteger(Number(value)) && Number(value) <= cap;
    const query = req.query;
    if (Object.keys(query).some(key => !allowed.includes(key)) ||
        (query.limit !== undefined && !integer(query.limit, max)) ||
        (query.cursor !== undefined && !integer(query.cursor, 2147483647)) ||
        (query.bookId !== undefined && !integer(query.bookId, 2147483647)) ||
        (query.chapter !== undefined && (!query.bookId || !integer(query.chapter, 1000)))) {
        throw publicError('INVALID_PAGE', 'Invalid saved-data page parameters.', 400);
    }
    return { limit: Number(query.limit || defaults), cursor: query.cursor ? Number(query.cursor) : null,
        bookId: query.bookId ? Number(query.bookId) : null, chapter: query.chapter ? Number(query.chapter) : null,
        envelope: query.limit !== undefined || query.cursor !== undefined };
}
function pageRows(rows, limit) {
    const items = [];
    let bytes = 1024; // Reserve room for envelope/cursor metadata.
    for (const row of rows.slice(0, limit)) {
        const size = Buffer.byteLength(JSON.stringify(row), 'utf8') + 1;
        if (bytes + size > MAX_PAGE_BYTES) break;
        items.push(row); bytes += size;
    }
    if (rows.length && !items.length) throw publicError('ITEM_TOO_LARGE', 'Saved item is too large to list.', 413);
    const hasMore = rows.length > items.length;
    return { items, hasMore, nextCursor: hasMore ? String(items.at(-1).id) : null };
}
function sendPage(res, page, config) {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Next-Cursor', page.nextCursor || '');
    res.set('X-Has-More', String(page.hasMore));
    return res.status(200).json(config.envelope ? page : page.items);
}
function knownResourceError(error, res) {
    if (!['INVALID_PAGE', 'ITEM_TOO_LARGE', 'RESOURCE_LIMIT', 'RESOURCE_BUSY'].includes(error?.code)) return false;
    if (error.status === 429) res.set('Retry-After', '1');
    res.status(error.status).set('Cache-Control', 'private, no-store').json({ error: error.message, code: error.code });
    return true;
}
module.exports = { readPage, pageRows, sendPage, knownResourceError, publicError, MAX_PAGE_BYTES };
