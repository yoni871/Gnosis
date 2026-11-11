// Mobile detection for the History panel/nav layouts (≤768px, the same
// breakpoint the Original Language bottom sheet uses). Safe in jsdom:
// matchMedia is undefined there, so tests default to the desktop layout
// unless they stub window.matchMedia.
import { useEffect, useState } from "react";

export function useHistoryIsMobile() {
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
        return window.matchMedia("(max-width: 768px)").matches;
    });
    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
        const query = window.matchMedia("(max-width: 768px)");
        const onChange = () => setIsMobile(query.matches);
        if (typeof query.addEventListener === "function") {
            query.addEventListener("change", onChange);
            return () => query.removeEventListener("change", onChange);
        }
        return undefined;
    }, []);
    return isMobile;
}
