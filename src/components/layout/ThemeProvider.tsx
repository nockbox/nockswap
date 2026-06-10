"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always start with "light" so server and first client render match,
  // then load the persisted/system preference after mount.
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    const preferred =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    if (preferred !== "light") {
      // setState in effect is deliberate: the preference can only be read on
      // the client, after the server-rendered "light" markup has hydrated.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeState(preferred);
    }
  }, []);

  // Keep the .dark class on <html> in sync so CSS rules (placeholders,
  // body background, etc.) follow the same theme as the inline styles.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem("theme", next);
  };

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
