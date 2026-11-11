import { test, expect } from '@playwright/test';
import { startFixture } from './fixture';
let fixture;
test.beforeAll(async () => { fixture = await startFixture(); });
test.afterAll(async () => { await fixture?.close(); });
test.beforeEach(async ({ context }) => {
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === fixture.origin) return route.continue();
        // The backend target is a loopback fixture server (a different
        // origin from the frontend), not an external host: the
        // cross-origin framing test navigates there, so let it through.
        if (url.origin === fixture.target) return route.continue();
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
        // Main's deliberate policy (PR #79): SAMEORIGIN + frame-ancestors
        // 'self' — consistent with each other, and stricter DENY/'none'
        // was never adopted. Same-origin framing is allowed; only
        // cross-origin framing is refused (see the framing test).
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
test('the browser refuses cross-origin framing of the application', async ({ page }) => {
    // Main's policy is frame-ancestors 'self' / SAMEORIGIN, so a
    // same-origin parent MAY frame the app — the refusal only applies
    // cross-origin. The parent page is served from the backend target,
    // a different origin (different port) from the frontend, so it is
    // a genuine cross-origin framer.
    const denial = page.waitForEvent('console', { predicate: message => /frame-ancestors|X-Frame-Options/i.test(message.text()) });
    await page.goto(fixture.target + '/__xorigin_frame');
    await denial;
    expect(page.frames().filter(frame => frame !== page.mainFrame()).length).toBeGreaterThan(0);
    expect(await page.frameLocator('iframe').locator('#root').count()).toBe(0);
});
// Proxy trust and body cap, verified as they exist in main (not #72's
// approach). The frontend proxy forwards X-Forwarded-For unchanged by
// design (PR #39, so rate limiting sees the real client IP) — it does
// NOT strip headers. The spoof protection is #117's TRUST_PROXY=1: the
// backend trusts exactly one hop and takes the last XFF entry (the real
// client IP, appended by the trusted Vercel edge — simulated in the
// fixture) as the client IP, ignoring spoofed earlier entries. The body
// cap is #85's backend express.json({ limit: '100kb' }): the proxy
// forwards the body and the backend rejects it before the auth route
// handler runs. Neither test requires #72's header-stripping or proxy
// body cap, and neither weakens any protection.
test('real frontend-to-API HTTP forwarding rejects spoofed IP and Host inputs', async ({ request }) => {
    const response = await request.get(fixture.origin + '/api/auth/profile', { headers: {
        Host: 'attacker.invalid', Forwarded: 'for=198.51.100.66', 'X-Forwarded-For': '198.51.100.66, 203.0.113.10',
        'X-Forwarded-Host': 'attacker.invalid', 'X-Real-IP': '198.51.100.66', 'X-Vercel-Forwarded-For': '198.51.100.66',
        'CF-Connecting-IP': '198.51.100.66', 'True-Client-IP': '198.51.100.66' } });
    expect(response.status()).toBe(200);
    const data = await response.json();
    // The backend uses the trusted last hop — the real client IP appended
    // by the simulated edge — not any spoofed value.
    expect(data.ip).toBe('127.0.0.1');
    expect(data.ip).not.toBe('198.51.100.66'); expect(data.ip).not.toBe('203.0.113.10');
    expect(data.host).toBe(new URL(fixture.target).host);
    expect(data.host).not.toBe('attacker.invalid');
    // The spoofed headers ARE forwarded (PR #39 — the proxy does not
    // strip, so rate limiting can see them), but they are not trusted:
    // the forwarded XFF still carries the spoofed values alongside the
    // appended real IP, yet data.ip is the real IP only.
    expect(data.forwarded['x-forwarded-for']).toContain('198.51.100.66');
    expect(data.forwarded['x-forwarded-for']).toContain('203.0.113.10');
    expect(data.forwarded['x-forwarded-for']).toContain('127.0.0.1');
    expect(data.forwarded['x-forwarded-host']).toBe('attacker.invalid');
    expect(response.headers()['x-powered-by']).toBeUndefined();
    // The API carries the same uniform CSP as the app (PR #79):
    // default-src 'self', not 'none'.
    expect(response.headers()['content-security-policy']).toContain("default-src 'self'");
});
test('an oversized body is rejected with 413 before any auth processing', async ({ request }) => {
    const before = await (await request.get(fixture.origin + '/__fixture_calls')).json();
    // Content-Type: application/json so the backend's express.json body
    // parser engages and its 100 KiB limit (#85) applies. The proxy
    // forwards the body; the backend's parser rejects it before the auth
    // route handler runs, so no auth action is processed (calls unchanged).
    const response = await request.post(fixture.origin + '/api/auth/login', {
        headers: { 'Content-Type': 'application/json' }, data: 'x'.repeat(102401),
    });
    expect(response.status()).toBe(413); expect(response.headers()['cache-control']).toBe('no-store');
    // The 413 body carries the machine-readable code too (PR #85 /
    // backend/src/utils/authErrors.js errorBody).
    expect(await response.json()).toEqual({ error: 'Request body too large.', code: 'BODY_TOO_LARGE' });
    const after = await (await request.get(fixture.origin + '/__fixture_calls')).json();
    expect(after.calls).toBe(before.calls);
});
