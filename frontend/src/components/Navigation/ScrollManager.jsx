import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Reset normal page-to-page navigation while leaving browser history,
 * in-page anchors, and same-page state changes in charge of their own scroll.
 */
export default function ScrollManager() {
    const location = useLocation();
    const navigationType = useNavigationType();
    const previousPathname = useRef(location.pathname);

    useEffect(() => {
        const changedPage = previousPathname.current !== location.pathname;
        previousPathname.current = location.pathname;

        if (changedPage && navigationType !== "POP" && !location.hash) {
            window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        }
    }, [location.pathname, location.hash, navigationType]);

    return null;
}
