import { afterEach, expect, test, vi } from "vitest";
const mock = vi.hoisted(() => ({ conditions: {}, timelines: [], cleanup: null, revert: vi.fn(), refresh: vi.fn(), fail: false }));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: { refresh: mock.refresh } }));
vi.mock('gsap', () => ({ gsap: {
    registerPlugin: vi.fn(), set: vi.fn(),
    matchMedia: () => ({
        add: (conditions, callback) => { mock.queries = conditions; mock.cleanup = callback({ conditions: mock.conditions }); },
        revert: () => { mock.cleanup?.(); mock.revert(); },
    }),
    timeline: options => {
        if (mock.fail) throw new Error('initialization failure');
        const timeline = { options, calls: [], scrollTrigger: { kill: vi.fn() } };
        ['fromTo','to','progress','pause'].forEach(method => { timeline[method] = (...args) => { timeline.calls.push([method,...args]); return timeline; }; });
        mock.timelines.push(timeline); return timeline;
    },
} }));
import { mountLandingMotion } from './landingMotion';
afterEach(() => { mock.conditions = {}; mock.timelines = []; mock.cleanup = null; mock.fail = false; vi.clearAllMocks(); document.body.innerHTML = ''; });
function page(desktop = true) {
    mock.conditions = { desktop, mobile: !desktop, reduce: false };
    document.body.innerHTML = `<main><div class="landing-hero-shell"><div class="landing-hero-copy"><a href="/">Explore</a></div><img class="landing-hero-img" /></div><section class="landing-purpose"><h2 id="landing-purpose-heading">Purpose</h2><div class="landing-purpose-pillar"><span class="landing-purpose-icon"></span></div></section><section class="landing-bible-inner"><div class="landing-device-showcase"></div><div class="landing-bible-copy"></div></section><section class="landing-beyond-inner"><div class="landing-beyond-copy"></div><div class="knowledge-diagram-hub"></div><svg class="knowledge-lines"><path d="M 50 50 L 80 70" /></svg><div class="knowledge-diagram-node"></div></section><section class="landing-explore-final"><h2 id="landing-explore-heading">Explore</h2><ul class="closing-passages"><li><a href="/bible/Genesis/1">Genesis</a></li></ul><div class="closing-invitation"></div><a class="closing-explore-button"></a></section></main>`;
    return document.querySelector('main');
}
test('only hero and network pin on suitable desktops; every chapter scrubs', () => {
    const stop = mountLandingMotion(page());
    expect(mock.timelines.filter(t => t.options.scrollTrigger.pin)).toHaveLength(2);
    expect(mock.timelines.every(t => t.options.scrollTrigger.scrub)).toBe(true);
    expect(mock.queries.desktop).toContain('min-height: 900px');
    expect(mock.queries.desktop).toContain('pointer: fine'); stop();
});
test('mobile and reduced motion never create pins', () => {
    let stop = mountLandingMotion(page(false));
    expect(mock.timelines.some(t => t.options.scrollTrigger.pin)).toBe(false); stop();
    mock.timelines = []; mock.conditions.reduce = true;
    stop = mountLandingMotion(document.querySelector('main'));
    expect(mock.timelines).toHaveLength(0);
    expect(document.querySelector('main')).not.toHaveAttribute('data-scroll-narrative'); stop();
});
test('SVG paths grow from the real hub to their unchanged endpoints', () => {
    const stop = mountLandingMotion(page());
    const path = document.querySelector('path');
    const draw = mock.timelines.flatMap(t => t.calls).find(c => c[1] === path);
    expect(draw[2]).toMatchObject({ attr: { d: 'M 50 50 L 50 50' }, strokeWidth: 1.45 });
    expect(draw[3].strokeWidth).toBe(1);
    expect(draw[3].attr.d).toBe('M 50 50 L 80 70'); stop();
    expect(path.getAttribute('d')).toBe('M 50 50 L 80 70');
});
test('keyboard focus releases the relevant pin and makes controls readable', () => {
    const stop = mountLandingMotion(page());
    document.querySelector('.landing-hero-copy a').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(mock.timelines[0].scrollTrigger.kill).toHaveBeenCalledWith(true);
    expect(mock.timelines[0].calls).toContainEqual(['progress',1]); stop();
});
test('partial initialization reverts safely to the static page', () => {
    const root = page(); mock.fail = true; const stop = mountLandingMotion(root);
    expect(mock.revert).toHaveBeenCalled();
    expect(root).not.toHaveAttribute('data-scroll-narrative'); stop();
});
