import { useCallback, useState } from "react";
import { Bookmark, Highlighter, Languages, X } from "lucide-react";
import {
    autoUpdate,
    flip,
    FloatingFocusManager,
    FloatingPortal,
    hide,
    offset,
    shift,
    useDismiss,
    useFloating,
    useInteractions
} from "@floating-ui/react";

import HighlightColorPicker from "./HighlightColorPicker";
import "./VerseActions.css";

export default function VerseActions({
    passage,
    savedBookmark,
    bookmarksState,
    onHighlight,
    isHighlightBusy,
    onClearHighlight,
    hasHighlight,
    onOriginalLanguage,
    onClearSelection
}) {
    const [isColorOpen, setIsColorOpen] = useState(false);

    const [boundary, setBoundary] = useState();
    const overflow = { boundary, padding: 8 };
    const toolbar = useFloating({
        placement: "top-start",
        strategy: "fixed",
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip(overflow), shift(overflow), hide({ boundary })]
    });
    // This hidden marker contributes no line box. Measure the actual verse,
    // not a zero-size inline anchor, so scrolling keeps the overlay attached.
    const setAnchor = useCallback((node) => {
        toolbar.refs.setReference(node?.parentElement ?? null);
        setBoundary(node?.closest(".scripture-scroll"));
    }, [toolbar.refs.setReference]);
    const toolbarHidden =
        !toolbar.isPositioned || toolbar.middlewareData.hide?.referenceHidden;

    // Position the pen palette relative to the highlighter button.
    const palette = useFloating({
        open: isColorOpen,
        onOpenChange: setIsColorOpen,
        placement: "bottom",
        strategy: "fixed",
        whileElementsMounted: autoUpdate,
        middleware: [
            offset(12),
            flip(overflow),
            shift(overflow),
            hide({ boundary })
        ]
    });

    // Close the palette with Escape or a click outside it.
    const dismiss = useDismiss(palette.context);
    const { getFloatingProps } = useInteractions([dismiss]);

    const bookmarkBusy =
        bookmarksState.isLoading ||
        bookmarksState.isSaving ||
        bookmarksState.deletingId !== null;

    const paletteHidden =
        toolbarHidden ||
        !palette.isPositioned ||
        palette.middlewareData.hide?.referenceHidden;

    return (
        <>
            <span ref={setAnchor} hidden aria-hidden="true" />
            <FloatingPortal>
            <span
                ref={toolbar.refs.setFloating}
                style={{
                    ...toolbar.floatingStyles,
                    visibility: toolbarHidden ? "hidden" : "visible"
                }}
                className="gnosis-verse-toolbar"
                role="group"
                aria-label="Selected verse actions"
                // Clicking a tool must not toggle the verse underneath.
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    type="button"
                    disabled={bookmarkBusy}
                    aria-label={
                        savedBookmark
                            ? "Remove bookmark"
                            : "Bookmark passage"
                    }
                    aria-pressed={Boolean(savedBookmark)}
                    title={
                        savedBookmark
                            ? "Remove bookmark"
                            : "Bookmark passage"
                    }
                    className="gnosis-verse-tool"
                    onClick={() => {
                        if (savedBookmark) {
                            bookmarksState.handleDeleteBookmark(
                                savedBookmark.id
                            );
                        } else {
                            bookmarksState.handleAddBookmarks(passage);
                        }
                    }}
                >
                    <Bookmark
                        size={18}
                        fill={savedBookmark ? "currentColor" : "none"}
                        aria-hidden="true"
                    />
                    <span className="gnosis-verse-tool-label">Bookmark</span>
                </button>
                <span className="gnosis-tool-divider" aria-hidden="true" />

                <button
                    ref={palette.refs.setReference}
                    type="button"
                    disabled={isHighlightBusy}
                    aria-label="Choose highlight color"
                    aria-expanded={isColorOpen}
                    title="Highlight"
                    className={`gnosis-verse-tool ${
                        isColorOpen ? "is-active" : ""
                    }`}
                    onClick={() => setIsColorOpen((open) => !open)}
                >
                    <Highlighter size={18} aria-hidden="true" />
                    <span className="gnosis-verse-tool-label">Highlight</span>
                </button>
                <span className="gnosis-tool-divider" aria-hidden="true" />

                <button
                    type="button"
                    aria-label="Original language analysis"
            data-testid="ol-toolbar-button"
                    title="Original Language"
                    className="gnosis-verse-tool"
                    onClick={onOriginalLanguage}
                >
                    <Languages size={18} aria-hidden="true" />
                    <span className="gnosis-verse-tool-label">Original Language</span>
                </button>

                <span
                    className="gnosis-tool-divider"
                    aria-hidden="true"
                />

                <button
                    type="button"
                    aria-label="Clear verse selection"
                    title="Clear selection"
                    className="gnosis-verse-tool gnosis-verse-tool-close"
                    onClick={onClearSelection}
                >
                    <X size={17} aria-hidden="true" />
                </button>
            </span>
            </FloatingPortal>

            {isColorOpen && (
                <FloatingPortal>
                    <FloatingFocusManager
                        context={palette.context}
                        modal={false}
                    >
                        <div
                            ref={palette.refs.setFloating}
                            {...getFloatingProps({
                                onClick: (event) => event.stopPropagation()
                            })}
                            style={{
                                ...palette.floatingStyles,
                                visibility: paletteHidden
                                    ? "hidden"
                                    : "visible"
                            }}
                            className="gnosis-floating-palette"
                            role="dialog"
                            aria-label="Highlight colors"
                        >
                            <HighlightColorPicker
                                disabled={isHighlightBusy}
                                onSelect={onHighlight}
                                onClear={onClearHighlight}
                                hasHighlight={hasHighlight}
                            />
                        </div>
                    </FloatingFocusManager>
                </FloatingPortal>
            )}
        </>
    );
}