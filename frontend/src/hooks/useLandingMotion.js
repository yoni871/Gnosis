import { useEffect } from "react";

// Lazy-load choreography only on the homepage. A failed chunk leaves static HTML.
export function createLandingMotion(root, load = () => import("./landingMotion")) {
    if (!root || !window.matchMedia || !window.ResizeObserver) return () => {};
    let disposed = false;
    let cleanup = () => {};
    load().then(({ mountLandingMotion }) => {
        if (!disposed) cleanup = mountLandingMotion(root);
    }).catch(() => { /* Static defaults remain readable if motion cannot load. */ });
    return () => {
        if (disposed) return;
        disposed = true;
        cleanup();
    };
}

export default function useLandingMotion(ref) {
    useEffect(() => createLandingMotion(ref.current), [ref]);
}
