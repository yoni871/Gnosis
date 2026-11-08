import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./landingMotion.css";

gsap.registerPlugin(ScrollTrigger);

// Each chapter is scrubbed, not time-triggered. Only two desktop moments pin;
// content taller than the viewport and every touch/narrow layout remain unpinned.
export function mountLandingMotion(root) {
    const media = gsap.matchMedia();
    let alive = true;
    const originalPaths = [...root.querySelectorAll(".knowledge-lines path")].map(path => [path, path.getAttribute("d")]);
    let refreshFrame = 0;
    const refresh = () => {
        if (!alive || refreshFrame) return;
        refreshFrame = requestAnimationFrame(() => {
            refreshFrame = 0;
            // Defer geometry refreshes until scrolling stops so image loads and
            // focus changes cannot interrupt the footer's smooth return to top.
            if (alive) ScrollTrigger.refresh(true);
        });
    };
    try {
        media.add({
            desktop: "(min-width: 1200px) and (min-height: 900px) and (hover: hover) and (pointer: fine)",
            mobile: "(max-width: 767px)",
            reduce: "(prefers-reduced-motion: reduce)",
            all: "all",
        }, context => {
            if (context.conditions.reduce) return;
            const { desktop, mobile } = context.conditions;
            const select = selector => root.querySelector(selector);
            const all = selector => [...root.querySelectorAll(selector)];
            const chapters = [];
            const timeline = (trigger, options = {}) => {
                const result = gsap.timeline({
                    defaults: { ease: "none", duration: 1 },
                    scrollTrigger: { trigger, start: "top 88%", end: "top 28%", scrub: .35, invalidateOnRefresh: true, ...options },
                });
                chapters.push({ trigger, timeline: result });
                return result;
            };
            root.dataset.scrollNarrative = "active";
            const hero = select(".landing-hero-shell");
            const heroPin = desktop && hero.offsetHeight <= innerHeight;
            timeline(hero, {
                start: "top top", end: () => `+=${Math.round(innerHeight * (heroPin ? .6 : .55))}`,
                pin: heroPin, pinSpacing: true, anticipatePin: heroPin ? 1 : 0,
            })
                .to(select(".landing-hero-img"), { scale: mobile ? 1.035 : 1.10, transformOrigin: "50% 65%", duration: 1.2 }, 0)
                .to(select(".landing-hero-copy"), { y: mobile ? -50 : -126, opacity: 0, duration: .7 }, .12)
                .to(hero, { "--hero-ivory-transition": 1, duration: .5 }, .7);

            const purpose = timeline(select(".landing-purpose"), { start: "top 78%", end: "bottom 55%" });
            purpose.fromTo(select("#landing-purpose-heading"), { clipPath: "inset(100% 0 0 0)", y: 50 }, { clipPath: "inset(0% 0 0 0)", y: 0, duration: .5, ease: "power2.out" }, 0);
            all(".landing-purpose-pillar").forEach((pillar, index) => {
                const at = .35 + index * .58;
                purpose.fromTo(pillar, { y: 40, x: mobile ? 0 : (index - 1) * 14, opacity: .5 }, { y: 0, x: 0, opacity: 1, duration: .42 }, at)
                    .fromTo(pillar.querySelector(".landing-purpose-icon"), { scale: .75 }, { scale: 1.17, duration: .24 }, at)
                    .to(pillar.querySelector(".landing-purpose-icon"), { scale: 1, duration: .22 }, at + .24);
            });

            const showcase = timeline(select(".landing-bible-inner"), { start: "top 88%", end: "bottom 65%" });
            showcase.fromTo(select(".landing-device-showcase"), {
                scale: mobile ? .875 : .75, y: mobile ? 50 : 112, x: mobile ? 0 : -36,
            }, { scale: 1, x: 0, y: 0, duration: 1.3, ease: "power2.inOut" }, 0)
                .fromTo(select(".landing-bible-copy"), { y: 48 }, { y: 0, duration: 1 }, .12);

            const diagram = select(".landing-beyond-inner");
            const diagramPin = desktop && diagram.offsetHeight < innerHeight - 80;
            const network = timeline(diagramPin ? diagram : select(".knowledge-diagram-plane"), {
                start: diagramPin ? "center center" : "top 88%",
                end: diagramPin ? () => `+=${Math.round(innerHeight * 1.05)}` : "center 42%",
                pin: diagramPin, pinSpacing: true, anticipatePin: diagramPin ? 1 : 0,
            });
            network.fromTo(select(".knowledge-diagram-hub"), { scale: 1.28 }, { scale: 1, duration: .65, ease: "power2.out" }, 0)
                .fromTo(select(".landing-beyond-copy"), { y: 34 }, { y: 0, duration: .65 }, 0);
            const nodes = all(".knowledge-diagram-node");
            all(".knowledge-lines path").forEach((path, index) => {
                const d = path.getAttribute("d");
                const [x, y] = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
                network.fromTo(path, { attr: { d: `M ${x} ${y} L ${x} ${y}` }, strokeWidth: 1.45 }, { attr: { d }, strokeWidth: 1, duration: .78 }, .45 + index % nodes.length * .24);
            });
            nodes.forEach((node, index) => {
                network.fromTo(node, { scale: .80, opacity: .25 }, { scale: 1, opacity: 1, duration: .45, ease: "power2.out" }, 1.05 + index * .24);
            });
            // Hold the completed network briefly before releasing the pin.
            network.to({}, { duration: .35 });

            const closing = timeline(select(".landing-explore-final"), { start: "top 82%", end: "bottom 90%" });
            closing.fromTo(select("#landing-explore-heading"), { y: 50, clipPath: "inset(100% 0 0 0)" }, { y: 0, clipPath: "inset(0% 0 0 0)", duration: .45, ease: "power2.out" }, 0)
                .fromTo(all(".closing-passages > li"), { y: mobile ? 34 : 84, scale: .89 }, { y: 0, scale: 1, stagger: .11, duration: .6, ease: "power1.out" }, .3)
                .fromTo([select(".closing-invitation"), select(".closing-explore-button")], { y: 28 }, { y: 0, duration: .4, stagger: .1 }, 1.10);

            // Preserve native focus/anchor navigation. Focused controls must never
            // inherit a scrubbed opacity/transform from an offscreen chapter.
            const focus = event => {
                chapters.forEach(({ trigger, timeline: chapter }) => {
                    if (trigger.contains(event.target)) {
                        chapter.scrollTrigger?.kill(true);
                        chapter.progress(1).pause();
                        if (trigger === hero) {
                            gsap.set(select(".landing-hero-copy"), { clearProps: "transform,opacity" });
                            gsap.set(hero, { "--hero-ivory-transition": 0 });
                        }
                    }
                });
                refresh();
            };
            root.addEventListener("focusin", focus);
            refresh();
            return () => {
                root.removeEventListener("focusin", focus);
                delete root.dataset.scrollNarrative;
                originalPaths.forEach(([path, d]) => path.setAttribute("d", d));
            };
        }, root);
    } catch {
        media.revert();
        delete root.dataset.scrollNarrative;
        originalPaths.forEach(([path, d]) => path.setAttribute("d", d));
    }
    // Font metrics and image decoding can change trigger positions after mount.
    document.fonts?.ready.then(refresh);
    const images = [...root.querySelectorAll("img")];
    images.forEach(image => image.addEventListener("load", refresh));
    return () => {
        alive = false;
        cancelAnimationFrame(refreshFrame);
        images.forEach(image => image.removeEventListener("load", refresh));
        media.revert();
    };
}
