import { afterEach, expect, test, vi } from "vitest";
import { createLandingMotion } from "./useLandingMotion";
const originalAnimate = Element.prototype.animate;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); Element.prototype.animate = originalAnimate; document.body.innerHTML = ""; });
function setup(reduced = false) {
    document.body.innerHTML = '<main><section class="landing-hero-shell"><div class="landing-hero-copy"><a href="/">Explore</a></div><img /></section><div class="knowledge-diagram-plane"><div class="knowledge-diagram-hub"></div><div class="knowledge-diagram-node"></div></div></main>';
    const preference = { matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", () => preference);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const animations = [];
    Element.prototype.animate = vi.fn(function () {
        const animation = { pause: vi.fn(), cancel: vi.fn(), currentTime: 0 };
        animations.push({ element: this, animation }); return animation;
    });
    return { root: document.querySelector("main"), preference, animations };
}
test("unsupported browsers keep the static page without scroll listeners", () => {
    const listener = vi.spyOn(window, "addEventListener");
    createLandingMotion(document.body)();
    expect(listener.mock.calls.some(([name]) => name === "scroll")).toBe(false);
});
test("reduced motion skips animation and live preference changes cancel effects", () => {
    const { root, preference, animations } = setup(true);
    const stop = createLandingMotion(root);
    expect(animations).toHaveLength(0);
    preference.matches = false; preference.addEventListener.mock.calls[0][1]();
    expect(animations.length).toBeGreaterThan(0);
    preference.matches = true; preference.addEventListener.mock.calls[0][1]();
    expect(animations.every(({ animation }) => animation.cancel.mock.calls.length)).toBe(true);
    stop();
});
test("the hero image stays static and keyboard focus restores copy", () => {
    const { root, animations } = setup(); const stop = createLandingMotion(root);
    expect(animations.some(({ element }) => element.matches("img"))).toBe(false);
    root.querySelector("a").dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(animations[0].animation.cancel).toHaveBeenCalledOnce(); stop();
});
test("repeatable cleanup cannot cancel a Strict Mode replacement", () => {
    const { root, animations } = setup(); const stop = createLandingMotion(root); stop();
    const offset = animations.length; const replacement = createLandingMotion(root); stop();
    expect(animations.slice(offset).every(({ animation }) => animation.cancel.mock.calls.length === 0)).toBe(true);
    replacement();
});
test("partial initialization failure cancels earlier effects", () => {
    const { root, animations } = setup();
    Element.prototype.animate.mockImplementationOnce(() => {
        const animation = { pause: vi.fn(), cancel: vi.fn() }; animations.push({ animation }); return animation;
    }).mockImplementationOnce(() => { throw new Error("unsupported"); });
    createLandingMotion(root)(); expect(animations[0].animation.cancel).toHaveBeenCalled();
});
test("scroll updates are coalesced into one frame and reverse with native position", () => {
    const { root, animations } = setup();
    root.querySelector('.landing-hero-shell').getBoundingClientRect = () => ({ top: -window.scrollY, height: 800 });
    const frame = vi.fn(() => 123); vi.stubGlobal('requestAnimationFrame', frame);
    const stop = createLandingMotion(root);
    vi.stubGlobal('scrollY', 300);
    window.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('scroll'));
    expect(frame).toHaveBeenCalledTimes(1);
    frame.mock.calls.at(-1)[0]();
    expect(animations[0].animation.currentTime).toBe(500);
    vi.stubGlobal('scrollY', 0); window.dispatchEvent(new Event('scroll'));
    frame.mock.calls.at(-1)[0]();
    expect(animations[0].animation.currentTime).toBe(0); stop();
});
