import API_URL from '../api/api';

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
    const response = await fetch(
        `${API_URL}/books/${bookId}/chapters/${chapter}/commentaries?commentaryId=${commentaryId}`
    );

    return response.json();
}