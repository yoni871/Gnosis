// Data-integrity tests for the Trace the Doctrine study data.
//
// The binding rule: the theologian entries are DEMONSTRATION data.
// These tests pin that down — every interpretation is flagged
// demonstration + placeholder, every quotation/title/date is null or
// pending, every reference resolves, and no entry can claim a verified
// date without a verified label.
import { describe, expect, it } from "vitest";
import {
    DATE_PENDING_LABEL,
    EXPLANATION_PENDING_LABEL,
    QUOTATION_PENDING_LABEL,
    TITLE_PENDING_LABEL,
    figures,
    getFigure,
    getInterpretation,
    getInterpretationsForPassage,
    getPassage,
    getWork,
    getWorkDateLabel,
    getWorkTitleLabel,
    interpretations,
    passageInterpretations,
    passages,
    works,
} from "./doctrineStudies";

describe("doctrineStudies data", () => {
    it("lists the four Trinity passages in order, starting with Genesis 1:26", () => {
        expect(passages.map((passage) => passage.id)).toEqual([
            "gen-1-26",
            "john-1-1",
            "matt-28-19",
            "2cor-13-14",
        ]);
        expect(passages.map((passage) => passage.label)).toEqual([
            "Genesis 1:26",
            "John 1:1–3",
            "Matthew 28:19",
            "2 Corinthians 13:14",
        ]);
        expect(getPassage("gen-1-26")).toEqual({
            id: "gen-1-26",
            book: "Genesis",
            startChapter: 1,
            startVerse: 26,
            endChapter: 1,
            endVerse: 26,
            label: "Genesis 1:26",
        });
        expect(getPassage("no-such-passage")).toBeNull();
    });

    it("names the five historical figures and nothing else", () => {
        expect(figures.map((figure) => figure.name)).toEqual([
            "Justin Martyr",
            "Irenaeus",
            "Tertullian",
            "Athanasius",
            "Augustine",
        ]);
        expect(getFigure("augustine")?.name).toBe("Augustine");
        expect(getFigure("no-such-figure")).toBeNull();
    });

    it("marks every interpretation as demonstration + placeholder with no verified content", () => {
        expect(interpretations).toHaveLength(5);
        for (const interpretation of interpretations) {
            expect(interpretation.placeholder).toBe(true);
            expect(interpretation.demonstration).toBe(true);
            // No quotation, explanation, or citation is asserted anywhere.
            expect(interpretation.quotation).toBeNull();
            expect(interpretation.explanation).toBeNull();
            expect(interpretation.citation).toBeNull();
        }
        // The provisional order is explicit and unique within the passage.
        const orders = interpretations.map((interpretation) => interpretation.order);
        expect([...orders].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    });

    it("gives Genesis 1:26 the five demonstration entries and empty arrays elsewhere", () => {
        expect(getInterpretationsForPassage("gen-1-26")).toHaveLength(5);
        expect(getInterpretationsForPassage("gen-1-26").map((entry) => entry.figureId)).toEqual([
            "justin-martyr",
            "irenaeus",
            "tertullian",
            "athanasius",
            "augustine",
        ]);
        for (const passageId of ["john-1-1", "matt-28-19", "2cor-13-14"]) {
            expect(passageInterpretations[passageId]).toEqual([]);
            expect(getInterpretationsForPassage(passageId)).toEqual([]);
        }
        expect(getInterpretationsForPassage("no-such-passage")).toEqual([]);
    });

    it("resolves every interpretation to an existing passage, figure, and work", () => {
        for (const interpretation of interpretations) {
            expect(getPassage(interpretation.passageId)).not.toBeNull();
            expect(getFigure(interpretation.figureId)).not.toBeNull();
            const work = getWork(interpretation.workId);
            expect(work).not.toBeNull();
            // The work belongs to the same figure the interpretation names.
            expect(work.figureId).toBe(interpretation.figureId);
        }
        expect(getInterpretation("gen-1-26-tertullian")?.figureId).toBe("tertullian");
        expect(getInterpretation("no-such-interpretation")).toBeNull();
        expect(getWork("no-such-work")).toBeNull();
    });

    it("keeps every work's title and writing date pending — nothing claims a verified date", () => {
        expect(works).toHaveLength(5);
        for (const work of works) {
            expect(work.title).toBeNull();
            expect(work.placeholder).toBe(true);
            expect(work.demonstration).toBe(true);
            expect(work.date.status).toBe("pending");
            expect(work.date.label).toBe(DATE_PENDING_LABEL);
            expect(getWorkDateLabel(work)).toBe(DATE_PENDING_LABEL);
            expect(getWorkTitleLabel(work)).toBe(TITLE_PENDING_LABEL);
            // A pending label never contains a year.
            expect(work.date.label).not.toMatch(/\b\d{3,4}\b/);
        }
    });

    it("labels a verified date only with its verified label", () => {
        const verified = { date: { status: "verified", label: "c. AD 180", certainty: "approximate" } };
        expect(getWorkDateLabel(verified)).toBe("c. AD 180");
        expect(getWorkDateLabel(null)).toBe(DATE_PENDING_LABEL);
        expect(getWorkDateLabel({})).toBe(DATE_PENDING_LABEL);
        expect(getWorkTitleLabel({ title: "A Verified Title" })).toBe("A Verified Title");
    });

    it("never presents invented content: no pending label is a quotation, title, or date", () => {
        for (const label of [
            DATE_PENDING_LABEL,
            TITLE_PENDING_LABEL,
            QUOTATION_PENDING_LABEL,
            EXPLANATION_PENDING_LABEL,
        ]) {
            expect(label.toLowerCase()).toContain("pending verification");
        }
        const serialized = JSON.stringify({ interpretations, works });
        // No year-like string anywhere in the demonstration data.
        expect(serialized).not.toMatch(/AD \d|c\. \d{3,4}/);
    });
});
