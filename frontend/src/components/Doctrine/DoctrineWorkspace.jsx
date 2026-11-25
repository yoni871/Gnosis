// The Trace the Doctrine study workspace: Scripture beside its
// historical interpretation, with the Church Fathers timeline at the
// bottom of the right column.
//
// Layout is a continuous parchment surface — 45% Scripture, 55%
// Historical Interpretation, one thin vertical divider between the
// columns, no floating cards — with the timeline strip at the bottom
// of the right column, beneath the interpretation panel.
//
// State lives here: the selected passage index, the selected
// interpretation, and the translation (KJV by default). Changing the
// passage re-derives that passage's interpretations and timeline and
// auto-selects the first available interpretation (or the empty state
// when none exists); Scripture stays visible while interpretations
// change. Selecting a timeline node updates the interpretation panel
// WITHOUT changing Scripture. A user-initiated passage change also
// moves focus to the Scripture heading (see passageFocusSignal),
// so keyboard and screen-reader users land on the new passage
// instead of staying on the navigation.
//
// The workspace renders from a study (`../../data/doctrineStudy.js`):
// by default the labeled demonstration study, or a research study
// built from adapter output when one is passed. A research study
// contains only records that passed the standards §10 publication
// gate, so nothing draft can render as published research — and when
// no research study is passed, the workspace renders exactly as it
// always has.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { demonstrationStudy } from "../../data/doctrineStudy";
import { getTranslations } from "../../services/bibleService";
import DoctrineInterpretationPanel from "./DoctrineInterpretationPanel";
import DoctrineScriptureNav from "./DoctrineScriptureNav";
import DoctrineScripturePanel from "./DoctrineScripturePanel";
import DoctrineTimeline from "./DoctrineTimeline";

// The reader's public-domain default, shared with the History
// Scripture companion.
const DOCTRINE_DEFAULT_TRANSLATION = "KJV";

export default function DoctrineWorkspace({ study }) {
    // The study this render uses: the one passed in, or the
    // demonstration study. The page passes nothing today, so the
    // workspace renders the labeled demonstration data.
    const activeStudy = study ?? demonstrationStudy;
    const { passages, getFigure, getInterpretationsForPassage, getWork } = activeStudy;
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedPassageIndex = passages.findIndex((item) => item.id === searchParams.get("passage"));
    const passageIndex = requestedPassageIndex >= 0 ? requestedPassageIndex : 0;
    const selectedInterpretationId = searchParams.get("interpretation");
    const [translation, setTranslation] = useState(DOCTRINE_DEFAULT_TRANSLATION);
    const [translations, setTranslations] = useState([]);
    // Counts user-initiated passage changes. The Scripture panel is
    // keyed by passage + translation, so it remounts on a change; it
    // focuses its heading only when this signal is non-zero, which
    // never happens on the initial mount — the page never steals
    // focus on load.
    const [passageFocusSignal, setPassageFocusSignal] = useState(0);

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
        const next = new URLSearchParams(searchParams);
        next.set("passage", passages[index].id);
        next.delete("interpretation");
        setSearchParams(next, { replace: true });
        setPassageFocusSignal((signal) => signal + 1);
    };

    const selectPassage = (id) => {
        const index = passages.findIndex((item) => item.id === id);
        if (index >= 0) goToPassage(index);
    };

    const selectInterpretation = (id) => {
        const next = new URLSearchParams(searchParams);
        next.set("passage", passage.id);
        next.set("interpretation", id);
        setSearchParams(next, { replace: true });
    };

    return (
        <div className="doctrine-workspace">
            <p className="doctrine-workspace-notice" role="note">
                {activeStudy.source === "demonstration" && (
                    <span className="doctrine-pill doctrine-workspace-notice-pill">Prototype</span>
                )}
                <span className="doctrine-workspace-notice-label">
                    {activeStudy.source === "demonstration" ? "Demonstration data" : "Verified research"}
                </span>
                <span>{activeStudy.notice}</span>
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
                        focusHeadingSignal={passageFocusSignal}
                    />
                    <DoctrineScriptureNav
                        passageIndex={passageIndex}
                        passageCount={passages.length}
                        previousLabel={passageIndex > 0 ? passages[passageIndex - 1].label : null}
                        nextLabel={passageIndex < passages.length - 1 ? passages[passageIndex + 1].label : null}
                        passages={passages}
                        passageId={passage.id}
                        onSelectPassage={selectPassage}
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
                        dataSource={activeStudy.source}
                    />
                    <DoctrineTimeline
                        entries={timelineEntries}
                        selectedId={selectedInterpretation?.id ?? null}
                        passage={passage}
                        onSelect={selectInterpretation}
                        dataSource={activeStudy.source}
                    />
                </div>
            </div>
        </div>
    );
}
