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
// The page does not import any research JSON itself: the runtime
// data feed is the build script (frontend/scripts/
// build-doctrine-content.js), which runs the adapter over the
// research tree and emits the published-only study into the
// gitignored frontend/src/generated/doctrine/ directory. The page
// reads that generated file through `getGeneratedTrinityStudy`
// (below) and passes the study to the workspace; while nothing is
// publishable it returns null and the workspace renders the
// demonstration study. This module never imports a research file, so
// no draft research can leak into the frontend bundle through it —
// only the generated, gate-checked study can reach the page.
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

// Build a research study from already-adapted published data — the
// adapter's `published` object, exactly as the build script emits it
// into frontend/src/generated/doctrine/. Returns null when the
// published set holds zero passages: the caller falls back to the
// demonstration study, never to a half-empty research view.
//
// This trusts the build-time gate: the generated file is written only
// by the build script, which runs the adapter's §10 gate, and the
// post-build gate check re-verifies the file against the current
// tree. Never call it with raw research records.
export function studyFromPublished(published) {
    if (!published || !Array.isArray(published.passages) || published.passages.length === 0) {
        return null;
    }
    return {
        source: "research",
        notice: RESEARCH_NOTICE,
        passages: published.passages,
        figures: published.figures,
        works: published.works,
        interpretations: published.interpretations,
        passageInterpretations: published.passageInterpretations,
        ...buildLookups(published),
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
    return {
        study: studyFromPublished(adapted.published),
        publishedPassageCount,
        issues: adapted.issues,
        excluded: adapted.excluded,
    };
}

// The generated study, read from the build-time output
// (frontend/src/generated/doctrine/trinity.json). The glob matches
// nothing when the directory is absent or empty — a fresh checkout,
// or a tree with nothing publishable yet — and this returns null, so
// the caller falls back to the demonstration study. This is the only
// reader of the generated directory; components never import a
// generated file directly.
function eagerValues(modules) {
    return Object.entries(modules).map(([key, mod]) => ({
        key,
        value: mod && mod.default !== undefined ? mod.default : mod,
    }));
}

export function getGeneratedTrinityStudy() {
    for (const { value } of eagerValues(
        import.meta.glob("../generated/doctrine/*.json", { eager: true }),
    )) {
        if (value && value.doctrine === "trinity" && value.published) {
            return studyFromPublished(value.published);
        }
    }
    return null;
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
