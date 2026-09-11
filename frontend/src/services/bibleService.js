import API_URL from '../api/api';

// Fetch all Bible books.
export async function getBooks() {
    const response = await fetch(`${API_URL}/books`);

    return response.json();
}

// Fetch all verses for a specific book and chapter.
export async function getBibleChapter(book, chapter, translation) {
    const response = await fetch(
        `${API_URL}/bible/${book}/${chapter}/${translation}`
    );

    return response.json();
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