// App theme (light / dark). The chosen theme is applied as a `.dark` class on
// <html>, which drives the token set defined in index.css. An inline script in
// index.html applies the stored choice before React mounts (no flash of the
// wrong theme); this hook keeps it in sync after mount.

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "openalg-theme";

function readStored(): Theme {
  const v =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(THEME_STORAGE_KEY)
      : null;
  return v === "dark" ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStored);

  // Apply on mount and whenever the choice changes.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
