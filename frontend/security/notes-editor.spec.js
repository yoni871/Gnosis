import { test, expect } from '@playwright/test';
import { startFixture } from './fixture';

let fixture;
let saved;
let second;
let logoutCalls;
test.beforeAll(async () => { fixture = await startFixture(); });
// The policy suite in this worker owns the shared backend pool's final cleanup.
test.afterAll(async () => { await fixture?.close({ endPool: false }); });
test.beforeEach(async ({ context, page }) => {
    saved = { id: 7, title: 'Test note', content: '<p></p>', created_at: '2026-01-01T00:00:00Z' };
    second = { id: 8, title: 'Second note', content: '<p>Second body</p>', created_at: '2026-01-01T00:00:00Z' };
    logoutCalls = 0;
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/api/')) return url.origin === fixture.origin ? route.continue() : route.abort();
        let body = [];
        if (url.pathname === '/api/auth/refresh') body = { token: 'synthetic-token' };
        else if (url.pathname === '/api/auth/logout') { logoutCalls += 1; body = {}; }
        else if (url.pathname === '/api/auth/profile') body = { id: 7, first_name: 'Test', last_name: 'Reader' };
        else if (url.pathname === '/api/books') body = [
            { id: 1, name: 'Genesis', chapters: 50, chapter_count: 50, verse_counts: { 1: 31 } },
            { id: 43, name: 'John', chapters: 21, chapter_count: 21, verse_counts: { 3: 36 } },
        ];
        else if (url.pathname === '/api/translations') body = ['BSB', 'WEB', 'KJV'].map(abbreviation => ({ abbreviation, name: abbreviation }));
        else if (url.pathname.endsWith('/chapters')) body = [{ chapter: 1 }];
        else if (url.pathname.startsWith('/api/bible/')) body = [{ verse_number: 1, text: 'Scripture fixture' }];
        else if (url.pathname === '/api/notes') body = [saved, second];
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

for (const [device, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    test(`${device}: switching keeps title and body together and cancel discards only that draft`, async ({ page }) => {
        await page.setViewportSize(viewport);
        if (device === 'mobile') {
            await page.locator('nav.fixed.bottom-0').getByRole('button', { name: 'Notes' }).click();
        }
        const panel = device === 'desktop' ? page.locator('main').first() : page.locator('main').last();
        const title = panel.getByRole('textbox', { name: 'Note title' });
        const editor = panel.getByRole('textbox', { name: 'Note content' });
        await expect(title).toHaveValue('Test note');
        await title.fill('First draft');
        await editor.click();
        await page.keyboard.type('First body');
        await panel.getByRole('button', { name: 'Library' }).click();
        await panel.getByRole('button', { name: /Second note/ }).click();
        await expect(title).toHaveValue('Second note');
        await expect(editor).toHaveText('Second body');
        await title.fill('Second draft');
        await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(title).toHaveValue('Second note');
        await panel.getByRole('button', { name: 'Library' }).click();
        await panel.getByRole('button', { name: /Test note/ }).click();
        await expect(title).toHaveValue('First draft');
        await expect(editor).toHaveText('First body');
        await panel.getByRole('button', { name: 'Save', exact: true }).click();
        await expect.poll(() => saved.title).toBe('First draft');
        await expect.poll(() => saved.content).toContain('First body');
        await expect(panel.getByText(/^Saved/)).toBeVisible();
    });

    test(`${device}: cancel sign-out keeps the current page, session, and note draft`, async ({ page }) => {
        await page.setViewportSize(viewport);
        if (device === 'mobile') await page.locator('nav.fixed.bottom-0').getByRole('button', { name: 'Notes' }).click();
        const panel = device === 'desktop' ? page.locator('main').first() : page.locator('main').last();
        const title = panel.getByRole('textbox', { name: 'Note title' });
        const editor = panel.getByRole('textbox', { name: 'Note content' });
        await title.fill('Unsaved title');
        await editor.click();
        await page.keyboard.type('Unsaved body');
        if (device === 'mobile') await page.getByRole('button', { name: 'Open navigation menu' }).click();
        await page.locator('header').getByRole('button', { name: /Test Reader/ }).filter({ visible: true }).click();
        page.once('dialog', dialog => dialog.dismiss());
        await page.locator('header').getByRole('link', { name: 'Sign out' }).filter({ visible: true }).click();
        await expect(page).toHaveURL(/\/bible\/Genesis\/1/);
        await expect(title).toHaveValue('Unsaved title');
        await expect(editor).toHaveText('Unsaved body');
        expect(logoutCalls).toBe(0);
        page.once('dialog', dialog => dialog.accept());
        await page.locator('header').getByRole('link', { name: 'Sign out' }).filter({ visible: true }).click();
        await expect(page).toHaveURL(/\/login/);
        await expect.poll(() => logoutCalls).toBe(1);
    });

    test(`${device}: saved paragraphs, headings, and lists use compact readable spacing`, async ({ page }) => {
        saved = { ...saved, content: '<h2>Heading</h2><p>First paragraph.</p><p>John 3:16 and another paragraph.</p><ul><li>First item</li><li>Second item</li></ul><ol><li>One</li><li>Two</li></ol>' };
        await page.setViewportSize(viewport);
        await page.reload();
        if (device === 'mobile') await page.locator('nav.fixed.bottom-0').getByRole('button', { name: 'Notes' }).click();
        const panel = device === 'desktop' ? page.locator('main').first() : page.locator('main').last();
        if (device === 'desktop') await panel.getByRole('button', { name: 'Notes', exact: true }).click();
        await panel.getByRole('button', { name: 'Library' }).click();
        await panel.getByRole('button', { name: /Test note/ }).click();
        const editor = panel.getByRole('textbox', { name: 'Note content' });
        await expect(editor.locator('h2')).toHaveText('Heading');
        await expect(editor.locator('a[data-scripture]')).toHaveCount(1);
        const spacing = await editor.evaluate(element => {
            const style = selector => getComputedStyle(element.querySelector(selector));
            return {
                lineHeight: parseFloat(getComputedStyle(element).lineHeight) / parseFloat(getComputedStyle(element).fontSize),
                paragraphMargin: parseFloat(style('p').marginBottom),
                listParagraphMargin: parseFloat(style('li p').marginBottom),
                listItemMargin: parseFloat(style('li').marginBottom),
                headingLineHeight: parseFloat(style('h2').lineHeight) / parseFloat(style('h2').fontSize),
            };
        });
        expect(spacing.lineHeight).toBeCloseTo(1.65, 1);
        expect(spacing.paragraphMargin).toBeGreaterThan(0);
        expect(spacing.paragraphMargin).toBeLessThan(10);
        expect(spacing.listParagraphMargin).toBe(0);
        expect(spacing.listItemMargin).toBeLessThan(3);
        expect(spacing.headingLineHeight).toBeCloseTo(1.3, 1);
        if (device === 'mobile') {
            await editor.locator('a[data-scripture]').click();
            await expect(page.getByRole('button', { name: 'Close Scripture' })).toBeVisible();
            await page.getByRole('button', { name: 'Close Scripture' }).click();
            await expect(editor).toContainText('John 3:16 and another paragraph.');
        }
    });
    test(`${device}: spacing controls apply per paragraph with undo/redo and cancel discards`, async ({ page }) => {
        await page.setViewportSize(viewport);
        if (device === 'mobile') await page.locator('nav.fixed.bottom-0').getByRole('button', { name: 'Notes' }).click();
        const panel = device === 'desktop' ? page.locator('main').first() : page.locator('main').last();
        const editor = panel.getByRole('textbox', { name: 'Note content' });
        const lineSpacing = panel.getByLabel('Line spacing');
        const paragraphSpacing = panel.getByLabel('Paragraph spacing');
        await expect(lineSpacing).toHaveValue('1.5');
        await expect(paragraphSpacing).toHaveValue('medium');
        await editor.click();
        await page.keyboard.type('First paragraph');
        await page.keyboard.press('Enter');
        await page.keyboard.type('Second paragraph');
        await page.keyboard.press('Enter');
        await page.keyboard.type('Third paragraph');
        await editor.evaluate(element => {
            const text = element.querySelector('p').firstChild;
            const range = document.createRange();
            range.setStart(text, 0); range.setEnd(text, 15);
            const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
            document.dispatchEvent(new Event('selectionchange'));
        });
        await lineSpacing.selectOption('2');
        await expect(lineSpacing).toHaveValue('2');
        await expect(editor.locator('p').first()).toHaveAttribute('data-line-height', '2');
        await expect(editor.locator('p').nth(1)).not.toHaveAttribute('data-line-height');
        await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toBe('First paragraph');
        // ProseMirror groups changes made within ~500ms into one undo step,
        // so wait past that boundary to keep the two spacing changes as
        // separate undo steps.
        await page.waitForTimeout(700);
        await paragraphSpacing.selectOption('large');
        await expect(paragraphSpacing).toHaveValue('large');
        await expect(editor.locator('p').first()).toHaveAttribute('data-paragraph-spacing', 'large');
        const metrics = await editor.evaluate(element => {
            const paragraphs = element.querySelectorAll('p');
            const ratio = (el, property) => parseFloat(getComputedStyle(el)[property]) / parseFloat(getComputedStyle(el).fontSize);
            return {
                firstLineHeight: ratio(paragraphs[0], 'lineHeight'),
                // The middle paragraph keeps the default spacing; the last
                // paragraph's bottom margin is zeroed by the editor's
                // :last-child rule, so it cannot show the .4em default.
                secondLineHeight: ratio(paragraphs[1], 'lineHeight'),
                firstMarginBottom: ratio(paragraphs[0], 'marginBottom'),
                secondMarginBottom: ratio(paragraphs[1], 'marginBottom'),
            };
        });
        expect(metrics.firstLineHeight).toBeCloseTo(2, 1);
        expect(metrics.secondLineHeight).toBeCloseTo(1.65, 1);
        expect(metrics.firstMarginBottom).toBeCloseTo(1, 1);
        expect(metrics.secondMarginBottom).toBeCloseTo(0.4, 1);
        await panel.getByRole('button', { name: 'Undo' }).click();
        await expect(editor.locator('p').first()).not.toHaveAttribute('data-paragraph-spacing');
        await expect(editor.locator('p').first()).toHaveAttribute('data-line-height', '2');
        await panel.getByRole('button', { name: 'Undo' }).click();
        await expect(editor.locator('p').first()).not.toHaveAttribute('data-line-height');
        await panel.getByRole('button', { name: 'Redo' }).click();
        await panel.getByRole('button', { name: 'Redo' }).click();
        await expect(editor.locator('p').first()).toHaveAttribute('data-line-height', '2');
        await expect(editor.locator('p').first()).toHaveAttribute('data-paragraph-spacing', 'large');
        await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(editor.locator('p[data-line-height], p[data-paragraph-spacing]')).toHaveCount(0);
        await expect(editor).toHaveText('');
    });

    test(`${device}: saved spacing persists across reload and does not leak to other notes`, async ({ page }) => {
        saved = { ...saved, content: '<h2 data-line-height="2">Heading</h2><p data-line-height="2" data-paragraph-spacing="large">First paragraph.</p><p>John 3:16 and another paragraph.</p><ul><li><p data-line-height="2">Spaced item</p></li><li><p>Plain item</p></li></ul>' };
        await page.setViewportSize(viewport);
        await page.reload();
        if (device === 'mobile') await page.locator('nav.fixed.bottom-0').getByRole('button', { name: 'Notes' }).click();
        const panel = device === 'desktop' ? page.locator('main').first() : page.locator('main').last();
        if (device === 'desktop') await panel.getByRole('button', { name: 'Notes', exact: true }).click();
        await panel.getByRole('button', { name: 'Library' }).click();
        await panel.getByRole('button', { name: /Test note/ }).click();
        const editor = panel.getByRole('textbox', { name: 'Note content' });
        await expect(editor.locator('h2')).toHaveAttribute('data-line-height', '2');
        await expect(editor.locator('p').first()).toHaveAttribute('data-line-height', '2');
        await expect(editor.locator('p').first()).toHaveAttribute('data-paragraph-spacing', 'large');
        await expect(editor.locator('p').nth(1)).not.toHaveAttribute('data-line-height');
        await expect(editor.locator('a[data-scripture]')).toHaveCount(1);
        await expect(editor.locator('li p').first()).toHaveAttribute('data-line-height', '2');
        await expect(editor.locator('li p').nth(1)).not.toHaveAttribute('data-line-height');
        const restored = await editor.evaluate(element => {
            const ratio = (el, property) => parseFloat(getComputedStyle(el)[property]) / parseFloat(getComputedStyle(el).fontSize);
            return {
                headingLineHeight: ratio(element.querySelector('h2'), 'lineHeight'),
                firstMarginBottom: ratio(element.querySelector('p'), 'marginBottom'),
            };
        });
        expect(restored.headingLineHeight).toBeCloseTo(2, 1);
        expect(restored.firstMarginBottom).toBeCloseTo(1, 1);
        await editor.click();
        await editor.evaluate(element => {
            // The plain paragraph starts with a Scripture link element, so
            // collapse the selection at the start of that link.
            const firstChild = element.querySelectorAll('p')[1].firstChild;
            const range = document.createRange();
            range.setStart(firstChild, 0); range.setEnd(firstChild, 0);
            const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
            document.dispatchEvent(new Event('selectionchange'));
        });
        await expect(panel.getByLabel('Line spacing')).toHaveValue('1.5');
        await expect(panel.getByLabel('Paragraph spacing')).toHaveValue('medium');
        await panel.getByRole('button', { name: 'Library' }).click();
        await panel.getByRole('button', { name: /Second note/ }).click();
        await expect(editor.locator('[data-line-height], [data-paragraph-spacing]')).toHaveCount(0);
        await panel.getByRole('button', { name: 'Library' }).click();
        await panel.getByRole('button', { name: /Test note/ }).click();
        await expect(editor.locator('p').first()).toHaveAttribute('data-line-height', '2');
        await editor.click();
        await editor.evaluate(element => {
            const text = element.querySelector('p').firstChild;
            const range = document.createRange();
            range.setStart(text, 0); range.setEnd(text, 5);
            const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
            document.dispatchEvent(new Event('selectionchange'));
        });
        await panel.getByLabel('Line spacing').selectOption('1');
        await panel.getByRole('button', { name: 'Save', exact: true }).click();
        await expect.poll(() => saved.content).toContain('data-line-height="1"');
        await expect.poll(() => saved.content).toContain('data-paragraph-spacing="large"');
        await page.reload();
        if (device === 'mobile') await page.locator('nav.fixed.bottom-0').getByRole('button', { name: 'Notes' }).click();
        const reloaded = device === 'desktop' ? page.locator('main').first() : page.locator('main').last();
        if (device === 'desktop') await reloaded.getByRole('button', { name: 'Notes', exact: true }).click();
        await reloaded.getByRole('button', { name: 'Library' }).click();
        await reloaded.getByRole('button', { name: /Test note/ }).click();
        const reloadedEditor = reloaded.getByRole('textbox', { name: 'Note content' });
        await expect(reloadedEditor.locator('p').first()).toHaveAttribute('data-line-height', '1');
        await expect(reloadedEditor.locator('p').first()).toHaveAttribute('data-paragraph-spacing', 'large');
    });
}

test('typing and saving after references retains spaces and validates multiple links', async ({ page }) => {
    const editor = page.locator('main').first().getByRole('textbox', { name: 'Note content' });
    await editor.click();
    await page.keyboard.type('John 3:16');
    await expect(editor.locator('a[data-scripture]')).toHaveCount(1);
    await page.keyboard.type(' and Genesis 1:1-3 and John 3:99.');
    await expect(editor).toHaveText('John 3:16 and Genesis 1:1-3 and John 3:99.');
    await expect(editor.locator('a[data-scripture]')).toHaveCount(2);
    await page.locator('main').first().getByRole('button', { name: 'Save', exact: true }).click();
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
    await expect(panel.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toBe('See');
    await expect(editor.locator('strong')).toHaveText('See');
    await panel.getByRole('button', { name: 'Italic' }).click();
    await expect(panel.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toBe('See');
    await expect(editor.locator('strong em, em strong')).toHaveText('See');
    await panel.getByRole('button', { name: 'Undo' }).click();
    await expect(panel.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'false');
    await expect(editor.locator('em')).toHaveCount(0);
    await expect(editor.locator('strong')).toHaveText('See');
    await panel.getByRole('button', { name: 'Redo' }).click();
    await expect(editor.locator('strong em, em strong')).toHaveText('See');
    await editor.evaluate(element => {
        const text = element.querySelector('a[data-scripture]').firstChild;
        const range = document.createRange(); range.setStart(text, 1); range.collapse(true);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(panel.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false');
    await editor.evaluate(element => {
        const text = element.querySelector('strong em, em strong').firstChild;
        const range = document.createRange(); range.setStart(text, 1); range.collapse(true);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(panel.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    await panel.getByRole('button', { name: 'Undo' }).click();
    await panel.getByRole('button', { name: 'Undo' }).click();
    await expect(editor.locator('strong, em')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Redo' }).click();
    await expect(editor.locator('strong')).toHaveText('See');
    await panel.getByRole('button', { name: 'Redo' }).click();
    await expect(editor.locator('strong em, em strong')).toHaveText('See');
});
