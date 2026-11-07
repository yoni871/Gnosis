import { useCallback, useEffect, useMemo, useState, createContext } from "react";
import { getProfile, loginUser, registerUser, refreshSession, logoutSession } from "../services/authService";
import { createAuthSessionGuard } from "./authSession";

const AuthContext = createContext(null);

export default AuthContext;

export function AuthProvider({ children }) {
    // Read-only ownership snapshot for consumers; only this provider advances it.
    const [sessionVersion, setSessionVersion] = useState(0);
    const [user, setUser] = useState(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    // Epoch guard for issue #6: every auth operation and every logout
    // advances the epoch. An async operation may only mutate state or
    // localStorage while its captured ticket is still current, so a
    // delayed response can never overwrite a newer session or a logout.
    const [authGuard] = useState(() => createAuthSessionGuard());

    const [token, setToken] = useState(() => {
        return localStorage.getItem("gnosisToken");
    });

    useEffect(() => {
        const ticket = authGuard.begin();
        setSessionVersion(ticket);

        //restore the user's login after a page refresh
        const restoreAuth = async () => {
            if (!token) {
                if (authGuard.isCurrent(ticket)) {
                    setIsAuthLoading(false);
                }
                return;
            }

            try {
                let restoredToken = token;
                // Old seven-day JWTs have no sid and are deliberately rejected.
                let claims;
                try { claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { /* Server validates malformed tokens. */ }
                if (claims?.sid && claims.exp * 1000 <= Date.now() + 60000) {
                    const renewed = await refreshSession();
                    if (!authGuard.isCurrent(ticket)) return;
                    restoredToken = renewed.token;
                    localStorage.setItem("gnosisToken", restoredToken);
                    setToken(restoredToken);
                }
                const profile = await getProfile(restoredToken);
                if (!authGuard.isCurrent(ticket)) {
                    return;
                }
                setUser(profile);
            } catch (error) {
                if (!authGuard.isCurrent(ticket)) {
                    return;
                }
                console.error(error);
                localStorage.removeItem("gnosisToken");
                setToken(null);
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
    }, []);

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
            localStorage.setItem("gnosisToken", newToken);
            setToken(newToken);

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
            localStorage.removeItem("gnosisToken");
            setToken(null);
            setUser(null);

            throw error;
        } finally {
            if (authGuard.isCurrent(ticket)) {
                setIsAuthLoading(false);
            }
        }
    }, [authGuard]);

    const login = useCallback(async (credentials) => {
        const ticket = authGuard.begin();
        setSessionVersion(ticket);
        return loginWithTicket(credentials, ticket);
    }, [authGuard, loginWithTicket]);

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

    const logout = useCallback((all = false) => {
        const revocation = logoutSession(token, all === true);
        revocation.catch(error => console.error(error.message));
        // Invalidate first: any restore/login/register already in
        // flight becomes stale and must not write state or storage
        // when it eventually finishes.
        setSessionVersion(authGuard.invalidate());
        localStorage.removeItem("gnosisToken");
        setToken(null);
        setUser(null);
        setIsAuthLoading(false);
    }, [authGuard, token]);

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
                localStorage.setItem("gnosisToken", renewed.token);
                setToken(renewed.token);
            } catch (error) {
                if (!active || !authGuard.isCurrent(ticket)) return;
                if (['SESSION_INVALID', 'TOKEN_INVALID', 'TOKEN_REQUIRED'].includes(error.code)) {
                    logout();
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
    }, [authGuard, logout, sessionVersion, token, user]);

    const isAuthenticated = Boolean(user);

    // Memoised so consumers only re-render when the session state
    // itself changes, not when the provider re-renders for another
    // reason.
    const value = useMemo(() => ({
        sessionVersion,
        user,
        token,
        isAuthenticated,
        isAuthLoading,
        login,
        register,
        logout
    }), [
        sessionVersion,
        user,
        token,
        isAuthenticated,
        isAuthLoading,
        login,
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
