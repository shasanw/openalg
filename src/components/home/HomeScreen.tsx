// The launch screen, shown when no document is open. Word-style: "start new"
// (blank worksheet / test + topic templates) on top, recent documents below.
// Recents come from the managed worksheet library (auto-saved documents).

import {
  ArchiveRestore,
  Download,
  FolderOpen,
  MonitorDown,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sigma,
  TriangleAlert,
  Trash2,
} from "lucide-react";
import { GENERATORS, getGenerator } from "@/engine/registry";
import type { LibraryEntry, StoragePersistence } from "@/platform/types";
import type { InstallPrompt } from "@/lib/useInstallPrompt";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoMark } from "@/components/LogoMark";
import type { Theme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** A compact "x ago" stamp for the recents list. */
function relativeTime(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day > 1 ? "s" : ""} ago`;
  return new Date(ms).toLocaleDateString();
}

export function HomeScreen({
  onNewWorksheet,
  onOpenTemplate,
  onOpen,
  recents,
  onOpenRecent,
  onDeleteRecent,
  theme,
  onThemeChange,
  onBackupLibrary,
  onRestoreLibrary,
  storage,
  install,
}: {
  onNewWorksheet: () => void;
  onOpenTemplate: (generatorId: string) => void;
  onOpen: () => void;
  recents: LibraryEntry[];
  onOpenRecent: (id: string) => void;
  onDeleteRecent: (id: string) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onBackupLibrary: () => void;
  onRestoreLibrary: () => void;
  /** Whether the browser keeps the Library safe from eviction; null while unknown. */
  storage: StoragePersistence | null;
  install: InstallPrompt;
}) {
  return (
    <div className="bg-background h-screen overflow-y-auto">
      <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-6 backdrop-blur">
        <LogoMark className="shadow-sm" />
        <span className="text-lg font-bold tracking-tight">OpenAlg</span>
        <span className="text-muted-foreground text-xs font-medium">
          Algebra 2 · Precalculus
        </span>
        <div className="flex-1" />
        <div className="relative hidden sm:block">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input
            className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-72 rounded-xl border pr-3 pl-9 text-sm outline-none focus-visible:ring-[3px]"
            placeholder="Search your worksheets…"
          />
        </div>
        {install.canInstall && (
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => void install.install()}
            title="Install OpenAlg as an app so your Library is kept safe"
          >
            <MonitorDown /> Install app
          </Button>
        )}
        <ThemeToggle theme={theme} onThemeChange={onThemeChange} className="size-9" />
        <Button variant="outline" size="icon" className="size-9" title="Settings">
          <Settings />
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-6 pt-9 pb-20">
        <h1 className="text-3xl font-bold tracking-tight">{greeting()}</h1>
        <p className="text-muted-foreground mt-1.5 text-[15px]">
          Start something new, or pick up where you left off.
        </p>

        {/* Start new */}
        <SectionTitle>Start new</SectionTitle>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StartCard
            label="Blank worksheet"
            sub="One topic"
            onClick={onNewWorksheet}
            blank
          />
          <StartCard
            label="Blank test"
            sub="Coming soon"
            disabled
            test
          />
          {GENERATORS.map((g) => (
            <StartCard
              key={g.id}
              label={g.title}
              sub="Template"
              onClick={() => onOpenTemplate(g.id)}
            />
          ))}
        </div>

        {/* Recent */}
        <div className="mt-9 mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            Recent
          </h2>
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onOpen}>
              <FolderOpen /> Open a file…
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackupLibrary}
              disabled={recents.length === 0}
              title="Download one file holding every Worksheet in your Library"
            >
              <Download /> Back up Library
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRestoreLibrary}
              title="Rebuild your Library from a Library Backup file"
            >
              <ArchiveRestore /> Restore…
            </Button>
          </div>
        </div>
        {recents.length === 0 ? (
          <div className="border-border bg-card flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center">
            <FolderOpen className="text-muted-foreground/60 size-8" />
            <p className="text-foreground mt-3 text-sm font-medium">
              No worksheets yet
            </p>
            <p className="text-muted-foreground mt-1 text-[13px]">
              Worksheets you create are saved automatically and show up here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recents.map((r) => (
              <RecentCard
                key={r.id}
                entry={r}
                onOpen={() => onOpenRecent(r.id)}
                onDelete={() => onDeleteRecent(r.id)}
              />
            ))}
          </div>
        )}
        {recents.length > 0 && <StorageNote storage={storage} install={install} />}
      </main>
    </div>
  );
}

/**
 * Unobtrusive Library safety status: a quiet line when the browser keeps the
 * Library persistently, otherwise a note suggesting installing and backups.
 */
function StorageNote({
  storage,
  install,
}: {
  storage: StoragePersistence | null;
  install: InstallPrompt;
}) {
  if (storage === null) return null;
  if (storage === "persistent" || install.installed) {
    return (
      <p className="text-muted-foreground mt-4 flex items-center gap-1.5 text-[12px]">
        <ShieldCheck className="size-3.5" />
        Your Library is stored persistently in this browser.
      </p>
    );
  }
  const howToInstall = install.showAppleHint
    ? " On iPad, tap Share, then Add to Home Screen."
    : install.canInstall
      ? " Use Install app above."
      : "";
  return (
    <p className="text-muted-foreground mt-4 flex items-start gap-1.5 text-[12px] leading-relaxed">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>
        This browser may clear your Library if storage runs low or site data is
        cleared. Install OpenAlg as an app and back up your Library now and then
        to keep your Worksheets safe.{howToInstall}
      </span>
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground mt-9 mb-4 text-xs font-bold tracking-wide uppercase">
      {children}
    </h2>
  );
}

function RecentCard({
  entry,
  onOpen,
  onDelete,
}: {
  entry: LibraryEntry;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const topic = getGenerator(entry.generatorId)?.title ?? "Worksheet";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group bg-card hover:border-primary relative flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_var(--primary)]"
    >
      <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-content-center rounded-xl">
        <Sigma className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold">{entry.title}</div>
        <div className="text-muted-foreground truncate text-[11.5px]">
          {topic} · {entry.count} problem{entry.count === 1 ? "" : "s"}
        </div>
        <div className="text-muted-foreground/80 text-[11px]">
          {relativeTime(entry.updatedAt)}
        </div>
      </div>
      <button
        type="button"
        aria-label="Delete worksheet"
        title="Delete worksheet"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive absolute top-2 right-2 rounded-md p-1.5 opacity-0 transition-all group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function StartCard({
  label,
  sub,
  onClick,
  disabled,
  blank,
  test,
}: {
  label: string;
  sub: string;
  onClick?: () => void;
  disabled?: boolean;
  blank?: boolean;
  test?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group bg-card rounded-2xl border p-3.5 text-left transition-all",
        disabled
          ? "cursor-not-allowed opacity-55"
          : "hover:border-primary hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_var(--primary)]",
      )}
    >
      <Thumb blank={blank} test={test} />
      <div className="mt-2.5 truncate text-[13.5px] font-semibold">{label}</div>
      <div className="text-muted-foreground text-[11.5px]">{sub}</div>
    </button>
  );
}

function Thumb({ blank, test }: { blank?: boolean; test?: boolean }) {
  if (blank) {
    return (
      <div className="text-primary flex aspect-[8.5/11] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white">
        <Plus className="size-7" />
      </div>
    );
  }
  // Abstract "mini paper" preview lines. The thumbnail is always white paper, so
  // these use fixed neutrals (not theme tokens) to stay visible in dark mode.
  const Line = ({ w }: { w: string }) => (
    <div className={cn("mb-1.5 h-1 rounded-full bg-slate-300", w)} />
  );
  return (
    <div className="relative aspect-[8.5/11] overflow-hidden rounded-lg border border-slate-200 bg-white p-3">
      {test && (
        <span className="text-chart-2 bg-chart-2/10 absolute top-2 right-2 rounded px-1.5 text-[8px] font-bold">
          A · B
        </span>
      )}
      <div className="mb-2.5 h-1.5 w-3/5 rounded-full bg-slate-400" />
      <div className="flex gap-2">
        <div className="flex-1">
          <Line w="w-5/6" />
          <Line w="w-2/3" />
          <Line w="w-1/2" />
        </div>
        <div className="flex-1">
          <Line w="w-3/4" />
          <Line w="w-5/6" />
          <Line w="w-1/2" />
        </div>
      </div>
    </div>
  );
}
