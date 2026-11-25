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
    expect(screen.getAllByRole("link")).toHaveLength(11);
    expect(screen.getByRole("link", { name: "Genesis" })).toHaveAttribute("href", "/biblical-history/creation");
    expect(screen.getAllByText("Coming Soon")).toHaveLength(28);
    const exodusChip = document.querySelector('[data-history-book="exodus"]');
    expect(exodusChip).not.toBeNull();
    expect(exodusChip).toHaveAttribute("href", "/biblical-history/oppression-and-moses-early-life");
    expect(document.querySelector('[data-history-book="leviticus"]')).toHaveAttribute("href", "/biblical-history/leviticus-sacrificial-system");
    expect(document.querySelector('[data-history-book="numbers"]')).toHaveAttribute("href", "/biblical-history/numbers-israel-organized-at-sinai");
    expect(document.querySelector('[data-history-book="deuteronomy"]')).toHaveAttribute("href", "/biblical-history/deuteronomy-wilderness-journey");
    expect(document.querySelector('[data-history-book="joshua"]')).toHaveAttribute("href", "/biblical-history/joshua-commission-and-rahab");
    expect(document.querySelector('[data-history-book="judges"]')).toHaveAttribute("href", "/biblical-history/judges-israels-incomplete-conquest");
    expect(document.querySelector('[data-history-book="ruth"]')).toHaveAttribute("href", "/biblical-history/ruth-naomi-and-ruth-return-to-bethlehem");
    expect(document.querySelector('[data-history-book="1-samuel"]')).toHaveAttribute("href", "/biblical-history/1-samuel-birth-and-rise-of-samuel");
    expect(document.querySelector('[data-history-book="2-samuel"]')).toHaveAttribute("href", "/biblical-history/2-samuel-death-of-saul-and-civil-war-for-the-throne");
    expect(document.querySelector('[data-history-book="1-kings"]')).toHaveAttribute("href", "/biblical-history/1-kings-solomons-succession-and-the-securing-of-the-throne");
    expect(screen.queryByText("Upcoming")).toBeNull();
    expect(screen.queryByText(/4 categories · 10 events/)).toBeNull();
    expect(screen.getByText(/Scroll for more books/)).toBeInTheDocument();
    expect(screen.queryByText("Matthew")).toBeNull();
    await user.click(screen.getByRole("tab", { name: /New Testament/ }));
    // No New Testament book has published events yet: no links at all,
    // 27 Coming Soon chips.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getAllByText("Coming Soon")).toHaveLength(27);
    expect(screen.queryByRole("link", { name: "Matthew" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Revelation" })).toBeNull();
    expect(screen.queryByText("Genesis")).toBeNull();
});

test("starts on the testament given by initialTestament", () => {
    mount({ initialTestament: "NT" });
    expect(screen.getByRole("tab", { name: /New Testament/ })).toHaveAttribute("aria-selected", "true");
    // Matthew has no published events, so it is a Coming Soon chip,
    // not a link.
    expect(screen.queryByRole("link", { name: "Matthew" })).toBeNull();
    expect(document.querySelector('[data-history-book="matthew"]')).toHaveTextContent("Coming Soon");
    expect(screen.queryByText("Genesis")).toBeNull();
});

test("shows both counts on a book's chip when it has categories, and no counts otherwise", () => {
    const books = [
        { id: "genesis", title: "Genesis", testament: "OT", chapterCount: 50, eventCount: 8, hasEvents: true, categoryCount: 2, hasCategories: true },
        { id: "exodus", title: "Exodus", testament: "OT", chapterCount: 40, eventCount: 0, hasEvents: false, categoryCount: 0, hasCategories: false },
    ];
    mount({ books });
    // Genesis links to its first published event and shows both counts.
    expect(screen.getByRole("link", { name: "Genesis" })).toHaveAttribute("href", "/biblical-history/creation");
    // Exodus has no published content: still a Coming Soon chip, and
    // the counts label never appears on it.
    expect(document.querySelector('[data-history-book="exodus"]')).toHaveTextContent("Coming Soon");
    expect(screen.queryByText(/categor/)).toBeNull();
});

test("uses singular count labels for one category and one event", () => {
    const books = [
        { id: "genesis", title: "Genesis", testament: "OT", chapterCount: 50, eventCount: 1, hasEvents: true, categoryCount: 1, hasCategories: true },
    ];
    mount({ books });
    expect(screen.getByRole("link", { name: "Genesis" })).toHaveAttribute("href", "/biblical-history/creation");
});

test("a category-only book is a navigable landing-page link", () => {
    mount({ books: [{ id: "exodus", title: "Exodus", testament: "OT", eventCount: 0, hasEvents: false, categoryCount: 7, hasCategories: true }] });
    expect(screen.getByRole("link", { name: "Exodus" })).toHaveAttribute("href", "/biblical-history/oppression-and-moses-early-life");
    expect(screen.queryByText("Coming Soon")).toBeNull();
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
