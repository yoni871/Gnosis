import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { BookOpen } from "lucide-react";
import KnowledgeDiagram from "./KnowledgeDiagram";

test("shows the passage and six noninteractive planned knowledge connections", () => {
    render(<KnowledgeDiagram />);
    const diagram = screen.getByRole("figure", { name: "The Gnosis Vision Planned connections" });
    expect(within(diagram).getByText("JOHN 1:1")).toBeInTheDocument();
    expect(within(diagram).getByText("In the beginning was the Word...")).toBeInTheDocument();
    const list = within(diagram).getByRole("list", { name: "Planned knowledge connections" });
    expect(within(list).getAllByRole("listitem").map(item => item.textContent)).toEqual([
        "Theology", "Church History", "Biblical History", "Original Languages", "Sermons", "Hymns",
    ]);
    expect(diagram.querySelectorAll(".knowledge-lines-radial path")).toHaveLength(6);
    expect(diagram.querySelectorAll(".knowledge-lines-stacked path")).toHaveLength(6);
    expect(diagram.querySelectorAll("a, button, [tabindex]")).toHaveLength(0);
});

test("accepts additional categories and independently labels reusable instances", () => {
    const categories = Array.from({ length: 8 }, (_, index) => ({ id: `topic-${index}`, label: `Topic ${index + 1}`, Icon: BookOpen }));
    render(<><KnowledgeDiagram categories={categories} /><KnowledgeDiagram /></>);
    const diagrams = screen.getAllByRole("figure");
    expect(diagrams[0].getAttribute("aria-labelledby")).not.toBe(diagrams[1].getAttribute("aria-labelledby"));
    expect(within(diagrams[0]).getAllByRole("listitem")).toHaveLength(8);
    expect(diagrams[0].querySelectorAll(".knowledge-lines-radial path")).toHaveLength(8);
    expect(diagrams[0].querySelectorAll(".knowledge-lines-stacked path")).toHaveLength(8);
    expect(within(diagrams[1]).getAllByRole("listitem")).toHaveLength(6);
});
