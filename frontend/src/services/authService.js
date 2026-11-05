//communicates with the backend
import API_URL from "../api/api";

// Issue #9: controlled backend error codes are preserved on the thrown
// error (error.code) so pages can branch on them. Messages stay exactly
// as before; only the code is added, and it is never derived from
// message text.
function throwServiceError(data, fallback) {
    const error = new Error(data.error || fallback);
    if (data.code) {
        error.code = data.code;
    }
    throw error;
}

async function postJson(path, body, fallback) {
    const response = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
        throwServiceError(data, fallback);
    }

    return data;
}

export async function registerUser(userData) {
    return postJson("/auth/register", userData, "Unable to create your account.");
}

export async function loginUser(credentials) {
    return postJson("/auth/login", credentials, "Unable to login.");
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
        throwServiceError(data, "Unable to load your profile.");
    }

    return data;
}

// Issue #9: verification endpoints. verifyEmail submits the token the
// user confirmed; resendVerification requests a fresh link for an
// unverified account. Both responses are generic by design.
export async function verifyEmail(token) {
    return postJson("/auth/verify-email", { token }, "Unable to verify your email.");
}

export async function resendVerification(email) {
    return postJson("/auth/resend-verification", { email }, "Unable to send a verification email.");
}

// Issue #10: password-reset endpoints. forgotPassword requests a reset
// link; resetPassword submits the link token with the new password.
// Both responses are generic by design.
export async function forgotPassword(email) {
    return postJson("/auth/forgot-password", { email }, "Unable to send a password reset email.");
}

export async function resetPassword(token, password) {
    return postJson("/auth/reset-password", { token, password }, "Unable to reset your password.");
}
