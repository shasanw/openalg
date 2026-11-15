// A single button that toggles the app theme between light and dark. The icon
// shows the mode you'd switch *to* (moon while light, sun while dark).

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/lib/useTheme";

export function ThemeToggle({
  theme,
  onThemeChange,
  className,
  size = "icon",
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  className?: string;
  size?: "icon" | "sm";
}) {
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <Button
      variant="quiet"
      size={size}
      className={className}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      onClick={() => onThemeChange(next)}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
