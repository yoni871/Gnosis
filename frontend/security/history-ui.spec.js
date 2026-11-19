import { test, expect } from '@playwright/test';
import { startFixture } from './fixture';

let fixture;
test.beforeAll(async () => { fixture = await startFixture(); });
test.afterAll(async () => { await fixture?.close({ endPool: false }); });

for (const width of [320, 390]) {
    test(`History reader stays anchored with sticky headers at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(`${fixture.origin}/biblical-history/genesis/creation`);
        const dock = page.locator('.history-timeline-dock');
        await expect(dock).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 350));
        const layout = await page.evaluate(() => {
            const main = document.querySelector('.history-event-root > .public-page');
            const sub = document.querySelector('.history-study-header');
            const timeline = document.querySelector('.history-timeline-dock');
            return {
                mainPosition: getComputedStyle(main).position,
                subPosition: getComputedStyle(sub).position,
                mainTop: main.getBoundingClientRect().top,
                subTop: sub.getBoundingClientRect().top,
                dockBottom: timeline.getBoundingClientRect().bottom,
                viewport: innerHeight,
            };
        });
        expect(layout.mainPosition).toBe('sticky');
        expect(layout.subPosition).toBe('sticky');
        expect(layout.mainTop).toBeGreaterThanOrEqual(-1);
        expect(layout.subTop).toBeGreaterThanOrEqual(62);
        expect(Math.abs(layout.dockBottom - layout.viewport)).toBeLessThanOrEqual(1);
        expect(await page.locator('.history-timeline-node').first().evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');

        await page.locator('.history-timeline-node').nth(1).click();
        await expect(page).toHaveURL(/\/biblical-history\/genesis\/adam-and-eve$/);
        const bottomAfterNavigation = await dock.evaluate(node => node.getBoundingClientRect().bottom);
        expect(Math.abs(bottomAfterNavigation - 800)).toBeLessThanOrEqual(1);

        await page.locator('.history-scripture-button').click();
        const sheet = page.locator('.history-study-body > .history-scripture-companion');
        await expect(sheet).toBeVisible();
        expect(Math.abs((await sheet.boundingBox()).height - 400)).toBeLessThanOrEqual(1);
        await expect(dock).toBeHidden();
        expect(await sheet.locator('.history-scripture-companion-body').evaluate(node => getComputedStyle(node).overflowY)).toBe('auto');
    });
}

test('desktop History keeps article and Scripture in independent reading columns', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${fixture.origin}/biblical-history/genesis/creation`);
    const article = page.locator('.history-study-content');
    const scripture = page.locator('.history-study-body > .history-scripture-companion');
    await expect(scripture).toBeVisible();
    const articleWidth = (await article.boundingBox()).width;
    const scriptureWidth = (await scripture.boundingBox()).width;
    expect(articleWidth / (articleWidth + scriptureWidth)).toBeGreaterThan(0.55);
    expect(articleWidth / (articleWidth + scriptureWidth)).toBeLessThan(0.60);
    expect(await article.evaluate(node => getComputedStyle(node).overflowY)).toBe('auto');
    expect(await scripture.locator('.history-scripture-companion-body').evaluate(node => getComputedStyle(node).overflowY)).toBe('auto');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
    const timeline = page.locator('.history-timeline-node');
    await expect(timeline).toHaveCount(14);
    await expect(page.getByText('Upcoming', { exact: true })).toHaveCount(0);
    expect(await timeline.first().evaluate(node => getComputedStyle(node).transitionDuration)).not.toBe('0s');
    await page.evaluate(() => localStorage.setItem('gnosis-theme', 'dark'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(scripture).toBeVisible();
});

test('category-only books open ordered, published landing pages', async ({ page }) => {
    for (const book of ['exodus', 'leviticus']) {
        await page.goto(`${fixture.origin}/biblical-history/${book}`);
        await expect(page.getByRole('heading', { level: 1, name: book === 'exodus' ? 'Exodus' : 'Leviticus' })).toBeVisible();
        const entries = page.locator('.history-book-entry-list a');
        await expect(entries).toHaveCount(7);
        await expect(page.getByText('Coming Soon')).toHaveCount(0);
        expect((await entries.first().getAttribute('href'))?.startsWith(`/biblical-history/${book}/`)).toBe(true);
    }
});
