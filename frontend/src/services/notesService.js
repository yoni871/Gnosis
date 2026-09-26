//comunicates with the notes backend
import API_URL from "../api/api";

export async function getNotes(token) {
    const response = await fetch(`${API_URL}/notes`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await response.json();

    if(!response.ok) {
        throw new Error(
            data.error || "Unable to load your notes."
        );
    }

    return data;
}

export async function createNote(token, noteData) {
    const response = await fetch(`${API_URL}/notes`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(noteData)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Unable to create note."
        );
    }

    return data;
}


export async function updateNote(token, noteId, noteData) {
    const response = await fetch(`${API_URL}/notes/${noteId}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(noteData)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Unable to update note."
        );
    }

    return data;
}


export async function deleteNote(token, noteId) {
    const response = await fetch(`${API_URL}/notes/${noteId}`, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Unable to delete note."
        );
    }

    return data;
}