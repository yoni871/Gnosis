export function privatePageUrl(base, resource, cursor = null, filters = {}) {
    const params = new URLSearchParams({ limit: resource === 'notes' ? '20' : filters.bookId ? '100' : '50' });
    if (cursor) params.set('cursor', cursor);
    if (filters.bookId) params.set('bookId', String(filters.bookId));
    if (filters.chapter) params.set('chapter', String(filters.chapter));
    return `${base}/${resource}?${params}`;
}
export function privatePage(data) {
    // Compatible with existing array-only API/test responses during rollout.
    if (Array.isArray(data)) return { items: data, nextCursor: null };
    if (!data || !Array.isArray(data.items) ||
        (data.nextCursor !== null && !/^[1-9]\d*$/.test(data.nextCursor))) {
        throw new Error('Unable to load saved items.');
    }
    return data;
}
export function appendCollection(current, incoming) {
    const seen = new Set(current.map(item => item.id));
    const extra = incoming.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
    return extra.length ? [...current, ...extra] : current;
}
