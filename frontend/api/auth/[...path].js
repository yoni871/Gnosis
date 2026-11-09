// Same-origin proxy for the session/auth endpoints (PR #39).
//
// The browser calls the frontend's own /api/auth/* (same origin) and this
// function forwards the request to the Express API. The refresh cookie is
// SameSite=Strict, HttpOnly and Secure, so the browser only sends it on a
// same-site request; proxying makes the cookie same-origin without weakening
// any of those protections. No endpoint, cookie attribute, or auth behaviour
// changes — only the route the browser uses to reach the API.
//
// The destination is a fixed, configured backend origin (never derived from
// the request), so this is not an open proxy: a caller cannot make the
// function fetch an arbitrary host. Only /api/auth/* reaches this function
// (Vercel filesystem routing), and the sub-path is validated below.
//
// Forwarding headers are never accepted from callers. Until the deployed
// proxy topology is verified, upstream rate limits use the proxy socket IP.

const HOP_BY_HOP = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
]);

function backendBaseUrl() {
    // Preferred: an explicit server-side backend origin.
    const explicit = process.env.GNOSIS_API_BASE_URL;
    if (explicit) {
        return explicit.replace(/\/+$/, "");
    }
    // Fallback: the same VITE_API_URL the browser build uses. It carries a
    // trailing /api (frontend services append paths like /auth/login), so
    // strip that segment to recover the backend origin.
    const vite = process.env.VITE_API_URL;
    if (vite) {
        return vite.replace(/\/api\/?$/, "").replace(/\/+$/, "");
    }
    return null;
}

function authSubPath(requestUrl) {
    let url;
    try {
        url = new URL(requestUrl, "http://localhost");
    } catch {
        return null;
    }
    const prefix = "/api/auth/";
    if (!url.pathname.startsWith(prefix)) {
        return null;
    }
    const sub = url.pathname.slice(prefix.length);
    if (!sub) {
        return null;
    }
    // Reject path traversal so the proxied path can never escape /api/auth/.
    if (sub.split("/").includes("..")) {
        return null;
    }
    return sub + url.search;
}

function sendJson(res, status, body) {
    const payload = Buffer.from(JSON.stringify(body));
    res.writeHead(status, {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Type": "application/json",
        "Content-Length": payload.length,
    });
    res.end(payload);
}

export default async function handler(req, res) {
    const base = backendBaseUrl();
    const sub = authSubPath(req.url || "");
    if (!base || !sub) {
        sendJson(res, 502, { error: "Authentication service unavailable." });
        return;
    }

    const target = `${base}/api/auth/${sub}`;

    const chunks = [];
    let bytes = 0;
    try {
        for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > 100 * 1024) {
                sendJson(res, 413, { error: "Request body too large." });
                return;
            }
            chunks.push(chunk);
        }
    } catch {
        sendJson(res, 400, { error: "Invalid request body." });
        return;
    }
    const body = Buffer.concat(chunks);

    const headers = {};
    for (const [name, value] of Object.entries(req.headers || {})) {
        const lower = name.toLowerCase();
        if (HOP_BY_HOP.has(lower) || lower === "forwarded" ||
            lower.startsWith("x-forwarded-") || lower.startsWith("x-vercel-") ||
            lower === "x-real-ip" || lower === "true-client-ip" || lower === "cf-connecting-ip") {
            continue;
        }
        // fetch sets Host and Content-Length for the upstream request.
        if (lower === "host" || lower === "content-length") {
            continue;
        }
        headers[name] = value;
    }

    let upstream;
    try {
        upstream = await fetch(target, {
            method: req.method,
            headers,
            body: body.length ? body : undefined,
            signal: AbortSignal.timeout(15000),
            // Never follow a redirect automatically: a redirect target could
            // be another origin, and the refresh cookie must not be carried
            // there. The backend does not redirect auth endpoints.
            redirect: "manual",
        });
    } catch {
        sendJson(res, 502, { error: "Authentication service unavailable." });
        return;
    }

    const responseHeaders = {};
    for (const [name, value] of upstream.headers.entries()) {
        const lower = name.toLowerCase();
        if (HOP_BY_HOP.has(lower)) {
            continue;
        }
        // Set-Cookie is forwarded separately below: entries() can merge
        // multiple cookies into one comma-joined value, which corrupts the
        // Expires attribute. getSetCookie() keeps each cookie intact.
        if (lower === "set-cookie") {
            continue;
        }
        responseHeaders[name] = value;
    }
    const setCookies = typeof upstream.headers.getSetCookie === "function"
        ? upstream.headers.getSetCookie()
        : [];
    if (setCookies.length) {
        responseHeaders["Set-Cookie"] = setCookies;
    }

    const payload = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, responseHeaders);
    res.end(payload);
}
