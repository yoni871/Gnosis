import { useEffect, useState, createContext } from "react";
import { getProfile, loginUser, registerUser } from "../services/authService";

const AuthContext = createContext(null);

export default AuthContext;

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    const [token, setToken] = useState(() => {
        return localStorage.getItem("gnosisToken");
    });

    useEffect(() => {
        //restore the user's login after a page refresh
        const restoreAuth = async () => {
            if (!token) {
                setIsAuthLoading(false);
                return;
            }

            try {
            const profile = await getProfile(token);
            setUser(profile);
            } catch (error) {
                console.error(error);
                localStorage.removeItem("gnosisToken");
                setToken(null);
                setUser(null);
            } finally {
                setIsAuthLoading(false);
            }
        };

        restoreAuth();
    }, []);

    async function login (credentials) {
        setIsAuthLoading(true);

        try {
            const { token: newToken } = await loginUser(credentials);
            localStorage.setItem("gnosisToken", newToken);
            setToken(newToken);

            const profile = await getProfile(newToken);
            setUser(profile);

            return profile;
        } catch (error) {
            localStorage.removeItem("gnosisToken");
            setToken(null);
            setUser(null);

            throw error;
        } finally {
            setIsAuthLoading(false);
        }
    }

    async function register(userData) {
        setIsAuthLoading(true);

        try {
            await registerUser(userData);

            return await login({
                email: userData.email,
                password: userData.password
            });
        } finally {
            setIsAuthLoading(false);
        }
    }

    function logout() {
        localStorage.removeItem("gnosisToken");
        setToken(null);
        setUser(null);
    }

    const isAuthenticated = Boolean(user);

    return (
        <AuthContext.Provider
            value={{
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