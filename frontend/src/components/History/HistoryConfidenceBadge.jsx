// Claim-confidence badge (the claim axis — Research Agent §8 vocabulary).
// Distinct from the date label: this renders only a claim's confidence,
// always as text, never by colour alone.
const LABELS = {
    established: "Established",
    probable: "Probable",
    debated: "Debated",
    traditional: "Traditional",
    unknown: "Unknown",
};

export default function HistoryConfidenceBadge({ confidence }) {
    if (!confidence || !LABELS[confidence]) return null;
    return (
        <span className={`history-confidence-badge history-confidence-badge--${confidence}`}>
            {LABELS[confidence]}
        </span>
    );
}
