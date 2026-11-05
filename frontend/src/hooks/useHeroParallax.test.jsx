import { StrictMode, useEffect } from "react";
import { act, render } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import useHeroParallax from "./useHeroParallax";

let desktop, reduced, frames, nextFrame, renders;
function query(matches) {
    const listeners = new Set();
    return { matches, listeners,
        addEventListener: vi.fn((_, fn) => listeners.add(fn)),
        removeEventListener: vi.fn((_, fn) => listeners.delete(fn)),
        change(value) { this.matches = value; act(() => listeners.forEach(fn => fn())); },
    };
}
function flush() {
    act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); });
}
function scroll(y) {
    vi.stubGlobal("scrollY", y);
    act(() => window.dispatchEvent(new Event("scroll")));
}
function Scene() {
    useEffect(() => { renders += 1; });
    const ref = useHeroParallax();
    return <div ref={ref} data-testid="scene" />;
}
beforeEach(() => {
    desktop = query(true); reduced = query(false); frames = new Map(); nextFrame = 0; renders = 0;
    vi.stubGlobal("scrollY", 0);
    vi.stubGlobal("matchMedia", vi.fn(value => value.includes("reduced-motion") ? reduced : desktop));
    vi.stubGlobal("requestAnimationFrame", vi.fn(fn => { frames.set(++nextFrame, fn); return nextFrame; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn(id => frames.delete(id)));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ top: -window.scrollY, height: 800 }));
});
test("scroll progress reverses and is bounded without rerendering", () => {
    const scene = render(<Scene />).getByTestId("scene"); flush();
    const initial = renders;
    expect(scene.style.getPropertyValue("--hero-parallax")).toBe("0.000px");
    scroll(400); flush(); expect(scene.style.getPropertyValue("--hero-parallax")).toBe("9.000px");
    scroll(1200); flush(); expect(scene.style.getPropertyValue("--hero-parallax")).toBe("18.000px");
    scroll(200); flush(); expect(scene.style.getPropertyValue("--hero-parallax")).toBe("4.500px");
    scroll(-20); flush(); expect(scene.style.getPropertyValue("--hero-parallax")).toBe("0.000px");
    expect(renders).toBe(initial);
});
test("coalesces scroll events into one animation frame", () => {
    render(<Scene />); flush(); scroll(100); scroll(200); scroll(300); expect(frames.size).toBe(1);
});
test.each(["mobile", "reduced motion"])("keeps a static scene for %s", mode => {
    if (mode === "mobile") desktop.matches = false; else reduced.matches = true;
    const scene = render(<Scene />).getByTestId("scene"); scroll(400);
    expect(scene).not.toHaveAttribute("data-hero-motion"); expect(frames.size).toBe(0);
});
test("responds to preference changes and cancels pending motion", () => {
    const scene = render(<Scene />).getByTestId("scene"); expect(frames.size).toBe(1);
    reduced.change(true); expect(frames.size).toBe(0);
    expect(scene.style.getPropertyValue("--hero-parallax")).toBe(""); expect(scene).not.toHaveAttribute("data-hero-motion");
    reduced.change(false); flush(); expect(scene).toHaveAttribute("data-hero-motion", "parallax");
    desktop.change(false); expect(scene).not.toHaveAttribute("data-hero-motion");
});
test("Strict Mode leaves one loop and cleanup removes listeners and frames", () => {
    const added = vi.spyOn(window, "addEventListener"), removed = vi.spyOn(window, "removeEventListener");
    const view = render(<StrictMode><Scene /></StrictMode>), scene = view.getByTestId("scene");
    expect(desktop.listeners.size).toBe(1); expect(frames.size).toBe(1);
    view.unmount(); expect(frames.size).toBe(0); expect(desktop.listeners.size).toBe(0); expect(reduced.listeners.size).toBe(0);
    expect(scene).not.toHaveAttribute("data-hero-motion");
    for (const [type, fn] of added.mock.calls.filter(([type]) => type === "scroll" || type === "resize")) expect(removed).toHaveBeenCalledWith(type, fn);
});
test("falls back to a static image without media-query detection", () => {
    vi.stubGlobal("matchMedia", undefined); expect(render(<Scene />).getByTestId("scene")).not.toHaveAttribute("data-hero-motion");
});
