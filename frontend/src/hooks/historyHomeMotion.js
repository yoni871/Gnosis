import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function mountHistoryHomeMotion(root) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
    const context = gsap.context(() => {
        root.dataset.historyMotion = "active";
        gsap.timeline({ defaults: { ease: "power3.out" } })
            .fromTo(".history-hero-copy > *", { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.09 })
            .fromTo(".history-hero-archive", { x: 36, opacity: 0, rotate: 1.5 }, { x: 0, opacity: 1, rotate: 0, duration: 1.1 }, 0.16)
            .fromTo(".history-hero-scroll", { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0.7);
        gsap.to(".history-hero-archive", { yPercent: 10, ease: "none", scrollTrigger: { trigger: ".history-hero", start: "top top", end: "bottom top", scrub: 0.45 } });
        gsap.utils.toArray("[data-history-reveal]").forEach((element) => {
            gsap.fromTo(element, { y: 38, opacity: 0 }, { y: 0, opacity: 1, duration: 0.85, ease: "power2.out", scrollTrigger: { trigger: element, start: "top 88%", once: true } });
        });
        gsap.fromTo("[data-history-step]", { y: 42, opacity: 0 }, { y: 0, opacity: 1, duration: 0.75, stagger: 0.12, ease: "power2.out", scrollTrigger: { trigger: ".history-home-steps", start: "top 82%", once: true } });
    }, root);
    return () => { delete root.dataset.historyMotion; context.revert(); };
}
