import { useCallback, useEffect, useMemo, useRef, useState, createContext } from "react";
import { getProfile, loginUser, registerUser, refreshSession, logoutSession } from "../services/authService";
import { verifyMfaChallenge } from "../services/mfaService";
import { createAuthSessionGuard } from "./authSession";

const AuthContext = createContext(null);

export default AuthContext;

export function AuthProvider({ children }) {
    // Read-only ownership snapshot for consumers; only this provider advances it.
    const [sessionVersion, setSessionVersion] = useState(0);
    const [user, setUser] = useState(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    // Epoch guard for issue #6: every auth operation and every logout
    // advances the epoch. An async operation may only mutate state
    // while its captured ticket is still current, so a
    // delayed response can never overwrite a newer session or a logout.
    const [authGuard] = useState(() => createAuthSessionGuard());

    // Access credentials live only in this provider. The HttpOnly cookie
    // restores a session after reload; discard legacy persistent credentials.
    const [token, setToken] = useState(null);
    const tokenRef = useRef(null);
    const updateToken = useCallback(value => {
        tokenRef.current = value;
        setToken(value);
    }, []);
    const getAccessToken = useCallback(() => tokenRef.current, []);

    useEffect(() => {
        const ticket = authGuard.begin();
        setSessionVersion(ticket);

        //restore the user's login after a page refresh
        const restoreAuth = async () => {
            try {
                try { localStorage.removeItem("gnosisToken"); } catch { /* Storage may be disabled. */ }
                const renewed = await refreshSession();
                if (!authGuard.isCurrent(ticket)) return;
                const restoredToken = renewed.token;
                updateToken(restoredToken);
                const profile = await getProfile(restoredToken);
                if (!authGuard.isCurrent(ticket)) {
                    return;
                }
                setUser(profile);
            } catch (error) {
                if (!authGuard.isCurrent(ticket)) {
                    return;
                }
                // SESSION_INVALID (expired session, 401) and
                // SESSION_REQUEST_INVALID (no refresh cookie at all, 403)
                // are both the routine "nobody is signed in" case, not
                // errors worth logging on every logged-out page load.
                if (
                    error.code !== "SESSION_INVALID" &&
                    error.code !== "SESSION_REQUEST_INVALID"
                ) {
                    console.error(error);
                }
                updateToken(null);
                setUser(null);
            } finally {
                if (authGuard.isCurrent(ticket)) {
                    setIsAuthLoading(false);
                }
            }
        };

        restoreAuth();

        return () => {
            // Unmount / React Strict Mode remount: invalidate this
            // restore so its late response cannot modify state. This
            // only advances the epoch — a session established by a
            // newer mount or operation is not cleared.
            authGuard.invalidate();
        };
    }, [authGuard, updateToken]);

    // Shared login flow. The caller supplies the operation's epoch
    // ticket so concurrent logins coordinate instead of invalidating
    // each other. Stable across renders (authGuard never changes), so
    // the context value below keeps its identity unless the session
    // state itself changes.
    const loginWithTicket = useCallback(async (credentials, ticket) => {
        if (!authGuard.isCurrent(ticket)) {
            return null;
        }
        setIsAuthLoading(true);

        try {
            const { token: newToken } = await loginUser(credentials);
            if (!authGuard.isCurrent(ticket)) {
                return null;
            }
            updateToken(newToken);

            const profile = await getProfile(newToken);
            if (!authGuard.isCurrent(ticket)) {
                return null;
            }
            setUser(profile);

            return profile;
        } catch (error) {
            if (!authGuard.isCurrent(ticket)) {
                return null;
            }
            updateToken(null);
            setUser(null);

            throw error;
        } finally {
            if (authGuard.isCurrent(ticket)) {
                setIsAuthLoading(false);
            }
        }
    }, [authGuard, updateToken]);

    const login = useCallback(async (credentials) => {
        const ticket = authGuard.begin();
        setSessionVersion(ticket);
        return loginWithTicket(credentials, ticket);
    }, [authGuard, loginWithTicket]);

    // Second step of a login for an MFA-enrolled account: the login
    // call already verified the password and returned an MFA challenge
    // instead of a session. Completing the challenge issues the session
    // exactly like login does, under the same epoch guard.
    const loginMfaWithTicket = useCallback(async (challenge, code, ticket) => {
        if (!authGuard.isCurrent(ticket)) {
            return null;
        }
        setIsAuthLoading(true);

        try {
            const { token: newToken } = await verifyMfaChallenge(challenge, code);
            if (!authGuard.isCurrent(ticket)) {
                return null;
            }
            updateToken(newToken);

            const profile = await getProfile(newToken);
            if (!authGuard.isCurrent(ticket)) {
                return null;
            }
            setUser(profile);

            return profile;
        } catch (error) {
            if (!authGuard.isCurrent(ticket)) {
                return null;
            }
            updateToken(null);
            setUser(null);

            throw error;
        } finally {
            if (authGuard.isCurrent(ticket)) {
                setIsAuthLoading(false);
            }
        }
    }, [authGuard, updateToken]);

    const loginMfa = useCallback(async (challenge, code) => {
        const ticket = authGuard.begin();
        setSessionVersion(ticket);
        return loginMfaWithTicket(challenge, code, ticket);
    }, [authGuard, loginMfaWithTicket]);

    const register = useCallback(async (userData) => {
        // Issue #9: registration creates an unverified account and does
        // NOT log in. It touches no session state at all: no ticket, no
        // sessionVersion bump, no token, no user. Private-state owners
        // (issue #8) therefore do not reset on a registration, and a
        // registration in flight can never disturb a login or a logout.
        // The caller shows the check-email state for the returned email.
        const data = await registerUser(userData);
        return { email: data.email };
    }, []);

    const logout = useCallback((all = false, forced = false) => {
        const event = new CustomEvent("gnosis:before-sign-out", { cancelable: true, detail: { forced } });
        if (!window.dispatchEvent(event) && !forced) return false;
        const revocation = logoutSession(token, all === true);
        revocation.catch(error => console.error(error.message));
        // Invalidate first: any restore/login/register already in
        // flight becomes stale and must not write state or storage
        // when it eventually finishes.
        setSessionVersion(authGuard.invalidate());
        updateToken(null);
        setUser(null);
        setIsAuthLoading(false);
        return true;
    }, [authGuard, token, updateToken]);

    useEffect(() => {
        if (!token || !user) return;
        const ticket = sessionVersion;
        let pending = false;
        let active = true;
        let retryTimer;
        const renew = async () => {
            if (pending || !active || !authGuard.isCurrent(ticket)) return;
            clearTimeout(retryTimer);
            pending = true;
            try {
                const renewed = await refreshSession();
                if (!active || !authGuard.isCurrent(ticket)) return;
                const claimsOf = value => JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                // A different tab may have signed in to a different session.
                if (claimsOf(token).sid !== claimsOf(renewed.token).sid) {
                    const profile = await getProfile(renewed.token);
                    if (!active || !authGuard.isCurrent(ticket)) return;
                    setSessionVersion(authGuard.begin());
                    setUser(profile);
                }
                updateToken(renewed.token);
            } catch (error) {
                if (!active || !authGuard.isCurrent(ticket)) return;
                if (['SESSION_INVALID', 'TOKEN_INVALID', 'TOKEN_REQUIRED'].includes(error.code)) {
                    logout(false, true);
                } else {
                    // Temporary transport/server failures must not erase private drafts.
                    // Protected requests still fail closed if the access token expires.
                    retryTimer = setTimeout(renew, 60000);
                }
            } finally { pending = false; }
        };
        const timer = setInterval(renew, 10 * 60 * 1000);
        const onVisible = () => {
            if (document.visibilityState === 'visible') renew();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', renew);
        return () => {
            active = false;
            clearInterval(timer);
            clearTimeout(retryTimer);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', renew);
        };
    }, [authGuard, logout, sessionVersion, token, updateToken, user]);

    const isAuthenticated = Boolean(user);

    // Memoised so consumers only re-render when the session state
    // itself changes, not when the provider re-renders for another
    // reason.
    const value = useMemo(() => ({
        sessionVersion,
        user,
        token,
        getAccessToken,
        isAuthenticated,
        isAuthLoading,
        login,
        loginMfa,
        register,
        logout
    }), [
        sessionVersion,
        user,
        token,
        getAccessToken,
        isAuthenticated,
        isAuthLoading,
        login,
        loginMfa,
        register,
        logout
    ]);

    return (
        <AuthContext.Provider
            value={value}
        >
            {children}
        </AuthContext.Provider>
    );

}
