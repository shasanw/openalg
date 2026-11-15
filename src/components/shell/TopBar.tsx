// The editor's top bar: the logo and a Library breadcrumb (both go home), the
// editable Worksheet title, the save status once there is something saved,
// and the file actions: Open (quiet), a More menu, Export PDF (secondary) and
// Print, the one primary button.

import {
  Check,
  ChevronRight,
  CloudOff,
  FileDown,
  FolderOpen,
  Loader2,
  Moon,
  MoreHorizontal,
  Printer,
  Save,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/LogoMark";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { Theme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";

/** How the open Worksheet is being kept in the Library, for the save status. */
export type AutosaveState = "idle" | "saving" | "saved" | "error";

/** "Saved to Library" and friends; nothing until the first save starts. */
export function SaveStatus({ state }: { state: AutosaveState }) {
  if (state === "idle") return null;
  const map = {
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Saving…" },
    saved: { icon: <Check className="size-3.5" />, text: "Saved to Library" },
    error: { icon: <CloudOff className="size-3.5" />, text: "Not saved" },
  } as const;
  const { icon, text } = map[state];
  return (
    <span
      role="status"
      className={cn(
        "flex shrink-0 items-center gap-1 text-[12px] whitespace-nowrap",
        state === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {icon}
      {text}
    </span>
  );
}

function Spinner() {
  return <Loader2 className="animate-spin" />;
}

export function TopBar({
  title,
  onTitleChange,
  onHome,
  onOpen,
  onSaveCopy,
  onExport,
  onPrint,
  canExport,
  autosave,
  saving,
  exporting,
  printing,
  theme,
  onThemeChange,
}: {
  title: string;
  onTitleChange: (title: string) => void;
  onHome: () => void;
  onOpen: () => void;
  /** Download a Worksheet File (.oalg) copy. */
  onSaveCopy: () => void;
  onExport: () => void;
  onPrint: () => void;
  /** False while there is nothing to print (no Sections yet). */
  canExport: boolean;
  autosave: AutosaveState;
  saving: boolean;
  exporting: boolean;
  printing: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const nextTheme: Theme = theme === "dark" ? "light" : "dark";
  return (
    <header className="bg-panel flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onHome}
          className="hover:bg-hover flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1"
          title="Home"
        >
          <LogoMark className="size-6" />
          <span className="font-semibold">OpenAlg</span>
        </button>
        <ChevronRight aria-hidden className="text-subtle-foreground size-4 shrink-0" />
        <button
          type="button"
          onClick={onHome}
          className="text-muted-foreground hover:bg-hover hover:text-foreground shrink-0 rounded-md px-1.5 py-1"
        >
          Library
        </button>
        <ChevronRight aria-hidden className="text-subtle-foreground size-4 shrink-0" />
        <input
          aria-label="Worksheet title"
          value={title}
          onChange={(e) => onTitleChange(e.currentTarget.value)}
          placeholder="Untitled worksheet"
          spellCheck={false}
          // Sized to its text so the save status sits right after the title.
          style={{ width: `${Math.min(48, Math.max(12, title.length + 2))}ch` }}
          className="hover:border-border-strong placeholder:text-subtle-foreground h-7 min-w-0 truncate rounded-md border border-transparent bg-transparent px-1.5 font-semibold transition-colors"
        />
      </nav>
      <SaveStatus state={autosave} />

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="quiet" onClick={onOpen}>
          <FolderOpen /> Open
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="quiet" size="icon" aria-label="More">
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={onSaveCopy} disabled={saving}>
              <Save /> Save a copy as a file…
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => onThemeChange(nextTheme)}>
              {theme === "dark" ? <Sun /> : <Moon />} Switch to {nextTheme} theme
            </MenuItem>
          </MenuContent>
        </Menu>
        <Button onClick={onExport} disabled={!canExport || exporting}>
          {exporting ? <Spinner /> : <FileDown />} Export PDF
        </Button>
        <Button variant="primary" onClick={onPrint} disabled={!canExport || printing}>
          {printing ? <Spinner /> : <Printer />} Print
        </Button>
      </div>
    </header>
  );
}
