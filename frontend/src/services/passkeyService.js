// Passkey (WebAuthn) requests. Auth requests go through the
// frontend's own /api path (same-origin /api proxy) so the
// SameSite=Strict refresh cookie is sent; see docs/Sessions.md.
//
// The browser ceremony itself runs in the page (via
// @simplewebauthn/browser): the server only ever sees the ceremony
// response JSON, never any private key material — a passkey's private
// key never leaves the user's device.
import { AUTH_API_URL } from "../api/api";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

function throwServiceError(data, fallback) {
    const error = new Error(data.error || fallback);
    if (data.code) {
        error.code = data.code;
    }
    throw error;
}

async function requestJson(path, { method = "GET", token, body } = {}) {
    const response = await fetch(`${AUTH_API_URL}${path}`, {
        method,
        signal: AbortSignal.timeout(15000),
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-Gnosis-Session": "1",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
        throwServiceError(data || {}, "Something went wrong.");
    }
    return data;
}

export async function listPasskeys(token) {
    const data = await requestJson("/auth/passkeys", { token });
    return data.passkeys;
}

// Registration is a two-step ceremony: the server issues options
// (after confirming the current password), the browser runs the
// authenticator ceremony, and the server verifies and stores the new
// credential. The label is the name shown for the passkey afterwards.
export async function registerPasskey(token, password, label) {
    const options = await requestJson("/auth/passkeys/register/options", {
        method: "POST", token, body: { password },
    });
    const response = await startRegistration({ optionsJSON: options });
    return requestJson("/auth/passkeys/register/verify", {
        method: "POST", token, body: { response, label },
    });
}

export async function renamePasskey(token, id, label) {
    return requestJson(`/auth/passkeys/${id}`, {
        method: "PATCH", token, body: { label },
    });
}

export async function removePasskey(token, id, password) {
    await requestJson(`/auth/passkeys/${id}`, {
        method: "DELETE", token, body: { password },
    });
}

// Sign-in is a two-step ceremony: the server issues options for the
// account's passkeys, the browser runs the authenticator ceremony,
// and the server verifies the assertion and issues a session — the
// same session a password login issues. A passkey is a
// phishing-resistant factor, so no second step follows it.
export async function loginWithPasskey(email) {
    const options = await requestJson("/auth/passkeys/login/options", {
        method: "POST", body: { email },
    });
    const response = await startAuthentication({ optionsJSON: options });
    return requestJson("/auth/passkeys/login/verify", {
        method: "POST", body: { response },
    });
}
