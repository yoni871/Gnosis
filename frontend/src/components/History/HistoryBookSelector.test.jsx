import { expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import HistoryBookSelector from "./HistoryBookSelector";

function mount(props = {}) {
    return render(<MemoryRouter><HistoryBookSelector open {...props} /></MemoryRouter>);
}

test("renders nothing while closed", () => {
    render(<MemoryRouter><HistoryBookSelector open={false} /></MemoryRouter>);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("link", { name: /Genesis/ })).toBeNull();
});

test("shows one canonical testament at a time, book names only, with a scroll hint", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.getAllByRole("link")).toHaveLength(39);
    expect(screen.getByRole("link", { name: "Genesis" })).toHaveAttribute("href", "/biblical-history/genesis");
    expect(screen.queryByText("Upcoming")).toBeNull();
    expect(screen.queryByText(/event/)).toBeNull();
    expect(screen.getByText(/Scroll for more books/)).toBeInTheDocument();
    expect(screen.queryByText("Matthew")).toBeNull();
    await user.click(screen.getByRole("tab", { name: /New Testament/ }));
    expect(screen.getAllByRole("link")).toHaveLength(27);
    expect(screen.getByRole("link", { name: "Matthew" })).toHaveAttribute("href", "/biblical-history/matthew");
    expect(screen.getByRole("link", { name: "Revelation" })).toHaveAttribute("href", "/biblical-history/revelation");
    expect(screen.queryByText("Genesis")).toBeNull();
});

test("calls onClose on Escape from inside the drawer", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mount({ onClose });
    screen.getByRole("tab", { name: /Old Testament/ }).focus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
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
