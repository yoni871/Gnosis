import { useEffect } from "react";

export function createHistoryHomeMotion(root, load = () => import("./historyHomeMotion")) {
    if (!root || !window.matchMedia) return () => {};
    let disposed = false;
    let cleanup = () => {};
    load().then(({ mountHistoryHomeMotion }) => { if (!disposed) cleanup = mountHistoryHomeMotion(root); })
        .catch(() => { /* The static experience remains complete without motion. */ });
    return () => { disposed = true; cleanup(); };
}

export default function useHistoryHomeMotion(ref) {
    useEffect(() => createHistoryHomeMotion(ref.current), [ref]);
}
