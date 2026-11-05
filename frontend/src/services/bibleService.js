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

// Fetch all Bible books.
export async function getBooks() {
    return getJsonList(`${API_URL}/books`, "books");
}

// Fetch all verses for a specific book and chapter.
export async function getBibleChapter(book, chapter, translation) {
    return getJsonList(
        `${API_URL}/bible/${book}/${chapter}/${translation}`,
        "Scripture"
    );
}

// Fetch all chapters for a specific book.
export async function getChapters(bookId) {
    return getJsonList(`${API_URL}/books/${bookId}/chapters`, "chapters");
}

//fetch all translations
export async function getTranslations() {
    return getJsonList(`${API_URL}/translations`, "translations");
}
