import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// VITE_* variables are public bundle data. Do not inherit deployment settings.
for (const key of Object.keys(process.env)) {
    if (key.startsWith('VITE_')) delete process.env[key];
}
await build({
    root: fileURLToPath(new URL('../', import.meta.url)),
    envDir: false,
    mode: 'production',
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://api.example.invalid/api') },
});
