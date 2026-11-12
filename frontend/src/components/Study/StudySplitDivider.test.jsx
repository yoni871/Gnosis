import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import StudySplitDivider from "./StudySplitDivider";
import {
    clampStudySplit,
    DEFAULT_STUDY_SPLIT,
    DIVIDER_WIDTH,
    MIN_COMMENTARY_WIDTH,
    MIN_SCRIPTURE_WIDTH
} from "./studySplit";

describe("adjustable study split", () => {
    test("keyboard arrows resize and Home resets", async () => {
        const onChange = vi.fn();
        const onReset = vi.fn();
        render(<StudySplitDivider value={60} onChange={onChange} onReset={onReset} />);
        const divider = screen.getByRole("separator");
        divider.focus();
        await userEvent.keyboard("{ArrowLeft}{ArrowRight}{Home}");
        expect(onChange).toHaveBeenNthCalledWith(1, 58, true);
        expect(onChange).toHaveBeenNthCalledWith(2, 62, true);
        expect(onReset).toHaveBeenCalledWith(DEFAULT_STUDY_SPLIT);
    });

    test("announces the panel proportions", () => {
        render(<StudySplitDivider value={62} onChange={() => {}} onReset={() => {}} />);
        expect(screen.getByRole("separator")).toHaveAttribute(
            "aria-valuetext",
            "62% Scripture, 38% commentary"
        );
    });

    test("clamps both panels to their minimum widths", () => {
        expect(clampStudySplit(10, 1000)).toBeGreaterThanOrEqual(32);
        expect(clampStudySplit(95, 1000)).toBeLessThanOrEqual(70);
    });

    test("clamps to the exact minima accounting for the divider width", () => {
        // At 1000px the Scripture minimum is exactly 32% and the commentary
        // minimum is exactly 69.2% (1000 - 300 - 8 = 692px of Scripture).
        expect(clampStudySplit(10, 1000)).toBeCloseTo(32, 10);
        expect(clampStudySplit(95, 1000)).toBeCloseTo(69.2, 10);
        // At any desktop width the clamped split leaves both panels at or
        // above their minima (0.001px tolerance for float arithmetic).
        for (const width of [800, 1024, 1440, 1920]) {
            for (const input of [5, 95]) {
                const clamped = clampStudySplit(input, width);
                expect((clamped / 100) * width).toBeGreaterThanOrEqual(
                    MIN_SCRIPTURE_WIDTH - 0.001
                );
                expect(
                    width - (clamped / 100) * width - DIVIDER_WIDTH
                ).toBeGreaterThanOrEqual(MIN_COMMENTARY_WIDTH - 0.001);
            }
        }
    });
});
