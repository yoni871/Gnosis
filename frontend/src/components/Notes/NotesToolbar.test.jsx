import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import NotesToolbar from "./NotesToolbar";

describe("NotesToolbar spacing controls", () => {
    test("shows the active spacing and reports a chosen line height", () => {
        const onFormat = vi.fn();
        render(<NotesToolbar onFormat={onFormat} active={{ lineHeight: "1", paragraphSpacing: "large" }} />);
        const lineSpacing = screen.getByLabelText("Line spacing");
        const paragraphSpacing = screen.getByLabelText("Paragraph spacing");
        expect(lineSpacing).toHaveValue("1");
        expect(paragraphSpacing).toHaveValue("large");
        fireEvent.change(lineSpacing, { target: { value: "2" } });
        expect(onFormat).toHaveBeenCalledWith({ kind: "lineHeight", value: "2" });
        fireEvent.change(paragraphSpacing, { target: { value: "none" } });
        expect(onFormat).toHaveBeenCalledWith({ kind: "paragraphSpacing", value: "none" });
    });

    test("defaults to Normal line spacing and Medium paragraph spacing when unset", () => {
        render(<NotesToolbar onFormat={vi.fn()} active={{}} />);
        expect(screen.getByLabelText("Line spacing")).toHaveValue("1.5");
        expect(screen.getByLabelText("Paragraph spacing")).toHaveValue("medium");
    });

    test("offers every line and paragraph spacing option", () => {
        render(<NotesToolbar onFormat={vi.fn()} active={{}} />);
        expect([...screen.getByLabelText("Line spacing").options].map((option) => option.value))
            .toEqual(["1", "1.15", "1.5", "2"]);
        expect([...screen.getByLabelText("Paragraph spacing").options].map((option) => option.value))
            .toEqual(["none", "small", "medium", "large"]);
    });

    test("existing formatting buttons still report string actions", () => {
        const onFormat = vi.fn();
        render(<NotesToolbar onFormat={onFormat} active={{ bold: true }} />);
        fireEvent.click(screen.getByRole("button", { name: "Bold" }));
        expect(onFormat).toHaveBeenCalledWith("bold");
        expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    });
});
