import { test, expect } from '@playwright/test';
import { startFixture } from './fixture';
let fixture;
test.beforeAll(async () => { fixture = await startFixture(); });
test.afterAll(async () => { await fixture?.close(); });
test.beforeEach(async ({ context }) => {
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === fixture.origin) return route.continue();
        // Mock API host is api.example.vercel.app (see check-build.js):
        // it must stay inside the enforced CSP connect-src
        // ('self' https://*.vercel.app) or every mocked fetch is blocked
        // before it reaches this route.
        if (url.hostname !== 'api.example.vercel.app') return route.abort();
        let body = [];
        if (url.pathname === '/api/books') body = [{ id: 1, name: 'Genesis', chapters: 50 }];
        else if (url.pathname === '/api/translations') body = [{ abbreviation: 'BSB', name: 'Synthetic BSB' }, { abbreviation: 'WEB', name: 'Synthetic WEB' }, { abbreviation: 'KJV', name: 'Synthetic KJV' }];
        else if (url.pathname.startsWith('/api/bible/')) body = [{ verse_number: 1, text: 'Synthetic Scripture fixture' }];
        else if (url.pathname.endsWith('/chapters')) body = [{ chapter: 1 }];
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
});
test('public/recovery/reader routes carry enforced headers and load their self-hosted scripts', async ({ page }) => {
    for (const path of ['/', '/login', '/register', '/forgot-password', '/reset-password', '/bible/Genesis/1']) {
        const response = await page.goto(fixture.origin + path);
        expect(response.headers()['x-content-type-options']).toBe('nosniff');
        expect(response.headers()['x-frame-options']).toBe('SAMEORIGIN');
        expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
        expect(response.headers()['permissions-policy']).toContain('camera=()');
        expect(response.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
        await expect(page.locator('#root')).not.toBeEmpty();
    }
    await expect(page.getByText('Synthetic Scripture fixture').first()).toBeVisible();
});
test('Chromium blocks inline execution and object embedding under the actual source policy', async ({ page }) => {
    await page.goto(fixture.origin + '/login');
    await page.evaluate(() => {
        window.__violations = [];
        document.addEventListener('securitypolicyviolation', event => window.__violations.push(event.effectiveDirective));
        const script = document.createElement('script'); script.textContent = 'window.__injectedExecuted = true'; document.head.appendChild(script);
        const object = document.createElement('object'); object.data = '/login'; object.type = 'text/html'; document.body.appendChild(object);
    });
    await expect.poll(() => page.evaluate(() => window.__violations.some(value => value.startsWith('script-src')))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__violations.includes('object-src'))).toBe(true);
    expect(await page.evaluate(() => window.__injectedExecuted)).toBeUndefined();
});
// #79 posture is frame-ancestors 'self' + X-Frame-Options SAMEORIGIN (not
// #72's DENY/'none'): same-origin framing is permitted, cross-origin
// framing is refused. The fixture is single-origin, so the browser test
// proves the same-origin half — the iframe loads and mounts #root.
test('same-origin framing is permitted under frame-ancestors self', async ({ page }) => {
    await page.goto(fixture.origin + '/__fixture_frame');
    await expect(page.frameLocator('iframe').locator('#root')).toHaveCount(1);
});
test('real frontend-to-API HTTP forwarding passes XFF through and the hop count ignores spoofed entries', async ({ request }) => {
    const response = await request.get(fixture.origin + '/api/auth/profile', { headers: {
        Host: 'attacker.invalid', Forwarded: 'for=198.51.100.66', 'X-Forwarded-For': '198.51.100.66, 203.0.113.10',
        'X-Forwarded-Host': 'attacker.invalid', 'X-Real-IP': '198.51.100.66', 'X-Vercel-Forwarded-For': '198.51.100.66',
        'CF-Connecting-IP': '198.51.100.66', 'True-Client-IP': '198.51.100.66' } });
    expect(response.status()).toBe(200);
    const data = await response.json();
    // The proxy forwards X-Forwarded-For unchanged; the backend (trust
    // proxy 'loopback' in this fixture) ignores the spoofed leftmost
    // entry and takes the entry the single trusted proxy hop vouches for.
    // #72's strip-everything model is rejected: it left the backend
    // seeing only the proxy socket IP and silently disabled per-IP rate
    // limiting.
    expect(data.ip).toBe('203.0.113.10');
    expect(data.host).toBe(new URL(fixture.target).host);
    expect(data.forwarded['x-forwarded-for']).toBe('198.51.100.66, 203.0.113.10');
    expect(data.forwarded['forwarded']).toBe('for=198.51.100.66');
    expect(response.headers()['x-powered-by']).toBeUndefined();
    expect(response.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
});
test('an oversized proxy body is rejected before any upstream request', async ({ request }) => {
    const before = await (await request.get(fixture.origin + '/__fixture_calls')).json();
    const response = await request.post(fixture.origin + '/api/auth/login', { data: 'x'.repeat(102401) });
    expect(response.status()).toBe(413); expect(response.headers()['cache-control']).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'Request body too large.' });
    const after = await (await request.get(fixture.origin + '/__fixture_calls')).json();
    expect(after.calls).toBe(before.calls);
});
