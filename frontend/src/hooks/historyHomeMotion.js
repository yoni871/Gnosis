import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function mountHistoryHomeMotion(root) {
    const media = gsap.matchMedia();
    let focusHandler;

    media.add({
        desktop: "(min-width: 900px) and (hover: hover) and (pointer: fine)",
        mobile: "(max-width: 899px)",
        reduce: "(prefers-reduced-motion: reduce)",
    }, ({ conditions }) => {
        if (conditions.reduce) return;
        const { desktop, mobile } = conditions;
        const context = gsap.context(() => {
            root.dataset.historyMotion = "active";
            gsap.timeline({ defaults: { ease: "power3.out" } })
                .fromTo(".history-hero-copy > .history-home-eyebrow", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: .55 })
                .fromTo(".history-hero-copy h1 span", { y: 56, opacity: 0 }, { y: 0, opacity: 1, duration: .9, stagger: .12 }, .08)
                .fromTo([".history-hero-lede", ".history-hero-copy .history-home-action"], { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: .7, stagger: .1 }, .35)
                .fromTo(".history-hero-archive", { x: desktop ? 52 : 0, y: mobile ? 28 : 0, opacity: 0, rotate: 1.8 }, { x: 0, y: 0, opacity: 1, rotate: 0, duration: 1.15 }, .18)
                .fromTo(".history-hero-scroll", { opacity: 0 }, { opacity: 1, duration: .5 }, .82);

            gsap.timeline({ scrollTrigger: { trigger: ".history-hero", start: "top top", end: "bottom top", scrub: .45 }, defaults: { ease: "none" } })
                .to(".history-hero-copy h1 span:first-child", { yPercent: -18 }, 0)
                .to(".history-hero-copy h1 span:last-child", { yPercent: -34 }, 0)
                .to(".history-hero-lede", { yPercent: -25, opacity: .3 }, 0)
                .to(".history-hero-archive", { yPercent: desktop ? 13 : 6, scale: desktop ? 1.045 : 1.015 }, 0)
                .to(".history-archive-orbit--outer", { rotate: 14 }, 0)
                .to(".history-archive-orbit--inner", { rotate: -20 }, 0);

            gsap.utils.toArray("[data-history-reveal]").forEach((element, index) => {
                gsap.fromTo(element, { y: 42, opacity: 0 }, { y: 0, opacity: 1, duration: .85, ease: "power2.out", scrollTrigger: { trigger: element, start: "top 88%", once: true }, delay: index % 2 ? .04 : 0 });
            });

            gsap.timeline({ scrollTrigger: { trigger: ".history-home-steps", start: "top 82%", end: mobile ? "bottom 68%" : "bottom 58%", scrub: .35 } })
                .fromTo("[data-history-step]", { y: mobile ? 28 : 52, opacity: .18 }, { y: 0, opacity: 1, stagger: .22, duration: .7, ease: "power2.out" });

            gsap.timeline({ scrollTrigger: { trigger: ".history-home-recommendation", start: "top 88%", end: "center 48%", scrub: .4 } })
                .fromTo(".history-home-recommendation", { scale: .955, clipPath: "inset(5% 2% 5% 2%)" }, { scale: 1, clipPath: "inset(0% 0% 0% 0%)", duration: 1, ease: "power2.out" }, 0)
                .fromTo(".history-creation-number", { y: 48, opacity: .15 }, { y: 0, opacity: 1, duration: .65 }, .12)
                .fromTo(".history-creation-copy > *", { y: 30, opacity: .15 }, { y: 0, opacity: 1, stagger: .08, duration: .6 }, .22)
                .fromTo(".history-creation-seal", { rotate: -10, scale: .82, opacity: .2 }, { rotate: 0, scale: 1, opacity: 1, duration: .8 }, .28);

            gsap.fromTo(".history-book-chips li", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: .42, stagger: { each: .025, from: "start" }, ease: "power2.out", scrollTrigger: { trigger: "[data-history-books-reveal]", start: "top 86%", once: true } });

            focusHandler = (event) => {
                const target = event.target.closest("[data-history-reveal], [data-history-step], [data-history-books-reveal], .history-home-recommendation");
                if (target) gsap.set(target, { opacity: 1, x: 0, y: 0, scale: 1, clearProps: "clipPath" });
            };
            root.addEventListener("focusin", focusHandler);
        }, root);
        return () => {
            if (focusHandler) root.removeEventListener("focusin", focusHandler);
            delete root.dataset.historyMotion;
            context.revert();
        };
    });
    return () => media.revert();
}
