import API_URL from '../api/api';

// Fetch a JSON list from the study API. A failed request or an
// unexpected payload is a thrown error, never a resolved value:
// callers treat these responses as arrays, so returning an error
// object here could crash the reader. Callers show their own
// friendly error state from the rejection instead.
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

// Fetch all available commentary sources.
export async function getCommentaries() {
    return getJsonList(`${API_URL}/commentaries`, "commentaries");
}

// Fetch commentary for a specific book, chapter, and commentator.
export async function getChapterCommentaries(
    bookId,
    chapter,
    commentaryId
) {
    return getJsonList(
        `${API_URL}/books/${bookId}/chapters/${chapter}/commentaries?commentaryId=${commentaryId}`,
        "commentary"
    );
}
