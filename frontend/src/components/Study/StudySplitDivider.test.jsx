import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import StudySplitDivider from "./StudySplitDivider";
import { clampStudySplit, DEFAULT_STUDY_SPLIT } from "./studySplit";

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
});
