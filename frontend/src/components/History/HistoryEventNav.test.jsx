import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HistoryEventNav from "./HistoryEventNav";

function stubMatchMedia(matches) {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query) => ({
        matches,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })));
}

describe("HistoryEventNav — desktop (compact rail)", () => {
    it("renders a vertical tablist with roving tabindex", () => {
        const onSelect = vi.fn();
        render(<HistoryEventNav activeId="overview" onSelect={onSelect} />);
        const tablist = screen.getByRole("tablist", { name: "Event sections" });
        expect(tablist).toHaveAttribute("aria-orientation", "vertical");
        const tabs = screen.getAllByRole("tab");
        expect(tabs.map((tab) => tab.textContent)).toEqual(["Story", "Context", "Connections", "Sources"]);
        expect(tabs[0]).toHaveAttribute("tabindex", "0");
        expect(tabs[1]).toHaveAttribute("tabindex", "-1");
        expect(tabs[2]).toHaveAttribute("tabindex", "-1");
        expect(tabs[3]).toHaveAttribute("tabindex", "-1");
        expect(tabs[0]).toHaveAttribute("aria-selected", "true");
        expect(tabs[0]).toHaveAttribute("aria-controls", "history-section-overview");
        expect(tabs[3]).toHaveAttribute("aria-controls", "history-section-sources");
    });

    it("moves with Up/Down arrows and Home/End", async () => {
        const user = userEvent.setup();
        let active = "overview";
        const onSelect = vi.fn((id) => { active = id; });
        const { rerender } = render(<HistoryEventNav activeId={active} onSelect={onSelect} />);
        const tabs = screen.getAllByRole("tab");
        tabs[0].focus();
        await user.keyboard("{ArrowDown}");
        expect(onSelect).toHaveBeenCalledWith("ancient-world");
        rerender(<HistoryEventNav activeId="ancient-world" onSelect={onSelect} />);
        expect(document.activeElement).toBe(screen.getAllByRole("tab")[1]);
        await user.keyboard("{ArrowDown}");
        expect(onSelect).toHaveBeenCalledWith("scripture");
        await user.keyboard("{ArrowUp}");
        expect(onSelect).toHaveBeenCalledWith("ancient-world");
        await user.keyboard("{End}");
        expect(onSelect).toHaveBeenCalledWith("sources");
        await user.keyboard("{Home}");
        expect(onSelect).toHaveBeenCalledWith("overview");
    });

    it("selects on click", async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        render(<HistoryEventNav activeId="overview" onSelect={onSelect} />);
        await user.click(screen.getByRole("tab", { name: "Connections" }));
        expect(onSelect).toHaveBeenCalledWith("scripture");
    });
});

describe("HistoryEventNav — mobile (compact horizontal tabs)", () => {
    it("renders a horizontal tablist and moves with Left/Right arrows", async () => {
        stubMatchMedia(true);
        const user = userEvent.setup();
        let active = "overview";
        const onSelect = vi.fn((id) => { active = id; });
        const { rerender } = render(<HistoryEventNav activeId={active} onSelect={onSelect} />);
        expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "horizontal");
        const tabs = screen.getAllByRole("tab");
        tabs[0].focus();
        await user.keyboard("{ArrowRight}");
        expect(onSelect).toHaveBeenCalledWith("ancient-world");
        rerender(<HistoryEventNav activeId="ancient-world" onSelect={onSelect} />);
        await user.keyboard("{ArrowLeft}");
        expect(onSelect).toHaveBeenCalledWith("overview");
    });
});
