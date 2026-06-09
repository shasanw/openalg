// The application top bar: brand (click → home), the document title, the
// Worksheet/Test mode toggle, and global file actions. Test mode (multi-section)
// is a staged follow-up — its button is present but disabled for now.

import { FileDown, FolderOpen, Save, Settings, Sigma } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type DocMode = "worksheet" | "test";

export function TopBar({
  title,
  mode,
  onModeChange,
  onHome,
  onOpen,
  onSave,
  onExport,
  canSave,
  canExport,
}: {
  title: string;
  mode: DocMode;
  onModeChange: (mode: DocMode) => void;
  onHome: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExport: () => void;
  canSave: boolean;
  canExport: boolean;
}) {
  return (
    <header className="bg-sidebar flex h-13 shrink-0 items-center gap-3 rounded-xl border px-3 shadow-sm">
      <button
        onClick={onHome}
        className="hover:bg-accent flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors"
        title="Home"
      >
        <span className="from-primary/85 to-primary grid size-7 place-content-center rounded-lg bg-gradient-to-br text-white shadow-sm">
          <Sigma className="size-4" />
        </span>
        <span className="text-[17px] font-bold tracking-tight">OpenAlg</span>
      </button>

      <Separator orientation="vertical" className="h-5" />

      <span className="truncate text-sm font-semibold">{title}</span>

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
      <Button variant="ghost" size="sm" onClick={onSave} disabled={!canSave}>
        <Save /> Save
      </Button>
      <Button variant="ghost" size="icon" className="size-8" title="Settings">
        <Settings />
      </Button>
      <Button
        variant="default"
        size="sm"
        onClick={onExport}
        disabled={!canExport}
      >
        <FileDown /> Export PDF
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
