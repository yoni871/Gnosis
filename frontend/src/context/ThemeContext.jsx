import { createContext, useState, useEffect } from 'react'

const ThemeContext = createContext();

export default ThemeContext;

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState("light");

    useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
}, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}