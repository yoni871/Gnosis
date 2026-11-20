import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import HistoryMarkdown from "./HistoryMarkdown";

describe("HistoryMarkdown", () => {
    it("renders Markdown prose, lists, and emphasis", () => {
        render(<HistoryMarkdown markdown={"## Heading\n\nSome **bold** text and a list:\n\n- one\n- two\n"} />);
        expect(screen.getByText("bold")).toBeInTheDocument();
        expect(screen.getByRole("list")).toBeInTheDocument();
    });

    it("renders footnote references as links into the sources list", () => {
        render(<HistoryMarkdown markdown={"A claim.[1](#source-source-a) Another.[2](#source-source-b)"} />);
        expect(screen.getByRole("link", { name: "1" })).toHaveAttribute("href", "#source-source-a");
        expect(screen.getByRole("link", { name: "2" })).toHaveAttribute("href", "#source-source-b");
    });

    it("renders raw HTML as inert text (no rehype-raw) and drops images", () => {
        render(<HistoryMarkdown markdown={"Text <b>not bold</b>.\n\n![alt](https://example.com/x.png)\n"} />);
        expect(screen.getByText(/Text/)).toHaveTextContent("Text <b>not bold</b>.");
        expect(document.querySelector("img")).toBeNull();
    });

    it("renders unsafe link targets as plain text", () => {
        render(<HistoryMarkdown markdown={"[click](javascript:alert(1))"} />);
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.getByText("click")).toBeInTheDocument();
    });

    it("opens external links in a new tab with noreferrer", () => {
        render(<HistoryMarkdown markdown={"[site](https://example.com)"} />);
        const link = screen.getByRole("link", { name: "site" });
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noreferrer");
    });
});
