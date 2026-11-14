// Guards authentication state against stale asynchronous responses.
//
// Every authentication operation (session restore, login, register) and
// every invalidation (logout, AuthProvider cleanup) advances a single
// monotonically increasing "epoch". An operation captures the epoch as a
// ticket when it starts; after each await it may only read or mutate
// authentication state (user, token, localStorage, isAuthLoading) while
// its ticket is still the current epoch. Once a newer operation starts
// or an invalidation happens, older tickets are stale forever and their
// late results must be ignored.

export function createAuthSessionGuard() {
    let currentEpoch = 0;
    const listeners = new Set();

    // Notify useSyncExternalStore subscribers (AuthContext reads the
    // epoch as its read-only sessionVersion). Every epoch advance
    // notifies, so the published version can never drift from the
    // guard — no effect ever needs to copy it into state.
    const emit = () => {
        for (const listener of [...listeners]) listener();
    };

    return {
        // Start a new authentication operation and return its ticket.
        // Any ticket captured earlier immediately becomes stale.
        begin() {
            currentEpoch += 1;
            emit();
            return currentEpoch;
        },

        // Invalidate whatever operation is in flight without starting a
        // new one (logout, provider unmount/cleanup). Returns the new
        // current epoch; tickets captured later are unaffected.
        invalidate() {
            currentEpoch += 1;
            emit();
            return currentEpoch;
        },

        // True only while the ticket belongs to the latest operation
        // and no invalidation has happened since it was captured.
        isCurrent(ticket) {
            return ticket === currentEpoch;
        },

        // External-store subscription for useSyncExternalStore.
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },

        // External-store snapshot for useSyncExternalStore: the current
        // epoch. A number, so it is referentially stable between
        // advances and never tears.
        getSnapshot() {
            return currentEpoch;
        },
    };
}
