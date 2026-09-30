import API_URL from "../api/api";

export async function getBookmarks(token) {
    const response = await fetch(`${API_URL}/bookmarks`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Unable to load your bookmarks."
        );
    }

    return data;
}

export async function createBookmark(token, bookmarkData) {
    const response = await fetch(`${API_URL}/bookmarks`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(bookmarkData)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Unable to create bookmark."
        );
    }

    return data;
}

export async function updateBookmark(token, bookmarkId, bookmarkData) {
    const response = await fetch(
        `${API_URL}/bookmarks/${bookmarkId}`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(bookmarkData)
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Unable to update bookmark."
        );
    }

    return data;
}

export async function deleteBookmark(token, bookmarkId) {
    const response = await fetch(
        `${API_URL}/bookmarks/${bookmarkId}`,
        {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Unable to delete bookmark."
        );
    }

    return data;
}