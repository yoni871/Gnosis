import { useEffect, useRef } from "react"

export default function useClickOutside(callback, eventType = "mousedown") {
    const ref = useRef(null)
    // Hold the latest callback in a ref so the document listeners are
    // subscribed once, instead of being torn down and re-added on every
    // render of the owner (every call site passes a fresh inline arrow).
    // The ref is updated in an effect, not during render, and it starts
    // out holding the first callback.
    const callbackRef = useRef(callback);
    useEffect(() => {
        callbackRef.current = callback;
    });

    useEffect(() => {
        function handleClickOutside(event) {
            const boundary = ref.current;
            // A click can replace its SVG icon before reaching this listener.
            // The original event path still identifies it as an inside click.
            if (!boundary || event.composedPath?.().includes(boundary) || boundary.contains(event.target)) return;
            callbackRef.current()
        }

        function handleEscape(event) {
            if (event.key === "Escape") {
                callbackRef.current()
            }
        }

        document.addEventListener(eventType, handleClickOutside)
        document.addEventListener("keydown", handleEscape)

        return () => {
            document.removeEventListener(eventType, handleClickOutside)
            document.removeEventListener("keydown", handleEscape)
        }
    }, [eventType])

    return ref
}
