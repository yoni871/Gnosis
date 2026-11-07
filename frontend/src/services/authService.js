//communicates with the backend
// Auth requests go through the frontend's own /api path (same-origin /api
// proxy) so the SameSite=Strict refresh cookie is sent; see docs/Sessions.md.
// Other services keep using the deployed API origin (API_URL).
import { AUTH_API_URL } from "../api/api";

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
    const response = await fetch(`${AUTH_API_URL}${path}`, {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-Gnosis-Session": "1"
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
    return sessionRequest(() => postJson("/auth/login", credentials, "Unable to login."));
}

export async function getProfile(token) {
    const response = await fetch(`${AUTH_API_URL}/auth/profile`, {
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

// Serialize cookie mutations, including a logout queued behind a pending login.
let sessionQueue = Promise.resolve();
function sessionRequest(work) {
    const run = () => navigator.locks
        ? navigator.locks.request('gnosis-session', work) : work();
    const result = sessionQueue.then(run, run);
    sessionQueue = result.catch(() => {});
    return result;
}
export function refreshSession() {
    return sessionRequest(() => postJson('/auth/refresh', {}, 'Please sign in again.'));
}
export function logoutSession(token, all = false) {
    return sessionRequest(async () => {
        const response = await fetch(`${AUTH_API_URL}/auth/${all ? 'logout-all' : 'logout'}`, {
            method: 'POST', credentials: 'include',
            signal: AbortSignal.timeout(15000),
            headers: { 'X-Gnosis-Session': '1', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        if (!response.ok) throw new Error('Unable to revoke session.');
    });
}
