// Trinity workspace tests: passage switching, timeline selection
// (click + keyboard), empty states, verified-research labeling, prev/next
// ends, translation switching, the 45/55 layout structure, the
// passage jump, focus management, quotation expansion, and timeline
// scroll behavior (UI PR 2).
//
// Scripture text here is synthetic ("Genesis 1 verse 26.") — the
// tests assert trimming, loading, and state, never real KJV wording.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import DoctrineInterpretationPanel from "../components/Doctrine/DoctrineInterpretationPanel";
import { getFigure, getWork, passages } from "../data/doctrineStudies";
import TraceTheDoctrineTrinityPage from "./TraceTheDoctrineTrinityPage";

const { getBibleChapter, getTranslations } = vi.hoisted(() => ({
    getBibleChapter: vi.fn(),
    getTranslations: vi.fn(),
}));

vi.mock("../services/bibleService", () => ({ getBibleChapter, getTranslations }));

const TRANSLATIONS = [
    { abbreviation: "KJV", name: "King James Version" },
    { abbreviation: "ESV", name: "English Standard Version" },
];

function chapterVerses(book, chapter, count) {
    return Array.from({ length: count }, (_, index) => ({
        verse_number: index + 1,
        text: `${book} ${chapter} verse ${index + 1}.`,
    }));
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/trace-the-doctrine/trinity"]}>
            <ThemeProvider>
                <AuthContext.Provider value={{ user: null, isAuthLoading: false, logout: vi.fn() }}>
                    <TraceTheDoctrineTrinityPage />
                </AuthContext.Provider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    getTranslations.mockResolvedValue(TRANSLATIONS);
    getBibleChapter.mockImplementation(async (book, chapter) => {
        if (book === "Genesis") {
            if (chapter === 1) return chapterVerses("Genesis", 1, 27);
            if (chapter === 18) return chapterVerses("Genesis", 18, 15);
            if (chapter === 19) return chapterVerses("Genesis", 19, 24);
        }
        if (book === "John") {
            if (chapter === 1) return chapterVerses("John", 1, 5);
            if (chapter === 20) return chapterVerses("John", 20, 28);
        }
        if (book === "Matthew") return chapterVerses("Matthew", 28, 20);
        if (book === "2 Corinthians") return chapterVerses("2 Corinthians", 13, 14);
        if (book === "Psalms") {
            if (chapter === 2) return chapterVerses("Psalms", 2, 7);
            if (chapter === 45) return chapterVerses("Psalms", 45, 7);
            if (chapter === 110) return chapterVerses("Psalms", 110, 1);
        }
        if (book === "Isaiah") return chapterVerses("Isaiah", 9, 6);
        if (book === "Colossians") return chapterVerses("Colossians", 2, 9);
        if (book === "Hebrews") return chapterVerses("Hebrews", 1, 8);
        return [];
    });
});

