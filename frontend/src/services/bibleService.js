import API_URL from '../api/api';

// In-memory chapter cache: moving between chapters, or switching
// translations and back, never re-fetches within the visit. Bounded to
// the most recent 20 chapters and never persisted — licensed text is not
// stored in the browser beyond the current visit.
const chapterCache = new Map();
const CHAPTER_CACHE_MAX = 20;

function cacheKey(book, chapter, translation) {
    return `${book}:${chapter}:${translation}`;
}

export function clearChapterCacheForTests() {
    chapterCache.clear();
}

// Fetch all Bible books.
export async function getBooks() {
    const response = await fetch(`${API_URL}/books`);

    return response.json();
}

// Fetch all verses for a specific book and chapter.
export async function getBibleChapter(book, chapter, translation) {
    const key = cacheKey(book, chapter, translation);
    const cached = chapterCache.get(key);
    if (cached) {
        return cached;
    }
    const response = await fetch(
        `${API_URL}/bible/${book}/${chapter}/${translation}`
    );
    if (!response.ok) {
        let code = null;
        try {
            const body = await response.json();
            code = body.code || null;
        } catch (error) {
            // An unreadable error body carries no code; the status is enough.
        }
        const error = new Error("Unable to load Scripture.");
        error.status = response.status;
        error.code = code;
        throw error;
    }
    const data = await response.json();
    if (Array.isArray(data)) {
        chapterCache.set(key, data);
        if (chapterCache.size > CHAPTER_CACHE_MAX) {
            chapterCache.delete(chapterCache.keys().next().value);
        }
    }
    return data;
}

// Fetch all chapters for a specific book.
export async function getChapters(bookId) {
    const response = await fetch(
        `${API_URL}/books/${bookId}/chapters`
    );

    return response.json();
}

//fetch all translations
export async function getTranslations() {
    const response = await fetch(`${API_URL}/translations`);

    return response.json();
}
