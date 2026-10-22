// Use the deployed API address when configured.
// Locally, /api continues through Vite's development proxy.
const API_URL = import.meta.env.VITE_API_URL || "/api";

export default API_URL;