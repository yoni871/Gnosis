// Previous / next passage navigation for the Doctrine workspace,
// with a direct passage jump.
//
// The study follows four passages in a fixed order. The buttons step
// through them and never wrap: Previous is disabled on Genesis 1:26
// and Next is disabled on 2 Corinthians 13:14, so the ends of the
// study are honest ends, not a loop back to the start. The select
// jumps straight to any passage; each option names its position
// ("Genesis 1:26 (1 of 4)") so the reader always knows where they
// are. With focus on the navigation (but not inside the select,
// where arrow keys keep their native meaning), Left steps back and
// Right steps forward.
export default function DoctrineScriptureNav({
    passageIndex,
    passageCount,
    previousLabel,
    nextLabel,
    passages = [],
    passageId,
    onSelectPassage,
    onPrevious,
    onNext,
}) {
    const isFirst = passageIndex <= 0;
    const isLast = passageIndex >= passageCount - 1;

    const onKeyDown = (event) => {
        // The select keeps its native arrow-key behavior.
        if (event.target?.tagName === "SELECT") return;
        if (event.key === "ArrowLeft" && !isFirst) {
            event.preventDefault();
            onPrevious?.();
        } else if (event.key === "ArrowRight" && !isLast) {
            event.preventDefault();
            onNext?.();
        }
    };

    return (
        <nav className="doctrine-scripture-nav" aria-label="Passages in this study" onKeyDown={onKeyDown}>
            <button
                type="button"
                className="doctrine-scripture-nav-button"
                disabled={isFirst}
                onClick={onPrevious}
                aria-label={previousLabel ? `Previous passage: ${previousLabel}` : "Previous passage"}
            >
                <span aria-hidden="true">←</span> Previous
            </button>
            <label className="sr-only" htmlFor="doctrine-passage-select">
                Passage
            </label>
            <select
                id="doctrine-passage-select"
                className="doctrine-scripture-nav-select"
                value={passageId}
                onChange={(event) => onSelectPassage?.(event.target.value)}
            >
                {passages.map((passage, index) => (
                    <option key={passage.id} value={passage.id}>
                        {passage.label} ({index + 1} of {passageCount})
                    </option>
                ))}
            </select>
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
