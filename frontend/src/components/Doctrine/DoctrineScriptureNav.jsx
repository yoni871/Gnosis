// Previous / next passage navigation for the Doctrine workspace.
//
// The study follows four passages in a fixed order. The buttons step
// through them and never wrap: Previous is disabled on Genesis 1:26
// and Next is disabled on 2 Corinthians 13:14, so the ends of the
// study are honest ends, not a loop back to the start.
export default function DoctrineScriptureNav({
    passageIndex,
    passageCount,
    previousLabel,
    nextLabel,
    onPrevious,
    onNext,
}) {
    const isFirst = passageIndex <= 0;
    const isLast = passageIndex >= passageCount - 1;

    return (
        <nav className="doctrine-scripture-nav" aria-label="Passages in this study">
            <button
                type="button"
                className="doctrine-scripture-nav-button"
                disabled={isFirst}
                onClick={onPrevious}
                aria-label={previousLabel ? `Previous passage: ${previousLabel}` : "Previous passage"}
            >
                <span aria-hidden="true">←</span> Previous
            </button>
            <p className="doctrine-scripture-nav-position" aria-live="polite">
                {passageIndex + 1} OF {passageCount}
            </p>
            <button
                type="button"
                className="doctrine-scripture-nav-button"
                disabled={isLast}
                onClick={onNext}
                aria-label={nextLabel ? `Next passage: ${nextLabel}` : "Next passage"}
            >
                Next <span aria-hidden="true">→</span>
            </button>
        </nav>
    );
}
