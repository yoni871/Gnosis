import { useEffect, useState, createContext } from "react";
import { getProfile, loginUser, registerUser } from "../services/authService";
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
                const profile = await getProfile(token);
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
    // each other.
    async function loginWithTicket(credentials, ticket) {
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
    }

    async function login (credentials) {
        const ticket = authGuard.begin();
        setSessionVersion(ticket);
        return loginWithTicket(credentials, ticket);
    }

    async function register(userData) {
        // Issue #9: registration creates an unverified account and does
        // NOT log in. It touches no session state at all: no ticket, no
        // sessionVersion bump, no token, no user. Private-state owners
        // (issue #8) therefore do not reset on a registration, and a
        // registration in flight can never disturb a login or a logout.
        // The caller shows the check-email state for the returned email.
        const data = await registerUser(userData);
        return { email: data.email };
    }

    function logout() {
        // Invalidate first: any restore/login/register already in
        // flight becomes stale and must not write state or storage
        // when it eventually finishes.
        setSessionVersion(authGuard.invalidate());
        localStorage.removeItem("gnosisToken");
        setToken(null);
        setUser(null);
        setIsAuthLoading(false);
    }

    const isAuthenticated = Boolean(user);

    return (
        <AuthContext.Provider
            value={{
                sessionVersion,
                user,
                token,
                isAuthenticated,
                isAuthLoading,
                login,
                register,
                logout
            }}
        >
            {children}
        </AuthContext.Provider>
    );

}
