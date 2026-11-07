import { useEffect, useRef } from "react"

export default function useClickOutside(callback, eventType = "mousedown") {
    const ref = useRef(null)

    useEffect(() => {
        function handleClickOutside(event) {
            const boundary = ref.current;
            // A click can replace its SVG icon before reaching this listener.
            // The original event path still identifies it as an inside click.
            if (!boundary || event.composedPath?.().includes(boundary) || boundary.contains(event.target)) return;
            callback();
        }

        function handleEscape(event) {
            if (event.key === "Escape") {
                callback()
            }
        }

        document.addEventListener(eventType, handleClickOutside)
        document.addEventListener("keydown", handleEscape)

        return () => {
            document.removeEventListener(eventType, handleClickOutside)
            document.removeEventListener("keydown", handleEscape)
        }
    }, [callback, eventType])

    return ref
}
