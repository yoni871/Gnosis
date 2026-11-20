import { test, expect } from '@playwright/test';
import { startFixture } from './fixture';

let fixture;
test.beforeAll(async () => { fixture = await startFixture(); });
test.afterAll(async () => { await fixture?.close({ endPool: false }); });

test('the production favicon is unambiguous, transparent, and legible at search size', async ({ page }) => {
    await page.goto(fixture.origin + '/');
    const icons = page.locator('link[rel="icon"]');
    await expect(icons).toHaveCount(1);
    await expect(icons).toHaveAttribute('href', '/favicon.png');
    const response = await page.request.get(fixture.origin + '/favicon.png');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    const image = await page.evaluate(async () => {
        const bitmap = await createImageBitmap(await (await fetch('/favicon.png')).blob());
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
        for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
                if (pixels[(y * canvas.width + x) * 4 + 3] > 0) {
                    left = Math.min(left, x); right = Math.max(right, x);
                    top = Math.min(top, y); bottom = Math.max(bottom, y);
                }
            }
        }
        const cornerAlpha = pixels[3];
        const small = document.createElement('canvas');
        small.width = 16; small.height = 16;
        const smallContext = small.getContext('2d');
        smallContext.drawImage(bitmap, 0, 0, 16, 16);
        const smallPixels = smallContext.getImageData(0, 0, 16, 16).data;
        let goldInCenter = 0;
        for (let y = 4; y < 12; y += 1) for (let x = 4; x < 12; x += 1) {
            const i = (y * 16 + x) * 4;
            if (smallPixels[i] > 150 && smallPixels[i + 1] > 105 && smallPixels[i + 2] < 200
                && smallPixels[i] > smallPixels[i + 1] && smallPixels[i + 1] > smallPixels[i + 2]) goldInCenter += 1;
        }
        return { width: canvas.width, height: canvas.height, left, top, right, bottom, cornerAlpha, goldInCenter };
    });
    expect(image.width).toBe(192);
    expect(image.height).toBe(192);
    expect(image.cornerAlpha).toBe(0);
    expect((image.right - image.left + 1) / image.width).toBeGreaterThanOrEqual(0.85);
    expect((image.right - image.left + 1) / image.width).toBeLessThanOrEqual(0.9);
    expect((image.bottom - image.top + 1) / image.height).toBeGreaterThanOrEqual(0.85);
    expect((image.bottom - image.top + 1) / image.height).toBeLessThanOrEqual(0.9);
    expect(image.goldInCenter).toBeGreaterThan(5);
});