describe("TraceTheDoctrineTrinityPage", () => {
    it("renders the centered heading, noindex metadata, and the Genesis 1:26 starting state", async () => {
        renderPage();
        expect(document.title).toBe("The Trinity — Trace the Doctrine | Gnosis");
        expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
        expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
            "href",
            "https://studygnosis.com/trace-the-doctrine/trinity",
        );
        expect(screen.getByText("Gnosis · Trace the Doctrine")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "The Trinity" })).toBeInTheDocument();
        expect(screen.getByText("From Scripture through Christian history")).toBeInTheDocument();

        expect(screen.getByLabelText("Passage")).toHaveValue("gen-1-26");
        expect(await screen.findByText("Genesis 1 verse 26.")).toBeInTheDocument();
        // Only the cited verse is shown — the rest of the chapter is not.
        expect(screen.queryByText("Genesis 1 verse 25.")).toBeNull();
        expect(screen.queryByText("Genesis 1 verse 27.")).toBeNull();
        expect(getBibleChapter).toHaveBeenCalledWith("Genesis", 1, "KJV");
        expect(screen.getByRole("link", { name: "Open in the reader" })).toHaveAttribute(
            "href",
            "/bible/Genesis/1?verse=26",
        );
        expect(screen.getByText("King James Version")).toBeInTheDocument();
    });

    it("labels the verified research at workspace, panel, and timeline level, with real quotation, title, and date", async () => {
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");
        // Workspace-level notice plus the panel and timeline notices.
        expect(
            screen.getAllByText(/Verified research — quotations, titles, and dates checked/).length,
        ).toBe(3);
        expect(screen.getAllByText("Verified research").length).toBe(3);
        expect(screen.queryByText(/Demonstration data/)).toBeNull();
        expect(screen.queryByText("Prototype")).toBeNull();
        // The first interpretation is auto-selected.
        expect(screen.getByRole("heading", { name: "Justin Martyr" })).toBeInTheDocument();
        expect(
            screen.getByText(/I shall quote again the words narrated by Moses himself/),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Dialogue of Justin, Philosopher and Martyr, with Trypho, a Jew"),
        ).toBeInTheDocument();
        // The work date renders twice on the page — interpretation
        // panel and timeline — so assert on both, as for the notice.
        expect(screen.getAllByText("AD 155–160")).toHaveLength(2);
        // No pending placeholders: the quotation, title, and date are verified.
        expect(screen.queryByText("Title pending verification")).toBeNull();
        expect(screen.queryByText("Date pending verification")).toBeNull();
        expect(screen.queryByText(/Quotation pending verification/)).toBeNull();
        expect(screen.queryByText(/Explanation pending verification/)).toBeNull();
        // Real dates are present: the study is verified research, not placeholders.
        expect(document.querySelector(".doctrine-workspace")).toHaveTextContent("AD 155–160");
    });

    it("renders the generated research study, with verified-research labels and no demonstration labels", async () => {
        // The data-feed contract: the build script generates the real
        // 13-passage study from the current research tree (all
        // publishable passages), and the page renders it — verified
        // research notice, verified labels, no demonstration data.
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");
        expect(
            screen.getAllByText(/Verified research — quotations, titles, and dates checked/).length,
        ).toBeGreaterThanOrEqual(3);
        expect(screen.queryByText(/Demonstration data/)).toBeNull();
        expect(screen.queryByText("Prototype")).toBeNull();
        expect(screen.getByRole("heading", { name: "Justin Martyr" })).toBeInTheDocument();
    });

    it("steps through the thirteen passages with prev/next, never wrapping, and resets the timeline selection", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");

        const previous = screen.getByRole("button", { name: /Previous passage/ });
        const next = screen.getByRole("button", { name: /Next passage/ });
        expect(previous).toBeDisabled();
        expect(next).toBeEnabled();

        // Select a later theologian, then leave the passage: coming back
        // re-selects the first interpretation for Genesis 1:26.
        await user.click(screen.getByRole("button", { name: /Augustine/ }));
        expect(screen.getByRole("heading", { name: "Augustine" })).toBeInTheDocument();

        // Every step in canonical order: [passage id, first cited verse,
        // last cited verse, a verse outside the cited range (null when
        // the mock returns exactly the cited range)].
        const steps = [
            ["gen-18-1", "Genesis 18 verse 1.", "Genesis 18 verse 15.", null],
            ["gen-19-24", "Genesis 19 verse 24.", "Genesis 19 verse 24.", "Genesis 19 verse 23."],
            ["ps-2-7", "Psalms 2 verse 7.", "Psalms 2 verse 7.", "Psalms 2 verse 6."],
            ["ps-45-6", "Psalms 45 verse 6.", "Psalms 45 verse 7.", "Psalms 45 verse 5."],
            ["ps-110-1", "Psalms 110 verse 1.", "Psalms 110 verse 1.", null],
            ["isa-9-6", "Isaiah 9 verse 6.", "Isaiah 9 verse 6.", "Isaiah 9 verse 5."],
            ["matt-28-19", "Matthew 28 verse 19.", "Matthew 28 verse 19.", "Matthew 28 verse 20."],
            ["john-1-1", "John 1 verse 1.", "John 1 verse 3.", "John 1 verse 4."],
            ["john-20-28", "John 20 verse 28.", "John 20 verse 28.", "John 20 verse 27."],
            ["2cor-13-14", "2 Corinthians 13 verse 14.", "2 Corinthians 13 verse 14.", "2 Corinthians 13 verse 13."],
            ["col-2-9", "Colossians 2 verse 9.", "Colossians 2 verse 9.", "Colossians 2 verse 8."],
            ["heb-1-8", "Hebrews 1 verse 8.", "Hebrews 1 verse 8.", "Hebrews 1 verse 7."],
        ];
        for (const [id, firstVerse, lastVerse, absentVerse] of steps) {
            await user.click(screen.getByRole("button", { name: /Next passage/ }));
            expect(screen.getByLabelText("Passage")).toHaveValue(id);
            expect(await screen.findByText(firstVerse)).toBeInTheDocument();
            expect(screen.getByText(lastVerse)).toBeInTheDocument();
            if (absentVerse) expect(screen.queryByText(absentVerse)).toBeNull();
        }
        expect(getBibleChapter).toHaveBeenCalledWith("Genesis", 18, "KJV");
        expect(getBibleChapter).toHaveBeenCalledWith("John", 1, "KJV");
        expect(getBibleChapter).toHaveBeenCalledWith("Matthew", 28, "KJV");
        // The end is an honest end: Next is disabled and stays put.
        expect(screen.getByRole("button", { name: /Next passage/ })).toBeDisabled();
        await user.click(screen.getByRole("button", { name: /Next passage/ }));
        expect(screen.getByLabelText("Passage")).toHaveValue("heb-1-8");

        for (let step = 0; step < 12; step += 1) {
            await user.click(screen.getByRole("button", { name: /Previous passage/ }));
        }
        expect(screen.getByLabelText("Passage")).toHaveValue("gen-1-26");
        expect(await screen.findByText("Genesis 1 verse 26.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Previous passage/ })).toBeDisabled();
        // Back on Genesis 1:26 the first interpretation is selected again.
        expect(screen.getByRole("heading", { name: "Justin Martyr" })).toBeInTheDocument();
    });

    it("shows honest empty states for passages with no entries, in panel and timeline", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");
        // Hebrews 1:8 is the one passage with no interpretations yet.
        await user.selectOptions(screen.getByLabelText("Passage"), "heb-1-8");
        await screen.findByText("Hebrews 1 verse 8.");

        expect(screen.getByText("No historical interpretations have been added for Hebrews 1:8 yet.")).toBeInTheDocument();
        expect(screen.getByText(/The timeline will list interpreters here once research verifies them/)).toBeInTheDocument();
        // No theologian is implied for this passage: no timeline buttons.
        const timeline = document.querySelector(".doctrine-timeline");
        expect(within(timeline).queryAllByRole("button")).toHaveLength(0);
        expect(screen.queryByRole("heading", { name: "Justin Martyr" })).toBeNull();
    });

    it("selects interpretations from the timeline without changing Scripture", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");

        const timeline = document.querySelector(".doctrine-timeline");
        const buttons = within(timeline).getAllByRole("button");
        expect(buttons).toHaveLength(6);
        expect(buttons[0]).toHaveAttribute("aria-current", "true");
        expect(buttons[1]).not.toHaveAttribute("aria-current");
        // Exactly one tab stop (roving tabindex).
        expect(buttons[0]).toHaveAttribute("tabindex", "0");
        expect(buttons[1]).toHaveAttribute("tabindex", "-1");

        await user.click(screen.getByRole("button", { name: /Tertullian/ }));
        expect(screen.getByRole("heading", { name: "Tertullian" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Tertullian/ })).toHaveAttribute("aria-current", "true");
        expect(screen.getByRole("button", { name: /Justin Martyr/ })).not.toHaveAttribute("aria-current");
        // Scripture did not move.
        expect(screen.getByText("Genesis 1 verse 26.")).toBeInTheDocument();
        expect(screen.getByLabelText("Passage")).toHaveValue("gen-1-26");
        expect(getBibleChapter).toHaveBeenCalledTimes(1);
    });

    it("moves the timeline selection with Left/Right arrows and Home/End", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");

        const justin = screen.getByRole("button", { name: /Justin Martyr/ });
        justin.focus();
        await user.keyboard("{ArrowRight}");
        expect(screen.getByRole("heading", { name: "Irenaeus" })).toBeInTheDocument();
        await user.keyboard("{ArrowRight}");
        expect(screen.getByRole("heading", { name: "Theophilus of Antioch" })).toBeInTheDocument();
        await user.keyboard("{ArrowLeft}");
        expect(screen.getByRole("heading", { name: "Irenaeus" })).toBeInTheDocument();
        await user.keyboard("{End}");
        expect(screen.getByRole("heading", { name: "Cyril of Alexandria" })).toBeInTheDocument();
        await user.keyboard("{Home}");
        expect(screen.getByRole("heading", { name: "Justin Martyr" })).toBeInTheDocument();
        expect(screen.getByText(/Use the Left and Right arrow keys/)).toBeInTheDocument();
    });

    it("expands the explanation and source details as verified research", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");

        const explanation = screen.getByRole("button", { name: "Show explanation" });
        expect(explanation).toHaveAttribute("aria-expanded", "false");
        await user.click(explanation);
        expect(
            screen.getByText(/In Dialogue 62 Justin answers Trypho's teachers/),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Source details" }));
        const details = document.getElementById("doctrine-source-details-body");
        expect(details).toHaveTextContent("Justin Martyr");
        expect(details).toHaveTextContent("Dialogue of Justin, Philosopher and Martyr, with Trypho, a Jew");
        expect(details).toHaveTextContent("AD 155–160");
        expect(details).toHaveTextContent("Verified research — editorially-approved");
        expect(details).not.toHaveTextContent("pending verification");
    });

    it("re-fetches the passage when the translation changes and shows the new translation's name", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");
        expect(getTranslations).toHaveBeenCalled();

        await user.selectOptions(screen.getByLabelText("Translation"), "ESV");
        expect(getBibleChapter).toHaveBeenCalledWith("Genesis", 1, "ESV");
        expect(await screen.findByText("Genesis 1 verse 26.")).toBeInTheDocument();
        expect(screen.getByText("English Standard Version")).toBeInTheDocument();
    });

    it("shows an error with a retry that reloads the passage", async () => {
        const user = userEvent.setup();
        getBibleChapter
            .mockRejectedValueOnce(new Error("Unable to load Scripture."))
            .mockImplementation(async (book, chapter) => chapterVerses(book, chapter, 27));
        renderPage();
        expect(await screen.findByRole("alert")).toHaveTextContent("The passage could not be loaded.");
        await user.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Genesis 1 verse 26.")).toBeInTheDocument();
    });

    it("jumps straight to a passage with the passage select", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");

        const select = screen.getByLabelText("Passage");
        expect(select).toHaveValue("gen-1-26");
        expect(within(select).getAllByRole("option")).toHaveLength(13);

        await user.selectOptions(select, "matt-28-19");
        expect(await screen.findByText("Matthew 28 verse 19.")).toBeInTheDocument();
        expect(screen.queryByText("Matthew 28 verse 20.")).toBeNull();
        expect(getBibleChapter).toHaveBeenCalledWith("Matthew", 28, "KJV");
        expect(screen.getByLabelText("Passage")).toHaveValue("matt-28-19");
        // Matthew 28:19 has eight interpretations — the first is
        // selected, not an empty state.
        expect(screen.getByRole("heading", { name: "Justin Martyr" })).toBeInTheDocument();
        expect(
            screen.queryByText("No historical interpretations have been added for Matthew 28:19 yet."),
        ).toBeNull();
        const timeline = document.querySelector(".doctrine-timeline");
        expect(within(timeline).getAllByRole("button")).toHaveLength(8);
    });

    it("steps passages with Left/Right arrows from the navigation, and leaves the select's native keys alone", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");

        const next = screen.getByRole("button", { name: /Next passage/ });
        next.focus();
        await user.keyboard("{ArrowRight}");
        expect(await screen.findByText("Genesis 18 verse 1.")).toBeInTheDocument();

        const previous = screen.getByRole("button", { name: /Previous passage/ });
        previous.focus();
        await user.keyboard("{ArrowLeft}");
        expect(await screen.findByText("Genesis 1 verse 26.")).toBeInTheDocument();

        // Arrow keys inside the select keep their native meaning: the
        // passage does not change.
        const select = screen.getByLabelText("Passage");
        select.focus();
        await user.keyboard("{ArrowRight}");
        expect(screen.getByLabelText("Passage")).toHaveValue("gen-1-26");
        expect(screen.getByText("Genesis 1 verse 26.")).toBeInTheDocument();
    });

    it("moves focus to the new passage heading after a passage change, and never steals focus on load", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");
        // Initial mount: focus stays where the browser put it.
        expect(document.activeElement).toBe(document.body);

        await user.click(screen.getByRole("button", { name: /Next passage/ }));
        expect(await screen.findByText("Genesis 18 verse 1.")).toBeInTheDocument();
        expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Genesis 18:1–15" }));
    });

    it("does not scroll the timeline on mount, and scrolls the selected node into view on keyboard selection", async () => {
        const user = userEvent.setup();
        const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
        try {
            renderPage();
            await screen.findByText("Genesis 1 verse 26.");
            expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();

            screen.getByRole("button", { name: /Justin Martyr/ }).focus();
            await user.keyboard("{ArrowRight}");
            expect(screen.getByRole("heading", { name: "Irenaeus" })).toBeInTheDocument();
            expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
        } finally {
            if (originalScrollIntoView === undefined) {
                delete window.HTMLElement.prototype.scrollIntoView;
            } else {
                window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
            }
        }
    });

    it("lays out Scripture and interpretation as one 45/55 surface with the timeline at the bottom of the right column", async () => {
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");

        const workspace = document.querySelector(".doctrine-workspace");
        const grid = document.querySelector(".doctrine-workspace-grid");
        expect(workspace).toContainElement(grid);
        expect(grid.children).toHaveLength(2);
        expect(grid.children[0]).toHaveClass("doctrine-workspace-scripture");
        expect(grid.children[1]).toHaveClass("doctrine-workspace-interpretation");

        // The timeline lives at the bottom of the right column, after
        // the interpretation panel — never full-width beneath the grid.
        const interpretationColumn = document.querySelector(".doctrine-workspace-interpretation");
        const timeline = document.querySelector(".doctrine-timeline");
        expect(timeline.parentElement).toBe(interpretationColumn);
        expect(timeline.previousElementSibling).toHaveClass("doctrine-interpretation-panel");
        expect(timeline.closest(".doctrine-workspace-grid")).not.toBeNull();

        // Scripture navigation stays with the left column, after the
        // passage in the DOM (it moves above the passage visually on
        // mobile via CSS order — see the stylesheet test).
        const nav = document.querySelector(".doctrine-scripture-nav");
        expect(nav.closest(".doctrine-workspace-scripture")).not.toBeNull();

        // Each timeline node keeps its marker, name, and date in one button.
        for (const button of within(timeline).getAllByRole("button")) {
            expect(button.querySelector(".doctrine-timeline-node-dot")).not.toBeNull();
            expect(button.querySelector(".doctrine-timeline-node-name")).not.toBeNull();
            expect(button.querySelector(".doctrine-timeline-node-date")).not.toBeNull();
        }
    });

    it("declares the 45/55 split, the thin divider, and no card styling in the workspace stylesheet", () => {
        const css = readFileSync(join(import.meta.dirname, "TraceTheDoctrineTrinityPage.css"), "utf8");
        const ruleBlock = (selector) => {
            const start = css.indexOf(selector);
            expect(start).toBeGreaterThanOrEqual(0);
            const open = css.indexOf("{", start);
            const close = css.indexOf("}", open);
            return css.slice(open + 1, close);
        };
        expect(ruleBlock(".doctrine-workspace-grid")).toContain("grid-template-columns: 45% 55%");
        expect(ruleBlock(".doctrine-workspace-interpretation")).toContain("border-left: 1px solid");
        // The columns are regions of one parchment surface, not cards.
        for (const selector of [".doctrine-workspace-scripture", ".doctrine-workspace-interpretation"]) {
            const block = ruleBlock(selector);
            expect(block).not.toContain("box-shadow");
            expect(block).not.toContain("border-radius");
        }
        // The timeline sits inside the right column, sharing its padding.
        expect(ruleBlock(".doctrine-workspace-interpretation .doctrine-timeline")).toContain("padding-left: 0");
        // Mobile: the passage navigation moves above the passage, and
        // the timeline strip scrolls horizontally with snap.
        const mobile = css.slice(css.indexOf("@media (max-width: 768px)"));
        expect(mobile).toContain("order: -1");
        expect(css).toContain("overflow-x: auto");
        expect(css).toContain("scroll-snap-type: x mandatory");
        expect(css).toContain("prefers-reduced-motion");
    });
});

