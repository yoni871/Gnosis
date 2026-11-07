// Use the deployed API address when configured.
// Locally, /api continues through Vite's development proxy.
const API_URL = import.meta.env.VITE_API_URL || "/api";

// Session/auth requests always use the frontend's own /api path so the
// SameSite=Strict refresh cookie is same-origin (same-origin /api proxy,
// see docs/Sessions.md). Other services keep using API_URL.
export const AUTH_API_URL = "/api";

export default API_URL;