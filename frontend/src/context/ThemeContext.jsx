import { createContext, useMemo, useState, useEffect } from 'react'

const ThemeContext = createContext();

export default ThemeContext;

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        try {
            const saved = localStorage.getItem("gnosis-theme");
            return saved === "dark" ? "dark" : "light";
        } catch { return "light"; }
    });

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        try { localStorage.setItem("gnosis-theme", theme); } catch { /* Storage may be disabled. */ }
    }, [theme]);

    // Memoised so consumers only re-render when the theme itself
    // changes; setTheme is a stable setter.
    const value = useMemo(() => ({ theme, setTheme }), [theme]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    )
}