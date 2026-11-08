import { useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, useReducer } from "react";
import AuthContext from "../context/AuthContext";

// Each hook owns its own lifetime. Cleanup retires only that lifetime, never
// the replacement created by Strict Mode or a subsequent identity change.
export default function usePrivateSession(defaults) {
    const auth = useContext(AuthContext);
    const { sessionVersion, user, token, isAuthLoading } = auth;
    // Rotation changes the credential, not ownership of drafts and pending work.
    let credentialOwner = token;
    try {
        const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        credentialOwner = claims.sid || token;
    } catch { /* Synthetic/legacy tokens keep their existing ownership behavior. */ }
    const owner = JSON.stringify([sessionVersion, user?.id ?? null, credentialOwner, isAuthLoading]);
    const [initial] = useState(() => defaults);
    const [stored, setStored] = useReducer((current, change) => change(current),
        { owner, value: initial });
    const lifetime = useRef(null);

    useLayoutEffect(() => {
        const ticket = { owner, active: true };
        lifetime.current = ticket;
        setStored(current => current.owner === owner ? current : { owner, value: initial });
        return () => { ticket.active = false; };
    }, [owner, initial]);

    const isCurrent = useCallback(ticket => Boolean(
        ticket && ticket.active && lifetime.current === ticket
    ), []);
    const capture = useCallback(() => {
        const ticket = lifetime.current;
        return ticket?.owner === owner && ticket.active ? ticket : null;
    }, [owner]);
    const setCurrent = useCallback((change, ticket = lifetime.current) => {
        if (!isCurrent(ticket)) return;
        setStored(current => {
            if (!isCurrent(ticket) || current.owner !== ticket.owner) return current;
            const value = typeof change === "function" ? change(current.value) : change;
            return value === current.value ? current : { owner: ticket.owner, value };
        });
    }, [isCurrent]);
    const update = useCallback(change => setCurrent(change, capture()), [capture, setCurrent]);
    const setters = useMemo(() => {
        const result = {};
        for (const name of Object.keys(initial)) {
            result[name] = function setField(change) {
                update(current => ({
                    ...current,
                    [name]: typeof change === "function" ? change(current[name]) : change
                }));
            };
        }
        return result;
    }, [initial, update]);
    const field = useCallback(name => setters[name], [setters]);
    // Defaults are visible in the identity-change render itself, before effects.
    const state = stored.owner === owner ? stored.value : initial;
    return {
        ...auth,
        // A token alone is not a confirmed application identity.
        token: !isAuthLoading && user?.id != null ? token : null,
        owner, state, field, capture, isCurrent, setCurrent
    };
}