describe("DoctrineInterpretationPanel quotation expansion", () => {
    // Synthetic fixtures for interaction testing only — never
    // editorially approved research, and never shown as verified
    // historical evidence.
    const LONG_QUOTATION = "A synthetic quotation written for testing only. ".repeat(12);
    const SHORT_QUOTATION = "A short synthetic quotation for testing only.";

    function panelProps(quotation) {
        return {
            interpretation: {
                id: "test-interpretation",
                figureId: "justin-martyr",
                workId: "justin-martyr-work",
                passageId: "gen-1-26",
                quotation,
                explanation: null,
                citation: "Synthetic citation for testing only.",
                placeholder: true,
                demonstration: true,
                order: 0,
            },
            figure: getFigure("justin-martyr"),
            work: getWork("justin-martyr-work"),
            passage: passages[0],
        };
    }

    it("collapses a long quotation behind a toggle and expands it on request", async () => {
        const user = userEvent.setup();
        render(<DoctrineInterpretationPanel {...panelProps(LONG_QUOTATION)} />);
        const toggle = screen.getByRole("button", { name: "Read full quotation" });
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        expect(document.querySelector(".doctrine-interpretation-quotation")).toHaveClass(
            "doctrine-interpretation-quotation--collapsed",
        );
        await user.click(toggle);
        expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
        expect(document.querySelector(".doctrine-interpretation-quotation")).not.toHaveClass(
            "doctrine-interpretation-quotation--collapsed",
        );
    });

    it("renders a short quotation in full with no toggle", () => {
        render(<DoctrineInterpretationPanel {...panelProps(SHORT_QUOTATION)} />);
        expect(screen.queryByRole("button", { name: /quotation/ })).toBeNull();
        expect(screen.getByText(SHORT_QUOTATION)).toBeInTheDocument();
    });

    it("starts collapsed again when the theologian changes", async () => {
        const user = userEvent.setup();
        const props = panelProps(LONG_QUOTATION);
        const { rerender } = render(<DoctrineInterpretationPanel {...props} />);
        await user.click(screen.getByRole("button", { name: "Read full quotation" }));
        expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();

        rerender(
            <DoctrineInterpretationPanel
                {...props}
                interpretation={{ ...props.interpretation, id: "test-interpretation-2", figureId: "irenaeus", workId: "irenaeus-work" }}
                figure={getFigure("irenaeus")}
                work={getWork("irenaeus-work")}
            />,
        );
        expect(screen.getByRole("button", { name: "Read full quotation" })).toHaveAttribute("aria-expanded", "false");
    });
});
