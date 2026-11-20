import { useEffect, useRef } from "react";
import { DEFAULT_STUDY_SPLIT } from "./studySplit";

export default function StudySplitDivider({ value, onChange, onReset }) {
    const dragging = useRef(false);

    useEffect(() => {
        const move = (event) => {
            if (dragging.current) onChange(event.clientX);
        };
        const stop = () => { dragging.current = false; };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("pointercancel", stop);
        };
    }, [onChange]);

    return (
        <div
            role="separator"
            aria-label="Resize Scripture and commentary panels"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(value)}
            aria-valuetext={`${Math.round(value)}% Scripture, ${Math.round(100 - value)}% commentary`}
            tabIndex={0}
            title="Drag or use arrow keys to resize. Press Home or double-click to reset."
            onPointerDown={(event) => {
                dragging.current = true;
                event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onDoubleClick={onReset}
            onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    onChange(value + (event.key === "ArrowRight" ? 2 : -2), true);
                } else if (event.key === "Home" || event.key === "Enter") {
                    event.preventDefault();
                    onReset(DEFAULT_STUDY_SPLIT);
                }
            }}
            className="group relative z-10 cursor-col-resize touch-none bg-[var(--border)] outline-none transition-colors hover:bg-[var(--color-accent)] focus-visible:bg-[var(--color-accent)]"
        >
            <span className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--text-muted)] opacity-45 group-hover:opacity-80" aria-hidden="true" />
            <span className="sr-only">Resize panels</span>
        </div>
    );
}
