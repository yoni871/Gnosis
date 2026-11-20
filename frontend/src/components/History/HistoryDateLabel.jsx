// Date label (the date axis). A date label is not a confidence label:
// this component renders only the date type, always as text, never by
// colour alone. See formatHistoryDateLabel in services/historyService.js.
import { formatHistoryDateLabel } from "../../services/historyService";

export default function HistoryDateLabel({ date, className }) {
    if (!date) return null;
    return (
        <span className={className ? `history-date-label ${className}` : "history-date-label"}>
            {formatHistoryDateLabel(date)}
        </span>
    );
}
