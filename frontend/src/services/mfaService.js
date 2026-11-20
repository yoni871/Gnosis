// TOTP MFA requests go through the frontend's own /api path (same-origin
// /api proxy) so the SameSite=Strict refresh cookie is sent when the
// challenge step completes a login; see docs/Sessions.md.
// Controlled backend error codes are preserved on the thrown error
// (error.code) so pages can branch on them, mirroring authService.
import { AUTH_API_URL } from "../api/api";

function throwServiceError(data, fallback) {
    const error = new Error(data.error || fallback);
    if (data.code) {
        error.code = data.code;
    }
    throw error;
}

async function postMfa(path, body, token, fallback) {
    const response = await fetch(`${AUTH_API_URL}/auth/mfa${path}`, {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-Gnosis-Session": "1",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
        throwServiceError(data, fallback);
    }
    return data;
}

export async function getMfaStatus(token) {
    const response = await fetch(`${AUTH_API_URL}/auth/mfa/status`, {
        method: "GET",
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
        throwServiceError(data, "Unable to load two-factor settings.");
    }
    return data;
}

export async function startMfaEnrollment(token) {
    return postMfa("/enroll", {}, token, "Unable to start two-factor setup.");
}

export async function confirmMfaEnrollment(token, code) {
    return postMfa("/enroll/confirm", { code }, token, "Unable to confirm two-factor setup.");
}

export async function verifyMfaChallenge(challenge, code) {
    return postMfa("/verify", { challenge, code }, null, "Unable to verify your code.");
}

export async function regenerateRecoveryCodes(token, password, code) {
    return postMfa("/recovery-codes/regenerate", { password, code }, token, "Unable to regenerate recovery codes.");
}

export async function disableMfa(token, password, code) {
    return postMfa("/disable", { password, code }, token, "Unable to turn off two-factor authentication.");
}
