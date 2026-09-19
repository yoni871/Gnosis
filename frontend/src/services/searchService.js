import API_URL from '../api/api';

// Search the Bible using the user's search query.
export async function searchBible(query, translation = "BSB") {
    const response = await fetch(
        `${API_URL}/search/bible?q=${encodeURIComponent(query)}` +
        `&translation=${encodeURIComponent(translation)}`
    );

    return response.json();
}

// Search all available commentaries using the user's search query.
export async function searchCommentary(query) {
    const response = await fetch(
        `${API_URL}/search/commentary?q=${encodeURIComponent(query)}`
    );

    return response.json();
}