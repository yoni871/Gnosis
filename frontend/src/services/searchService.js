import API_URL from '../api/api';

// Search data is public and static. Bound memory and expire entries after one minute.
const recent = new Map();
const TTL = 60_000;
async function search(path, params, signal) {
    const url = `${API_URL}/search/${path}?${new URLSearchParams(params)}`;
    const cached = recent.get(url);
    if (cached && Date.now() - cached.time < TTL) return cached.data;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Search request failed.');
    const data = await response.json();
    if (!signal?.aborted) {
        recent.delete(url);
        recent.set(url, { data, time: Date.now() });
        if (recent.size > 20) recent.delete(recent.keys().next().value);
    }
    return data;
}

export function searchBible(query, translation = 'BSB', { signal, page = 1, limit } = {}) {
    // Offset pagination: the backend caps every page at 100 rows and
    // returns { results, total, page, limit, hasMore } with a fully
    // deterministic rank order, so the page can keep appending with
    // Load More and never skip or repeat a verse. The page number is
    // part of the URL, so each page is cached separately.
    const params = { q: query, translation, page };
    if (limit !== undefined) params.limit = limit;
    return search('bible', params, signal);
}

export function searchCommentary(query, { signal } = {}) {
    return search('commentary', { q: query }, signal);
}
