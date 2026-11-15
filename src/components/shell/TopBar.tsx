// The application top bar: brand (click → home), the document title, the
// Worksheet/Test mode toggle, and global file actions. Test mode (multi-section)
// is a staged follow-up — its button is present but disabled for now.

import {
  Check,
  CloudOff,
  FileDown,
  FolderOpen,
  Loader2,
  Printer,
  Save,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/LogoMark";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AutosaveState } from "@/App";
import type { Theme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";

export type DocMode = "worksheet" | "test";

/** Subtle "your work is saved" indicator for the silent library auto-save. */
function AutosaveIndicator({ state }: { state: AutosaveState }) {
  if (state === "idle") return null;
  const map = {
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Saving…" },
    saved: { icon: <Check className="size-3.5" />, text: "Saved" },
    error: { icon: <CloudOff className="size-3.5 text-destructive" />, text: "Not saved" },
  } as const;
  const { icon, text } = map[state];
  return (
    <span
      className={cn(
        "text-muted-foreground flex items-center gap-1 text-xs font-medium",
        state === "error" && "text-destructive",
      )}
      aria-live="polite"
    >
      {icon}
      {text}
    </span>
  );
}

/** A spinning placeholder swapped in for a button's icon while it's busy. */
function Spinner() {
  return <Loader2 className="animate-spin" />;
}

export function TopBar({
  title,
  onTitleChange,
  mode,
  onModeChange,
  onHome,
  onOpen,
  onSave,
  onExport,
  onPrint,
  onPrintConfig,
  canSave,
  canExport,
  autosave,
  saving,
  exporting,
  printing,
  theme,
  onThemeChange,
}: {
  title: string;
  /** When provided, the title becomes editable inline. */
  onTitleChange?: (title: string) => void;
  mode: DocMode;
  onModeChange: (mode: DocMode) => void;
  onHome: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExport: () => void;
  onPrint: () => void;
  onPrintConfig: () => void;
  canSave: boolean;
  canExport: boolean;
  autosave: AutosaveState;
  saving: boolean;
  exporting: boolean;
  printing: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  return (
    <header className="bg-sidebar flex h-13 shrink-0 items-center gap-3 rounded-xl border px-3 shadow-sm">
      <button
        onClick={onHome}
        className="hover:bg-accent flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors"
        title="Home"
      >
        <LogoMark className="shadow-sm" />
        <span className="text-[17px] font-bold tracking-tight">OpenAlg</span>
      </button>

      <Separator orientation="vertical" className="h-5" />

      {onTitleChange ? (
        <input
          aria-label="Worksheet title"
          value={title}
          onChange={(e) => onTitleChange(e.currentTarget.value)}
          className="hover:bg-accent focus:bg-accent focus:ring-ring/50 min-w-0 max-w-[28ch] flex-shrink truncate rounded-md bg-transparent px-1.5 py-1 text-sm font-semibold outline-none transition-colors focus:ring-2"
        />
      ) : (
        <span className="truncate text-sm font-semibold">{title}</span>
      )}

      <AutosaveIndicator state={autosave} />

      <Separator orientation="vertical" className="h-5" />

      {/* Worksheet / Test mode */}
      <div className="bg-muted flex gap-0.5 rounded-lg border p-0.5">
        <ModeButton
          active={mode === "worksheet"}
          onClick={() => onModeChange("worksheet")}
        >
          Worksheet
        </ModeButton>
        <ModeButton
          active={mode === "test"}
          disabled
          title="Multi-section tests — coming soon"
          onClick={() => onModeChange("test")}
        >
          Test
        </ModeButton>
      </div>

      <div className="flex-1" />

      <Button variant="ghost" size="sm" onClick={onOpen}>
        <FolderOpen /> Open
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onSave}
        disabled={!canSave || saving}
      >
        {saving ? <Spinner /> : <Save />} Save
      </Button>
      <ThemeToggle theme={theme} onThemeChange={onThemeChange} className="size-8" />
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title="Print & layout"
        onClick={onPrintConfig}
        disabled={!canExport}
      >
        <Settings />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onExport}
        disabled={!canExport || exporting}
      >
        {exporting ? <Spinner /> : <FileDown />} Export PDF
      </Button>
      <Button
        variant="default"
        size="sm"
        onClick={onPrint}
        disabled={!canExport || printing}
      >
        {printing ? <Spinner /> : <Printer />} Print
      </Button>
    </header>
  );
}

function ModeButton({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "h-7 rounded-md px-3 text-[13px] font-medium transition-colors",
        active
          ? "bg-card text-primary shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50 hover:text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
