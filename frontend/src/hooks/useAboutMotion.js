import { useEffect } from "react";

export default function useAboutMotion(ref) {
    useEffect(() => {
        if (!window.IntersectionObserver || !window.matchMedia || !Element.prototype.animate) return;
        const preference = matchMedia("(prefers-reduced-motion: reduce)");
        const animations = [];
        let observer;
        const reset = () => {
            observer?.disconnect();
            animations.splice(0).forEach(animation => animation.cancel());
        };
        const start = () => {
            reset();
            if (preference.matches) return;
            observer = new IntersectionObserver(entries => {
                entries.filter(entry => entry.isIntersecting).forEach(({ target }) => {
                    observer.unobserve(target);
                    try {
                        const heading = target.matches("h2");
                        animations.push(target.animate([
                            { translate: "0 18px", ...(heading ? { clipPath: "inset(100% 0 0 0)" } : {}) },
                            { translate: "0 0", ...(heading ? { clipPath: "inset(0% 0 0 0)" } : {}) },
                        ], { duration: 650, easing: "cubic-bezier(.22,.61,.36,1)" }));
                    } catch { reset(); }
                });
            }, { threshold: .12 });
            ref.current.querySelectorAll("[data-about-reveal]").forEach(target => observer.observe(target));
        };
        start();
        preference.addEventListener("change", start);
        return () => { reset(); preference.removeEventListener("change", start); };
    }, [ref]);
}
