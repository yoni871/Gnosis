import { useEffect, useRef } from "react";

// The devices belong to one photograph. Move the complete scene gently;
// never transform a cropped laptop lid or duplicate either device.
export default function useHeroParallax() {
    const mediaRef = useRef(null);

    useEffect(() => {
        const media = mediaRef.current;
        if (!media || !window.matchMedia) return;

        const desktop = window.matchMedia("(min-width: 1200px) and (pointer: fine)");
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let frame = null;
        let active = false;
        let top = 0;
        let height = 1;

        function paint() {
            frame = null;
            const progress = Math.min(1, Math.max(0, (window.scrollY - top) / height));
            media.style.setProperty("--hero-parallax", `${(progress * 18).toFixed(3)}px`);
        }
        function onScroll() {
            if (frame === null) frame = window.requestAnimationFrame(paint);
        }
        function measure() {
            const bounds = media.getBoundingClientRect();
            top = bounds.top + window.scrollY;
            height = Math.max(1, bounds.height);
            onScroll();
        }
        function stop() {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", measure);
            if (frame !== null) window.cancelAnimationFrame(frame);
            frame = null;
            active = false;
            media.removeAttribute("data-hero-motion");
            media.style.removeProperty("--hero-parallax");
        }
        function configure() {
            stop();
            if (!desktop.matches || reducedMotion.matches) return;
            active = true;
            media.dataset.heroMotion = "parallax";
            window.addEventListener("scroll", onScroll, { passive: true });
            window.addEventListener("resize", measure);
            measure();
        }
        function onPreferenceChange() {
            const shouldRun = desktop.matches && !reducedMotion.matches;
            if (active !== shouldRun) configure();
        }

        desktop.addEventListener("change", onPreferenceChange);
        reducedMotion.addEventListener("change", onPreferenceChange);
        configure();
        return () => {
            desktop.removeEventListener("change", onPreferenceChange);
            reducedMotion.removeEventListener("change", onPreferenceChange);
            stop();
        };
    }, []);

    return mediaRef;
}
