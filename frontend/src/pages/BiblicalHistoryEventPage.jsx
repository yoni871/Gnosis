// Thin wrapper: the event route renders the book page shell with the
// event's panel open. One layout, one timeline, one panel implementation,
// two route entries — the same event under three books never gets three
// layouts to keep consistent.
import BiblicalHistoryBookPage from "./BiblicalHistoryBookPage";

export default function BiblicalHistoryEventPage() {
    return <BiblicalHistoryBookPage />;
}
