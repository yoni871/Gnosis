import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// How long to keep looking for a hash target that is not in the DOM
// yet. The Biblical History index page is a lazy chunk, so on a fresh
// load the #history-books section appears ~900ms after the first
// commit; 2s leaves comfortable margin without polling forever.
const HASH_TARGET_TIMEOUT_MS = 2000;

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
 * breadcrumb. The target's scroll-margin-top clears the fixed header.
 *
 * Hash scrolls are always instant, never smooth: a smooth scroll
 * animates while above-the-fold layout is still settling (fonts, the
 * lazy chunk), so the landing undershoots by hundreds of pixels. An
 * instant jump lands exactly, and it is the native anchor behavior.
 * (That also means reduced-motion users get the jump they prefer.)
 *
 * When the hash target is not in the DOM yet — a fresh load while the
 * route's lazy chunk is still resolving — the effect retries on
 * animation frames until the element appears or the timeout passes.
 * Without the retry the effect fires once on the initial commit (the
 * Suspense fallback), finds no target, and never re-runs, because its
 * deps (pathname, hash, navigation type) never change afterwards.
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
                return;
            }
            if (!id) return;

            const scrollToTarget = () => {
                const target = document.getElementById(id);
                if (!target?.scrollIntoView) return false;
                target.scrollIntoView({ behavior: "instant", block: "start" });
                return true;
            };
            if (scrollToTarget()) return;

            const deadline = performance.now() + HASH_TARGET_TIMEOUT_MS;
            let frame;
            const tick = () => {
                if (scrollToTarget()) return;
                if (performance.now() < deadline) {
                    frame = requestAnimationFrame(tick);
                }
            };
            frame = requestAnimationFrame(tick);
            return () => cancelAnimationFrame(frame);
        }

        if (changedPage && navigationType !== "POP") {
            window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        }
        return undefined;
    }, [location.pathname, location.hash, navigationType]);

    return null;
}
