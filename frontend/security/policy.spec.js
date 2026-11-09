import { test, expect } from '@playwright/test';
import { startFixture } from './fixture';
let fixture;
test.beforeAll(async () => { fixture = await startFixture(); });
test.afterAll(async () => { await fixture?.close(); });
test.beforeEach(async ({ context }) => {
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === fixture.origin) return route.continue();
        if (url.hostname !== 'api.example.invalid') return route.abort();
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
        expect(response.headers()['x-frame-options']).toBe('DENY');
        expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
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
test('the browser refuses even same-origin framing of the application', async ({ page }) => {
    const denial = page.waitForEvent('console', { predicate: message => /frame-ancestors|X-Frame-Options/i.test(message.text()) });
    await page.goto(fixture.origin + '/__fixture_frame');
    await denial;
    expect(page.frames().filter(frame => frame !== page.mainFrame()).length).toBeGreaterThan(0);
    expect(await page.frameLocator('iframe').locator('#root').count()).toBe(0);
});
test('real frontend-to-API HTTP forwarding rejects spoofed IP and Host inputs', async ({ request }) => {
    const response = await request.get(fixture.origin + '/api/auth/profile', { headers: {
        Host: 'attacker.invalid', Forwarded: 'for=198.51.100.66', 'X-Forwarded-For': '198.51.100.66, 203.0.113.10',
        'X-Forwarded-Host': 'attacker.invalid', 'X-Real-IP': '198.51.100.66', 'X-Vercel-Forwarded-For': '198.51.100.66',
        'CF-Connecting-IP': '198.51.100.66', 'True-Client-IP': '198.51.100.66' } });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.ip).toBe('127.0.0.1'); expect(data.host).toBe(new URL(fixture.target).host);
    expect(Object.values(data.forwarded).every(value => value === null)).toBe(true);
    expect(response.headers()['x-powered-by']).toBeUndefined();
    expect(response.headers()['content-security-policy']).toContain("default-src 'none'");
});
test('an oversized proxy body is rejected before any upstream request', async ({ request }) => {
    const before = await (await request.get(fixture.origin + '/__fixture_calls')).json();
    const response = await request.post(fixture.origin + '/api/auth/login', { data: 'x'.repeat(102401) });
    expect(response.status()).toBe(413); expect(response.headers()['cache-control']).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'Request body too large.' });
    const after = await (await request.get(fixture.origin + '/__fixture_calls')).json();
    expect(after.calls).toBe(before.calls);
});
