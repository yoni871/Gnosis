import { useEffect, useRef } from "react";
import { scrollProgress } from "./laptopMath";
import "./LaptopScene.css";

const PLATE = "/images/landing/laptop-prototype/desert-clean-plate.jpg";

export default function LaptopScene() {
    const root = useRef(null);
    const plate = useRef(null);
    const canvasHost = useRef(null);

    useEffect(() => {
        const media = root.current?.parentElement;
        if (!media || !window.matchMedia) return;
        const desktop = window.matchMedia("(min-width: 1100px) and (pointer: fine)");
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
        let renderer = null, abort = null, frame = null, generation = 0;
        let top = 0, height = 1, canvas = null;
        const observer = window.ResizeObserver ? new ResizeObserver(measure) : null;

        function paint() {
            frame = null;
            if (document.hidden || !renderer) return;
            renderer.render(scrollProgress(window.scrollY, top, height));
        }
        function schedule() {
            if (!renderer || frame !== null || document.hidden) return;
            if (window.scrollY > top + height || window.scrollY + window.innerHeight < top) return;
            frame = window.requestAnimationFrame(paint);
        }
        function measure() {
            const bounds = media.getBoundingClientRect();
            top = bounds.top + window.scrollY; height = Math.max(1, bounds.height);
            renderer?.resize(); schedule();
        }
        function stop() {
            generation += 1;
            canvas?.removeEventListener("webglcontextlost", stop); canvas = null;
            abort?.abort(); abort = null;
            if (frame !== null) window.cancelAnimationFrame(frame);
            frame = null; renderer?.dispose(); renderer = null;
            media.removeAttribute("data-laptop-ready");
            window.removeEventListener("scroll", schedule);
            window.removeEventListener("resize", measure);
            document.removeEventListener("visibilitychange", schedule);
            observer?.disconnect();
        }
        async function configure() {
            stop();
            if (!desktop.matches || reduced.matches) return;
            const ticket = generation;
            abort = new AbortController();
            const signal = abort.signal;
            try {
                plate.current.src = PLATE;
                const [, module] = await Promise.all([plate.current.decode(), import("./mountLaptopScene")]);
                if (ticket !== generation || signal.aborted) return;
                const next = await module.mountLaptopScene(canvasHost.current, signal);
                if (ticket !== generation || signal.aborted) { next?.dispose(); return; }
                if (!next) return;
                renderer = next;
                canvas = canvasHost.current.querySelector("canvas");
                canvas?.addEventListener("webglcontextlost", stop, { once: true });
                measure();
                renderer.render(scrollProgress(window.scrollY, top, height));
                media.dataset.laptopReady = "true";
                window.addEventListener("scroll", schedule, { passive: true });
                window.addEventListener("resize", measure);
                document.addEventListener("visibilitychange", schedule);
                observer?.observe(media);
            } catch {
                // WebGL/asset/decode failure leaves the approved static hero.
                if (ticket === generation) stop();
            }
        }
        desktop.addEventListener("change", configure);
        reduced.addEventListener("change", configure);
        void configure();
        return () => {
            desktop.removeEventListener("change", configure);
            reduced.removeEventListener("change", configure);
            stop();
        };
    }, []);

    return (
        <div ref={root} className="laptop-scene" aria-hidden="true">
            <img ref={plate} className="laptop-scene-plate" alt="" width="1672" height="941" decoding="async" />
            <div ref={canvasHost} className="laptop-scene-canvas" />
        </div>
    );
}
