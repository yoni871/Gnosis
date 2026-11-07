import API_URL from '../api/api';

// In-memory commentary cache: switching commentators and back, or
// revisiting a chapter, never re-fetches within the visit. Bounded to
// the most recent 20 chapter/commentator pairs and never persisted —
// the same shape as the chapter cache in bibleService.js. Only
// successful array payloads are cached; anything else (an error body)
// is returned uncached, exactly as before.
const commentaryCache = new Map();
const COMMENTARY_CACHE_MAX = 20;

function commentaryCacheKey(bookId, chapter, commentaryId) {
    return `${bookId}:${chapter}:${commentaryId}`;
}

export function clearCommentaryCacheForTests() {
    commentaryCache.clear();
}

// Fetch all available commentary sources.
export async function getCommentaries() {
    const response = await fetch(`${API_URL}/commentaries`);

    return response.json();
}

// Fetch commentary for a specific book, chapter, and commentator.
export async function getChapterCommentaries(
    bookId,
    chapter,
    commentaryId
) {
    const key = commentaryCacheKey(bookId, chapter, commentaryId);
    const cached = commentaryCache.get(key);
    if (cached) {
        return cached;
    }
    const response = await fetch(
        `${API_URL}/books/${bookId}/chapters/${chapter}/commentaries?commentaryId=${commentaryId}`
    );

    const data = await response.json();
    if (Array.isArray(data)) {
        commentaryCache.set(key, data);
        if (commentaryCache.size > COMMENTARY_CACHE_MAX) {
            commentaryCache.delete(commentaryCache.keys().next().value);
        }
    }
    return data;
}