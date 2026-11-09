import { useCallback, useState } from "react";

// Adjust local state during the owning render when external navigation changes.
// This avoids showing a stale location for one frame and then resetting in an
// effect. Undefined external values preserve the user's current choice.
export default function useSyncedState(external, initial = external, key = external) {
    const [stored, setStored] = useState(() => ({ key, value: external === undefined ? initial : external }));
    let value = stored.value;
    if (!Object.is(stored.key, key)) {
        value = external === undefined ? stored.value : external;
        setStored({ key, value });
    }
    const setValue = useCallback(change => setStored(current => ({
        ...current,
        value: typeof change === "function" ? change(current.value) : change,
    })), []);
    return [value, setValue];
}
