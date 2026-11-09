import API_URL from '../api/api';

// Fetch a JSON list from the study API. A failed request or an
// unexpected payload is a thrown error, never a resolved value:
// the reader treats these responses as arrays, so returning an
// error object here used to crash the whole page with
// "books.find is not a function". Callers show their own friendly
// error state from the rejection instead.
async function getJsonList(url, label) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Unable to load ${label}.`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
        throw new Error(`Unable to load ${label}.`);
    }

    return data;
}

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
    return getJsonList(`${API_URL}/books`, "books");
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
        } catch {
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
    return getJsonList(`${API_URL}/books/${bookId}/chapters`, "chapters");
}

//fetch all translations
export async function getTranslations() {
return getJsonList(`${API_URL}/translations`, "translations");

}
