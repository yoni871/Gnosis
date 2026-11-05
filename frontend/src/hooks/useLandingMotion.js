import { useEffect } from "react";

const clamp = value => Math.max(0, Math.min(1, value));

// Progressive enhancement only: no CSS hides content before this controller runs.
// Paused Web Animations are sought from native scroll position, never a scroll proxy.
export function createLandingMotion(root) {
    if (!root || !window.matchMedia || !window.ResizeObserver || !Element.prototype.animate) return () => {};
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stop = () => {};
    const start = () => {
        stop();
        if (preference.matches) return;
        const animations = [];
        const groups = [];
        let frame = 0;
        let disposed = false;
        const one = selector => root.querySelector(selector);
        const add = (anchor, specs, hero = false) => {
            if (!anchor) return;
            const tracks = specs.filter(spec => spec.element).map(spec => {
                const animation = spec.element.animate(spec.frames, {
                    duration: 1000, fill: "both", easing: "cubic-bezier(.22,.61,.36,1)",
                });
                animations.push(animation);
                animation.pause();
                return { ...spec, animation };
            });
            groups.push({ anchor, tracks, hero, focused: false });
        };
        const rise = (element, distance = 20, scale = 1, start = 0, end = 1, opacity = 1) => ({
            element, start, end,
            // Individual translate/scale preserve diagram positioning transforms.
            frames: [{ translate: `0 ${distance}px`, scale, opacity }, { translate: "0 0", scale: 1, opacity: 1 }],
        });
        const measure = () => {
            const scroll = window.scrollY;
            groups.forEach(group => {
                const rect = group.anchor.getBoundingClientRect();
                group.top = rect.top + scroll;
                group.height = rect.height;
                group.tracks.forEach(({ element, animation }) => {
                    if (element.tagName === "line") {
                        const bounds = element.getBoundingClientRect();
                        const length = Math.max(1, Math.hypot(bounds.width, bounds.height));
                        animation.effect.setKeyframes([
                            { strokeDasharray: `${length}`, strokeDashoffset: `${length}` },
                            { strokeDasharray: `${length}`, strokeDashoffset: "0" },
                        ]);
                    }
                });
            });
        };
        const render = () => {
            frame = 0;
            if (disposed) return;
            const scroll = window.scrollY;
            const viewport = window.innerHeight;
            groups.forEach(group => {
                // Finish while comfortably in view, even on short mobile screens.
                const progress = group.hero
                    ? clamp((scroll - group.top) / Math.max(1, group.height * .75))
                    : clamp((scroll + viewport * .92 - group.top) / Math.max(1, Math.min(group.height, viewport * .58)));
                group.tracks.forEach(({ animation, start = 0, end = 1 }) => {
                    animation.currentTime = (group.focused ? 1 : clamp((progress - start) / (end - start))) * 1000;
                });
            });
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
        const resize = () => { measure(); schedule(); };
        const focus = event => {
            groups.forEach(group => {
                if (group.anchor.contains(event.target)) {
                    // A keyboard-focused control always receives its resting appearance.
                    group.focused = true;
                    group.tracks.forEach(({ animation }) => animation.cancel());
                    group.tracks = [];
                }
            });
        };
        const observer = new ResizeObserver(resize);
        stop = () => {
            disposed = true;
            cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener("scroll", schedule);
            window.removeEventListener("resize", resize);
            root.removeEventListener("focusin", focus);
            animations.forEach(animation => animation.cancel());
        };
        try {
            add(one(".landing-hero-shell"), [{ element: one(".landing-hero-copy"), frames: [
                { translate: "0 0", opacity: 1 }, { translate: "0 -36px", opacity: 0 },
            ] }], true);
            add(one("#landing-purpose-heading"), [{ element: one("#landing-purpose-heading"), frames: [
                { clipPath: "inset(100% 0 0 0)", translate: "0 18px" },
                { clipPath: "inset(0% 0 0 0)", translate: "0 0" },
            ] }]);
            add(one(".landing-purpose-pillars"), [...root.querySelectorAll(".landing-purpose-pillar")].map((element, index) => rise(element, 18, 1, index * .12, .72 + index * .12)));
            add(one(".landing-bible-inner"), [rise(one(".landing-bible-copy"), 16, 1, 0, .75), rise(one(".landing-device-showcase"), 28, .965, .12, 1)]);
            add(one(".landing-beyond-copy"), [rise(one(".landing-beyond-copy"), 14)]);
            const plane = one(".knowledge-diagram-plane");
            const lines = [...root.querySelectorAll(".knowledge-lines line")];
            const nodes = [...root.querySelectorAll(".knowledge-diagram-node")];
            add(plane, [
                rise(one(".knowledge-diagram-hub"), 0, .94, 0, .25),
                ...lines.map((element, index) => {
                    const bounds = element.getBoundingClientRect();
                    const length = Math.max(1, Math.hypot(bounds.width, bounds.height));
                    const delay = (index % nodes.length) * .055;
                    return { element, start: .18 + delay, end: .55 + delay, frames: [
                        { strokeDasharray: `${length}`, strokeDashoffset: `${length}` },
                        { strokeDasharray: `${length}`, strokeDashoffset: "0" },
                    ] };
                }),
                ...nodes.map((element, index) => rise(element, 7, .97, .35 + index * .055, .7 + index * .055, .65)),
            ]);
            add(one(".closing-passages"), [...root.querySelectorAll(".closing-passages > li")].map((element, index) => rise(element, 20, .98, index * .06, .65 + index * .06)));
            add(one(".landing-closing-footer"), [rise(one(".landing-closing-footer"), 8, 1)]);
            measure();
            render();
            observer.observe(root);
            window.addEventListener("scroll", schedule, { passive: true });
            window.addEventListener("resize", resize);
            root.addEventListener("focusin", focus);
        } catch {
            // Unsupported keyframes or partial initialization must leave a static page.
            stop();
        }
    };
    start();
    preference.addEventListener("change", start);
    return () => {
        preference.removeEventListener("change", start);
        stop();
    };
}

export default function useLandingMotion(ref) {
    useEffect(() => createLandingMotion(ref.current), [ref]);
}
