import { useId } from "react";
import { KNOWLEDGE_CATEGORIES } from "./knowledgeVision";
import "./LandingBeyondText.css";

export default function KnowledgeDiagram({ categories = KNOWLEDGE_CATEGORIES }) {
    const captionId = useId();
    // Desktop is radial. Narrow screens use two bands around the same hub;
    // extra categories create additional rows instead of shrinking the labels.
    const split = Math.ceil(categories.length / 2);
    const topRows = Math.ceil(split / 3);
    const bottomRows = Math.ceil((categories.length - split) / 3);
    const rows = [...Array(topRows).fill(84), 112, ...Array(bottomRows).fill(84)];
    const height = rows.reduce((sum, row) => sum + row, 0) + (rows.length - 1) * 24;
    const hubY = (topRows * 108 + 56) / height * 100;
    const nodes = categories.map((category, index) => {
        const angle = -Math.PI / 2 + index * 2 * Math.PI / categories.length;
        const bandIndex = index < split ? index : index - split;
        const row = Math.floor(bandIndex / 3) + (index < split ? 0 : topRows + 1);
        const column = bandIndex % 3;
        const mobileY = (rows.slice(0, row).reduce((sum, size) => sum + size, 0) + row * 24 + 42) / height * 100;
        return { ...category, x: 50 + Math.cos(angle) * 38, y: 50 + Math.sin(angle) * 38, row, column, mobileY };
    });

    return (
        <figure className="knowledge-diagram" aria-labelledby={captionId}>
            <figcaption id={captionId}>The Gnosis Vision{" "}<span>Planned connections</span></figcaption>
            <div className="knowledge-diagram-plane" style={{ "--vision-height": `${height}px`, "--vision-rows": rows.map(row => `${row}px`).join(" "), "--vision-hub-y": `${hubY}%` }}>
                <svg className="knowledge-lines knowledge-lines-radial" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                    {nodes.map(node => <path key={node.id} d={`M 50 50 L ${node.x} ${node.y}`} vectorEffect="non-scaling-stroke" />)}
                </svg>
                <svg className="knowledge-lines knowledge-lines-stacked" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                    {nodes.map(node => <path key={node.id} d={`M 50 ${hubY} L ${(node.column + .5) / 3 * 100} ${node.mobileY}`} vectorEffect="non-scaling-stroke" />)}
                </svg>
                <div className="knowledge-diagram-hub">
                    <p className="knowledge-verse-reference">JOHN 1:1</p>
                    <p><em>In the beginning was the Word...</em></p>
                </div>
                <ul className="knowledge-diagram-nodes" aria-label="Planned knowledge connections" role="list">
                    {nodes.map(({ id, label, Icon, x, y, row, column }) => (
                        <li key={id} className="knowledge-diagram-node" style={{ "--vision-x": `${x}%`, "--vision-y": `${y}%`, "--vision-row": row + 1, "--vision-column": column + 1 }}>
                            <Icon aria-hidden="true" />
                            <span>{label}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </figure>
    );
}
