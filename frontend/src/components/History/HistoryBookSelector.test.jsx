import { expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import HistoryBookSelector from "./HistoryBookSelector";

function mount() {
    return render(<MemoryRouter><HistoryBookSelector /></MemoryRouter>);
}

test("shows one canonical testament at a time without exposing unpublished event titles", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.getAllByRole("link")).toHaveLength(39);
    expect(screen.getByRole("link", { name: /Genesis/ })).toHaveAttribute("href", "/biblical-history/genesis");
    expect(screen.getAllByText("Upcoming")).toHaveLength(38);
    expect(screen.queryByText("Matthew")).toBeNull();
    await user.click(screen.getByRole("tab", { name: /New Testament/ }));
    expect(screen.getAllByRole("link")).toHaveLength(27);
    expect(screen.getByRole("link", { name: /Matthew/ })).toHaveAttribute("href", "/biblical-history/matthew");
    expect(screen.getByRole("link", { name: /Revelation/ })).toHaveAttribute("href", "/biblical-history/revelation");
    expect(screen.queryByText("Genesis")).toBeNull();
});

test("supports roving tab focus with arrow, Home, and End keys", async () => {
    const user = userEvent.setup();
    mount();
    const tablist = screen.getByRole("tablist", { name: "Choose a testament" });
    const oldTab = within(tablist).getByRole("tab", { name: /Old Testament/ });
    const newTab = within(tablist).getByRole("tab", { name: /New Testament/ });
    oldTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(newTab).toHaveFocus();
    expect(newTab).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(oldTab).toHaveFocus();
    await user.keyboard("{End}");
    expect(newTab).toHaveFocus();
});
