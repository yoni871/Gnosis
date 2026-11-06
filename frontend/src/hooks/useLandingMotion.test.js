import { afterEach, expect, test, vi } from "vitest";
import { createLandingMotion } from "./useLandingMotion";

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });
function setup() {
    vi.stubGlobal("matchMedia", vi.fn());
    vi.stubGlobal("ResizeObserver", vi.fn());
    return document.body;
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test("unsupported browsers retain the static page without loading motion", () => {
    vi.stubGlobal("matchMedia", undefined);
    const load = vi.fn(); createLandingMotion(document.body, load)();
    expect(load).not.toHaveBeenCalled();
});
test("loads motion once and cleanup is idempotent", async () => {
    const cleanup = vi.fn(); const mountLandingMotion = vi.fn(() => cleanup);
    const stop = createLandingMotion(setup(), () => Promise.resolve({ mountLandingMotion }));
    await flush(); expect(mountLandingMotion).toHaveBeenCalledWith(document.body);
    stop(); stop(); expect(cleanup).toHaveBeenCalledOnce();
});
test("an unmounted page never initializes a late motion chunk", async () => {
    let resolve; const promise = new Promise(done => { resolve = done; });
    const mountLandingMotion = vi.fn(); const stop = createLandingMotion(setup(), () => promise);
    stop(); resolve({ mountLandingMotion }); await flush();
    expect(mountLandingMotion).not.toHaveBeenCalled();
});
test("a Strict Mode replacement survives the previous effect cleanup", async () => {
    const cleanups = [vi.fn(), vi.fn()]; let index = 0;
    const load = () => Promise.resolve({ mountLandingMotion: () => cleanups[index++] });
    const root = setup(); const first = createLandingMotion(root, load); await flush(); first();
    const replacement = createLandingMotion(root, load); await flush(); first();
    expect(cleanups[1]).not.toHaveBeenCalled(); replacement(); expect(cleanups[1]).toHaveBeenCalledOnce();
});
test("a failed animation chunk leaves readable static content", async () => {
    const root = setup(); root.innerHTML = '<h1>Explore Scripture.</h1>';
    const stop = createLandingMotion(root, () => Promise.reject(new Error("offline")));
    await flush(); expect(root.querySelector("h1")).toHaveTextContent("Explore Scripture.");
    expect(root.querySelector("h1")).not.toHaveAttribute("style"); stop();
});
