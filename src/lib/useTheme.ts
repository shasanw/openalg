// App theme (dark by default, or light). The chosen theme is applied as a `.dark` class on
// <html>, which drives the token set defined in index.css. An inline script in
// index.html applies the stored choice before React mounts (no flash of the
// wrong theme); this hook keeps it in sync after mount.

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "openalg-theme";

/** Dark is the default; only an explicit "light" choice turns it off. */
export function readStoredTheme(): Theme {
  let v: string | null = null;
  try {
    v = typeof localStorage !== "undefined" ? localStorage.getItem(THEME_STORAGE_KEY) : null;
  } catch {
    // Storage blocked (private mode, site data off): fall back to the default.
  }
  return v === "light" ? "light" : "dark";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // Apply on mount and whenever the choice changes.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The choice still applies for this session.
    }
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
