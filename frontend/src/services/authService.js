//communicates with the backend
import API_URL from "../api/api";

export async function registerUser(userData) {
    const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(userData) //convert the object into JSON text for http
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Unable to create your account."
        );
    }

    return data;
}

export async function loginUser(credentials) {
    const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(credentials)
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(
            data.error || "Unable to login."
        );
    }

    return data;
}

export async function getProfile(token) {
    const response = await fetch(`${API_URL}/auth/profile`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Unable to load your profile."
        );
    }

    return data;
}