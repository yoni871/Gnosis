import API_URL from '../api/api';

// Search the Bible using the user's search query.
export async function searchBible(query) {
    const response = await fetch(
        `${API_URL}/search/bible?q=${encodeURIComponent(query)}`
    );

    return response.json();
}