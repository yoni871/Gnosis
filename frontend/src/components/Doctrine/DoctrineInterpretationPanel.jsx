// The Historical Interpretation column of the Doctrine workspace.
//
// DEMONSTRATION data only: the theologian entries shown here are
// placeholders pending research. The panel says so wherever an entry
// renders — a visible "Demonstration data" label, and every quotation,
// source title, and writing date labeled "pending verification". The
// theologian NAMES are historical figures; the LINK between a
// theologian and the passage is what is unverified. No quotation,
// title, or date is ever invented to fill the space: pending content
// renders as an explicit placeholder, never as a fact.
import { useState } from "react";
import {
    DEMONSTRATION_NOTICE,
    EXPLANATION_PENDING_LABEL,
    QUOTATION_PENDING_LABEL,
    getWorkDateLabel,
    getWorkTitleLabel,
} from "../../data/doctrineStudies";

export default function DoctrineInterpretationPanel({ interpretation, figure, work, passage }) {
    const [explanationOpen, setExplanationOpen] = useState(false);
    const [sourceDetailsOpen, setSourceDetailsOpen] = useState(false);

    // A passage with no entries yet: an honest empty state, not
    // placeholder theologians. Entries are added only after research
    // verifies them.
    if (!interpretation || !figure) {
        return (
            <section className="doctrine-interpretation-panel" aria-label="Historical interpretation">
                <header className="doctrine-panel-header">
                    <p className="doctrine-panel-eyebrow">Historical Interpretation</p>
                    <p className="doctrine-demonstration-badge">Demonstration data</p>
                </header>
                <p className="doctrine-interpretation-empty" role="status">
                    No historical interpretations have been added for {passage?.label ?? "this passage"} yet.
                </p>
                <p className="doctrine-interpretation-empty-note">
                    Entries are added only after research verifies the link between a
                    theologian and this passage. {DEMONSTRATION_NOTICE}
                </p>
            </section>
        );
    }

    const quotation = interpretation.quotation;
    const explanation = interpretation.explanation;

    return (
        <section
            className="doctrine-interpretation-panel"
            aria-label={`Historical interpretation: ${figure.name} on ${passage?.label ?? ""}`}
        >
            <header className="doctrine-panel-header">
                <p className="doctrine-panel-eyebrow">Historical Interpretation</p>
                <p className="doctrine-demonstration-badge">Demonstration data</p>
            </header>
            <p className="doctrine-demonstration-note">{DEMONSTRATION_NOTICE}</p>
            <h2 className="doctrine-interpretation-name">{figure.name}</h2>
            <p className="doctrine-interpretation-source">
                <span className="doctrine-interpretation-source-title">{getWorkTitleLabel(work)}</span>
                <span aria-hidden="true"> · </span>
                <span className="doctrine-interpretation-source-date">{getWorkDateLabel(work)}</span>
            </p>
            <div className="doctrine-interpretation-quotation" aria-label="Quotation">
                {quotation ? (
                    <blockquote>
                        <p>{quotation}</p>
                        {interpretation.citation && <cite>{interpretation.citation}</cite>}
                    </blockquote>
                ) : (
                    <p className="doctrine-placeholder" role="status">
                        {QUOTATION_PENDING_LABEL} — no quotation has been verified for this entry yet.
                    </p>
                )}
            </div>
            <div className="doctrine-interpretation-explanation">
                <button
                    type="button"
                    className="doctrine-interpretation-toggle"
                    aria-expanded={explanationOpen}
                    aria-controls="doctrine-explanation-body"
                    onClick={() => setExplanationOpen((open) => !open)}
                >
                    {explanationOpen ? "Hide explanation" : "Show explanation"}
                </button>
                {explanationOpen && (
                    <div id="doctrine-explanation-body" className="doctrine-interpretation-explanation-body">
                        {explanation ? (
                            <p>{explanation}</p>
                        ) : (
                            <p className="doctrine-placeholder" role="status">
                                {EXPLANATION_PENDING_LABEL} — no explanation has been verified for this entry yet.
                            </p>
                        )}
                    </div>
                )}
            </div>
            <div className="doctrine-interpretation-source-details">
                <button
                    type="button"
                    className="doctrine-interpretation-toggle"
                    aria-expanded={sourceDetailsOpen}
                    aria-controls="doctrine-source-details-body"
                    onClick={() => setSourceDetailsOpen((open) => !open)}
                >
                    {sourceDetailsOpen ? "Hide source details" : "Source details"}
                </button>
                {sourceDetailsOpen && (
                    <div id="doctrine-source-details-body" className="doctrine-interpretation-source-details-body">
                        <dl>
                            <div>
                                <dt>Theologian</dt>
                                <dd>{figure.name}</dd>
                            </div>
                            <div>
                                <dt>Source title</dt>
                                <dd>{getWorkTitleLabel(work)} — pending verification</dd>
                            </div>
                            <div>
                                <dt>Written</dt>
                                <dd>{getWorkDateLabel(work)} — pending verification</dd>
                            </div>
                            <div>
                                <dt>Status</dt>
                                <dd>Demonstration data — pending verification</dd>
                            </div>
                        </dl>
                    </div>
                )}
            </div>
        </section>
    );
}
