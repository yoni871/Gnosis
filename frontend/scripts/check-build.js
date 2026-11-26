import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

// VITE_* variables are public bundle data. Do not inherit deployment settings.
for (const key of Object.keys(process.env)) {
    if (key.startsWith('VITE_')) delete process.env[key];
}
// A production build must never include unpublished History content,
// whatever the caller's environment holds.
delete process.env.HISTORY_INCLUDE_UNPUBLISHED;

// The production build bundles only generated (published-only) History
// content, so generate it first — this entry point bypasses the npm
// prebuild hook.
execFileSync(process.execPath, ['scripts/build-history-content.js'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: 'inherit',
});
// Likewise the published-only Doctrine study: the page imports only
// the generated file, so it must exist before the build runs.
execFileSync(process.execPath, ['scripts/build-doctrine-content.js'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: 'inherit',
});
await build({
    root: fileURLToPath(new URL('../', import.meta.url)),
    envDir: false,
    mode: 'production',
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://api.example.invalid/api') },
});
// After the build, prove the publication gate held: no non-published
// History id may appear in dist/ or the generated manifest.
execFileSync(process.execPath, ['scripts/check-history-gate.js'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: 'inherit',
});
// And no non-published Doctrine title, date, quotation, explanation,
// or id may appear in the generated study or dist/.
execFileSync(process.execPath, ['scripts/check-doctrine-gate.js'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: 'inherit',
});
