import { expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import HistoryBookSelector from "./HistoryBookSelector";

function mount() {
    return render(<MemoryRouter><HistoryBookSelector /></MemoryRouter>);
}

async function openDrawer(user) {
    await user.click(screen.getByRole("button", { name: /Browse Books/ }));
}

test("starts closed showing only the Browse Books button", () => {
    mount();
    expect(screen.getByRole("button", { name: /Browse Books/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("link", { name: /Genesis/ })).toBeNull();
    expect(screen.queryByText("Upcoming")).toBeNull();
});

test("opens a drawer with one canonical testament at a time, book names only", async () => {
    const user = userEvent.setup();
    mount();
    await openDrawer(user);
    expect(screen.getByRole("button", { name: /Close Books/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link")).toHaveLength(39);
    expect(screen.getByRole("link", { name: "Genesis" })).toHaveAttribute("href", "/biblical-history/genesis");
    expect(screen.queryByText("Upcoming")).toBeNull();
    expect(screen.queryByText(/event/)).toBeNull();
    expect(screen.queryByText("Matthew")).toBeNull();
    await user.click(screen.getByRole("tab", { name: /New Testament/ }));
    expect(screen.getAllByRole("link")).toHaveLength(27);
    expect(screen.getByRole("link", { name: "Matthew" })).toHaveAttribute("href", "/biblical-history/matthew");
    expect(screen.getByRole("link", { name: "Revelation" })).toHaveAttribute("href", "/biblical-history/revelation");
    expect(screen.queryByText("Genesis")).toBeNull();
});

test("closes the drawer from the button and from Escape", async () => {
    const user = userEvent.setup();
    mount();
    await openDrawer(user);
    expect(screen.getAllByRole("link")).toHaveLength(39);
    await user.click(screen.getByRole("button", { name: /Close Books/ }));
    expect(screen.queryByRole("link", { name: /Genesis/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Browse Books/ })).toHaveAttribute("aria-expanded", "false");
    await openDrawer(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("link", { name: /Genesis/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Browse Books/ })).toHaveFocus();
});

test("supports roving tab focus with arrow, Home, and End keys", async () => {
    const user = userEvent.setup();
    mount();
    await openDrawer(user);
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
