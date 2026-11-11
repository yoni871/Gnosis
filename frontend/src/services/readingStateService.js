import API_URL from "../api/api";

// A missing saved position is not an error: it only means this reader
// has not left off anywhere yet, so there is no Continue button.
export async function getReadingState(token) {
    const response = await fetch(`${API_URL}/reading-state`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (response.status === 404) {
        return null;
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Unable to load your reading position."
        );
    }

    return data;
}

export async function saveReadingState(token, readingState) {
    const response = await fetch(`${API_URL}/reading-state`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(readingState)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Unable to save your reading position."
        );
    }

    return data;
}
