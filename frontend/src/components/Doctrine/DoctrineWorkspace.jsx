// The Trace the Doctrine study workspace: Scripture beside its
// historical interpretation, with a full-width timeline beneath.
//
// Layout is a continuous parchment surface — 40% Scripture, 60%
// Historical Interpretation, one thin vertical divider between the
// columns, no floating cards — with the timeline strip beneath both
// columns, never inside the right column.
//
// State lives here: the selected passage index, the selected
// interpretation, and the translation (KJV by default). Changing the
// passage re-derives that passage's interpretations and timeline and
// auto-selects the first available interpretation (or the empty state
// when none exists); Scripture stays visible while interpretations
// change. Selecting a timeline node updates the interpretation panel
// WITHOUT changing Scripture.
import { useEffect, useState } from "react";
import {
    DEMONSTRATION_NOTICE,
    getFigure,
    getInterpretationsForPassage,
    getWork,
    passages,
} from "../../data/doctrineStudies";
import { getTranslations } from "../../services/bibleService";
import DoctrineInterpretationPanel from "./DoctrineInterpretationPanel";
import DoctrineScriptureNav from "./DoctrineScriptureNav";
import DoctrineScripturePanel from "./DoctrineScripturePanel";
import DoctrineTimeline from "./DoctrineTimeline";

// The reader's public-domain default, shared with the History
// Scripture companion.
const DOCTRINE_DEFAULT_TRANSLATION = "KJV";

export default function DoctrineWorkspace() {
    const [passageIndex, setPassageIndex] = useState(0);
    const [selectedInterpretationId, setSelectedInterpretationId] = useState(null);
    const [translation, setTranslation] = useState(DOCTRINE_DEFAULT_TRANSLATION);
    const [translations, setTranslations] = useState([]);

    // The translation catalog (GET /api/translations, the same call the
    // reader uses). A failed catalog load is not fatal: the selector
    // falls back to KJV alone and the passage still loads.
    useEffect(() => {
        let cancelled = false;
        getTranslations()
            .then((list) => {
                if (!cancelled) setTranslations(Array.isArray(list) ? list : []);
            })
            .catch(() => {
                if (!cancelled) setTranslations([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const passage = passages[passageIndex];
    const interpretations = getInterpretationsForPassage(passage.id);
    // Auto-select the first available interpretation for the passage;
    // a passage with no entries yields the empty state. A selection
    // from another passage never leaks across: if the stored id is not
    // among this passage's interpretations, the first one wins.
    const selectedInterpretation =
        interpretations.find((entry) => entry.id === selectedInterpretationId) ??
        interpretations[0] ??
        null;
    const selectedFigure = selectedInterpretation
        ? getFigure(selectedInterpretation.figureId)
        : null;
    const selectedWork = selectedInterpretation
        ? getWork(selectedInterpretation.workId)
        : null;
    const timelineEntries = interpretations.map((interpretation) => ({
        interpretation,
        figure: getFigure(interpretation.figureId),
        work: getWork(interpretation.workId),
    }));

    const goToPassage = (index) => {
        if (index < 0 || index >= passages.length) return;
        setPassageIndex(index);
        setSelectedInterpretationId(null);
    };

    return (
        <div className="doctrine-workspace">
            <p className="doctrine-workspace-notice" role="note">
                <span className="doctrine-pill doctrine-workspace-notice-pill">Prototype</span>
                <span className="doctrine-workspace-notice-label">Demonstration data</span>
                <span>{DEMONSTRATION_NOTICE}</span>
            </p>
            <div className="doctrine-workspace-grid">
                <div className="doctrine-workspace-scripture">
                    {/* Keyed by passage + translation: a change remounts
                        the panel, resetting its loading state — the same
                        pattern as the History Scripture companion. */}
                    <DoctrineScripturePanel
                        key={`${passage.id}:${translation}`}
                        passage={passage}
                        translation={translation}
                        translations={translations}
                        onTranslationChange={setTranslation}
                    />
                    <DoctrineScriptureNav
                        passageIndex={passageIndex}
                        passageCount={passages.length}
                        previousLabel={passageIndex > 0 ? passages[passageIndex - 1].label : null}
                        nextLabel={passageIndex < passages.length - 1 ? passages[passageIndex + 1].label : null}
                        onPrevious={() => goToPassage(passageIndex - 1)}
                        onNext={() => goToPassage(passageIndex + 1)}
                    />
                </div>
                <div className="doctrine-workspace-interpretation">
                    <DoctrineInterpretationPanel
                        interpretation={selectedInterpretation}
                        figure={selectedFigure}
                        work={selectedWork}
                        passage={passage}
                    />
                </div>
            </div>
            <DoctrineTimeline
                entries={timelineEntries}
                selectedId={selectedInterpretation?.id ?? null}
                passage={passage}
                onSelect={setSelectedInterpretationId}
            />
        </div>
    );
}
