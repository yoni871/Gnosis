import { createContext, useState, useEffect } from 'react'

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

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}