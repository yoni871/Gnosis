// The Doctrine workspace's data source: one study object, two origins.
//
// A study is everything the workspace needs to render, in one shape:
// passages, figures, works, interpretations, the passage-to-
// interpretation map, and the lookup helpers — the same interface
// `./doctrineStudies.js` already exposes for the demonstration data.
//
// There are two origins, and the workspace must never confuse them:
//
// - `demonstrationStudy` — the labeled demonstration data the workspace
//   renders today. Nothing about it changes here.
// - A research study, built by `buildStudyFromResearch` from a research
//   bundle through the adapter (`./researchAdapter.js`). It contains
//   ONLY records that pass the standards §10 publication gate, so
//   nothing draft, unverified, or unapproved can reach the workspace
//   through it. When the bundle yields zero publishable passages —
//   which is the state of the research today, and of the Phase 5
//   corrected tree — there is no research study at all, and the caller
//   falls back to the demonstration study.
//
// The page does not feed a research bundle yet: the runtime data feed
// (how approved research reaches the page) is a Phase 6 step that
// waits for the Phase 5 PR to merge and for editorial approval. This
// module is the wiring that step will use — `resolveStudy(bundle)`
// returns the research study when one exists and the demonstration
// study otherwise — and it deliberately does NOT import any research
// JSON itself, so no draft research can leak into the frontend bundle
// through this module.
import {
    DEMONSTRATION_NOTICE,
    getFigure as getDemoFigure,
    getInterpretation as getDemoInterpretation,
    getInterpretationsForPassage as getDemoInterpretationsForPassage,
    getPassage as getDemoPassage,
    getWork as getDemoWork,
    figures as demoFigures,
    interpretations as demoInterpretations,
    passageInterpretations as demoPassageInterpretations,
    passages as demoPassages,
    works as demoWorks,
} from "./doctrineStudies";
import { adaptResearchData } from "./researchAdapter";

export const RESEARCH_NOTICE =
    "Verified research — quotations, titles, and dates checked against primary sources and editorially approved.";

// The study the workspace renders today: labeled demonstration data,
// unchanged.
export const demonstrationStudy = {
    source: "demonstration",
    notice: DEMONSTRATION_NOTICE,
    passages: demoPassages,
    figures: demoFigures,
    works: demoWorks,
    interpretations: demoInterpretations,
    passageInterpretations: demoPassageInterpretations,
    getPassage: getDemoPassage,
    getFigure: getDemoFigure,
    getWork: getDemoWork,
    getInterpretation: getDemoInterpretation,
    getInterpretationsForPassage: getDemoInterpretationsForPassage,
};

function buildLookups({ passages, figures, works, interpretations, passageInterpretations }) {
    const passageById = new Map(passages.map((passage) => [passage.id, passage]));
    const figureById = new Map(figures.map((figure) => [figure.id, figure]));
    const workById = new Map(works.map((work) => [work.id, work]));
    const interpretationById = new Map(interpretations.map((interpretation) => [interpretation.id, interpretation]));
    return {
        getPassage: (id) => passageById.get(id) ?? null,
        getFigure: (id) => figureById.get(id) ?? null,
        getWork: (id) => workById.get(id) ?? null,
        getInterpretation: (id) => interpretationById.get(id) ?? null,
        // Interpretations for a passage, in the adapter's display order.
        // Unknown passage ids and passages with no entries both return [].
        getInterpretationsForPassage: (passageId) => {
            const ids = passageInterpretations[passageId] ?? [];
            return ids
                .map((id) => interpretationById.get(id))
                .filter(Boolean)
                .sort((a, b) => a.order - b.order);
        },
    };
}

// Build a research study from a research bundle, through the adapter.
//
// Returns `{ study, publishedPassageCount, issues, excluded }`. `study`
// is null when the bundle yields zero publishable passages — the
// caller must then fall back to the demonstration study, never to a
// half-empty research view. `issues` and `excluded` are the adapter's
// own diagnostics, passed through unchanged.
export function buildStudyFromResearch(bundle) {
    const adapted = adaptResearchData(bundle);
    const publishedPassageCount = adapted.published.passages.length;
    if (publishedPassageCount === 0) {
        return { study: null, publishedPassageCount, issues: adapted.issues, excluded: adapted.excluded };
    }
    const published = adapted.published;
    return {
        study: {
            source: "research",
            notice: RESEARCH_NOTICE,
            passages: published.passages,
            figures: published.figures,
            works: published.works,
            interpretations: published.interpretations,
            passageInterpretations: published.passageInterpretations,
            ...buildLookups(published),
        },
        publishedPassageCount,
        issues: adapted.issues,
        excluded: adapted.excluded,
    };
}

// Resolve the study the workspace should render for a research bundle:
// the research study when the bundle yields at least one publishable
// passage, otherwise the demonstration study. The demonstration study
// is the safe default — a bundle with nothing publishable renders
// exactly as the workspace does today.
export function resolveStudy(bundle) {
    const built = buildStudyFromResearch(bundle);
    if (built.study) {
        return built;
    }
    return {
        study: demonstrationStudy,
        publishedPassageCount: 0,
        issues: built.issues,
        excluded: built.excluded,
    };
}
