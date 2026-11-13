import { test, expect } from '@playwright/test';
import { startFixture } from './fixture';

let fixture;
let saved;
test.beforeAll(async () => { fixture = await startFixture(); });
test.afterAll(async () => { await fixture?.close(); });
test.beforeEach(async ({ context, page }) => {
    saved = { id: 7, title: 'Test note', content: '<p></p>', created_at: '2026-01-01T00:00:00Z' };
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/api/')) return url.origin === fixture.origin ? route.continue() : route.abort();
        let body = [];
        if (url.pathname === '/api/auth/refresh') body = { token: 'synthetic-token' };
        else if (url.pathname === '/api/auth/profile') body = { id: 7, first_name: 'Test', last_name: 'Reader' };
        else if (url.pathname === '/api/books') body = [
            { id: 1, name: 'Genesis', chapters: 50, chapter_count: 50, verse_counts: { 1: 31 } },
            { id: 43, name: 'John', chapters: 21, chapter_count: 21, verse_counts: { 3: 36 } },
        ];
        else if (url.pathname === '/api/translations') body = ['BSB', 'WEB', 'KJV'].map(abbreviation => ({ abbreviation, name: abbreviation }));
        else if (url.pathname.endsWith('/chapters')) body = [{ chapter: 1 }];
        else if (url.pathname.startsWith('/api/bible/')) body = [{ verse_number: 1, text: 'Scripture fixture' }];
        else if (url.pathname === '/api/notes') body = [saved];
        else if (url.pathname === '/api/notes/7' && route.request().method() === 'PATCH') {
            saved = { ...saved, ...route.request().postDataJSON() };
            body = saved;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(fixture.origin + '/bible/Genesis/1?translation=KJV');
    const desktop = page.locator('main').first();
    await desktop.getByRole('button', { name: 'Notes', exact: true }).click();
    await desktop.getByRole('button', { name: 'Library' }).click();
    await desktop.getByRole('button', { name: /Test note/ }).click();
    await expect(desktop.getByRole('textbox', { name: 'Note content' })).toBeVisible();
});

test('typing and saving after references retains spaces and validates multiple links', async ({ page }) => {
    const editor = page.locator('main').first().getByRole('textbox', { name: 'Note content' });
    await editor.click();
    await page.keyboard.type('John 3:16');
    await expect(editor.locator('a[data-scripture]')).toHaveCount(1);
    await page.keyboard.type(' and Genesis 1:1-3 and John 3:99.');
    await expect(editor).toHaveText('John 3:16 and Genesis 1:1-3 and John 3:99.');
    await expect(editor.locator('a[data-scripture]')).toHaveCount(2);
    await expect.poll(() => saved.content).toContain(' and ');
    await expect.poll(() => saved.content).toContain('John 3:99.');
});

test('formatting preserves selection and undo/redo works with a reference', async ({ page }) => {
    const panel = page.locator('main').first();
    const editor = panel.getByRole('textbox', { name: 'Note content' });
    await editor.click();
    await page.keyboard.type('See John 3:16');
    await expect(editor.locator('a[data-scripture]')).toHaveCount(1);
    await editor.evaluate(element => {
        const text = element.querySelector('p').firstChild;
        const range = document.createRange();
        range.setStart(text, 0); range.setEnd(text, 3);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
    });
    await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toBe('See');
    await panel.getByRole('button', { name: 'Bold' }).click();
    await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toBe('See');
    await expect(editor.locator('strong')).toHaveText('See');
    await panel.getByRole('button', { name: 'Italic' }).click();
    await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toBe('See');
    await expect(editor.locator('strong em, em strong')).toHaveText('See');
    await panel.getByRole('button', { name: 'Undo' }).click();
    await expect(editor.locator('em')).toHaveCount(0);
    await expect(editor.locator('strong')).toHaveText('See');
    await panel.getByRole('button', { name: 'Redo' }).click();
    await expect(editor.locator('strong em, em strong')).toHaveText('See');
    await panel.getByRole('button', { name: 'Undo' }).click();
    await panel.getByRole('button', { name: 'Undo' }).click();
    await expect(editor.locator('strong, em')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Redo' }).click();
    await expect(editor.locator('strong')).toHaveText('See');
    await panel.getByRole('button', { name: 'Redo' }).click();
    await expect(editor.locator('strong em, em strong')).toHaveText('See');
});
