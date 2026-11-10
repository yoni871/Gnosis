import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// VITE_* variables are public bundle data. Do not inherit deployment settings.
for (const key of Object.keys(process.env)) {
    if (key.startsWith('VITE_')) delete process.env[key];
}
// The synthetic API origin must be a *.vercel.app host: the enforced CSP
// (frontend/vercel.json, backend/src/middleware/securityHeaders.js) allows
// connect-src 'self' https://*.vercel.app only, because the real data API
// is a separate Vercel deployment. The previous api.example.invalid origin
// was CSP-blocked, so the mocked verse/books/translations fetches never
// reached the Playwright route and the reader showed its error state
// (policy.spec.js:19, regressed in the #79 fold-in). Playwright intercepts
// the requests before any network/DNS lookup, so this host is never
// contacted; it exists only to satisfy the enforced policy. Unit tests
// (vitest.config.js) keep api.example.invalid — they mock fetch and run
// under no CSP.
await build({
    root: fileURLToPath(new URL('../', import.meta.url)),
    envDir: false,
    mode: 'production',
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://api.example.vercel.app/api') },
});
