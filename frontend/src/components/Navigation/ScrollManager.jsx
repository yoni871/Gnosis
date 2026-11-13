import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Reset normal page-to-page navigation while leaving browser history,
 * in-page anchors, and same-page state changes in charge of their own scroll.
 *
 * A hash that names an element on the page scrolls to it. The browser's
 * native anchor scroll does not run in this SPA: on a fresh load the
 * element is not in the DOM yet when the browser looks for it, and
 * React Router never scrolls on navigation. So ScrollManager owns it.
 * This covers /biblical-history#history-books on a direct visit, the
 * retired /biblical-history/books redirect, and the "All books"
 * breadcrumb. The target's scroll-margin-top clears the fixed header,
 * and reduced-motion users get an instant jump (the same rule the
 * in-page anchor helpers use).
 */
export default function ScrollManager() {
    const location = useLocation();
    const navigationType = useNavigationType();
    const previousPathname = useRef(location.pathname);

    useEffect(() => {
        const changedPage = previousPathname.current !== location.pathname;
        previousPathname.current = location.pathname;

        if (location.hash) {
            let id = location.hash.slice(1);
            try {
                id = decodeURIComponent(id);
            } catch {
                // A malformed hash is not an anchor; leave the scroll alone.
            }
            const target = id ? document.getElementById(id) : null;
            if (target?.scrollIntoView) {
                const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
                target.scrollIntoView({ behavior: reduce ? "instant" : "smooth", block: "start" });
            }
            return;
        }

        if (changedPage && navigationType !== "POP") {
            window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        }
    }, [location.pathname, location.hash, navigationType]);

    return null;
}
