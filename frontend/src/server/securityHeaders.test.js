import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const config = JSON.parse(read('../../vercel.json'));
const headers = Object.fromEntries(config.headers.find(rule => rule.source === '/(.*)').headers.map(h => [h.key, h.value]));
test('all routes enforce framing, script and browser capability restrictions', () => {
    const csp = headers['Content-Security-Policy'];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp.match(/script-src ([^;]+)/)[1]).not.toContain('unsafe-inline');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Permissions-Policy']).toContain('camera=()');
});
test('every inline HTML script has an exact CSP hash and preload is external', () => {
    const html = read('../../index.html');
    for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
        if (!match[1].trim()) continue;
        const hash = createHash('sha256').update(match[1]).digest('base64');
        expect(headers['Content-Security-Policy']).toContain(`'sha256-${hash}'`);
    }
    expect(html).toContain('src="/hero-preload.js"');
    expect(read('../../public/hero-preload.js')).toContain('window.location.pathname === "/"');
});
