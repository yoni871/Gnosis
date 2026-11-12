import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import ExploreDropdown from "./ExploreDropdown";

function Location() {
    const location = useLocation();
    return <output aria-label="Current path">{location.pathname}</output>;
}
function mount(props = {}) {
    return render(<MemoryRouter><ExploreDropdown {...props} /><button>Outside</button><Location /></MemoryRouter>);
}

test("opens with Enter, supports natural Tab order, and restores trigger focus on Escape", async () => {
    const user = userEvent.setup();
    mount();
    const trigger = screen.getByRole("button", { name: "Explore" });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    const link = screen.getByRole("link", { name: /Bible & Commentary/ });
    expect(link).toHaveTextContent("Read Scripture alongside trusted biblical commentary.");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(trigger.getAttribute("aria-controls"))).toContainElement(link);
    await user.tab();
    expect(link).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link")).toBeNull();
});

test("closes on toggle, outside click, and focus leaving the disclosure", async () => {
    const user = userEvent.setup();
    mount();
    const trigger = screen.getByRole("button", { name: "Explore" });
    await user.click(trigger);
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("navigates to the reader and notifies its enclosing navigation", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mount({ onNavigate });
    await user.click(screen.getByRole("button", { name: "Explore" }));
    await user.click(screen.getByRole("link", { name: /Bible & Commentary/ }));
    expect(screen.getByLabelText("Current path")).toHaveTextContent("/bible/Genesis/1");
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link")).toBeNull();
});

test("navigates to Biblical History and notifies its enclosing navigation", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mount({ onNavigate });
    await user.click(screen.getByRole("button", { name: "Explore" }));
    await user.click(screen.getByRole("link", { name: /Biblical History/ }));
    expect(screen.getByLabelText("Current path")).toHaveTextContent("/biblical-history");
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link")).toBeNull();
});

test("accepts additional entries without changing disclosure behavior", async () => {
    const user = userEvent.setup();
    mount({ items: [{ title: "Synthetic resource", description: "A future test-only entry.", to: "/example" }] });
    await user.click(screen.getByRole("button", { name: "Explore" }));
    expect(screen.getByRole("link", { name: /Synthetic resource/ })).toHaveAttribute("href", "/example");
    expect(screen.queryByText("Bible & Commentary")).toBeNull();
});
