import API_URL from "../api/api";

// Fetch the authenticated user's saved highlights.
export async function getHighlights(token) {
    const response = await fetch(`${API_URL}/highlights`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    // Read the JSON response for either success or failure.
    const data = await response.json();

    // Turn an unsuccessful HTTP response into an error the caller can catch.
    if (!response.ok) {
        throw new Error(
            data.error || "Unable to load your highlights."
        );
    }

    return data;
}

// Apply a color to every verse in the supplied passage.
export async function saveHighlights(token, bookId, verses, color) {
    const response = await fetch(`${API_URL}/highlights`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },

        // Send only the exact selected coordinates never fill gaps between them.
        body: JSON.stringify({
            bookId,
            verses,
            color
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Unable to save your highlights."
        );
    }

    // Return the individual verse records inserted or recolored by the backend.
    return data;
}

// Remove the authenticated user's highlights within a selected passage.
export async function clearHighlights(token, bookId, verses) {
    const response = await fetch(`${API_URL}/highlights/passage`, {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },

        // Clear only the coordinates included in the selection.
        body: JSON.stringify({
            bookId,
            verses
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Unable to clear your highlights."
        );
    }

    // The backend returns { removedIds: [...] } for updating React state.
    return data;
}