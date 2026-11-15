// The launch screen, shown when no document is open. Laid out like Google
// Docs: a full-width "Start a new Worksheet" band holding one row of
// templates (a blank Worksheet, then one per Topic, each with a real
// miniature page) that expands to every Topic, and the Library's recent
// Worksheets below it, filtered by the header search.

import { useLayoutEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ArchiveRestore,
  Download,
  FolderOpen,
  MonitorDown,
  Search,
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
import { BlankThumb, TopicThumb } from "./TopicThumb";

/** Width of one Start-new tile and the gap between tiles, in px. */
const TILE_MIN = 148;
const TILE_GAP = 16;

/** How many tiles fit on one row of an element, re-measured as it resizes. */
function useColumns<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [cols, setCols] = useState(6);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setCols(Math.max(2, Math.floor((el.clientWidth + TILE_GAP) / (TILE_MIN + TILE_GAP))));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, cols];
}

const EXPANDED_KEY = "openalg-home-all-topics";

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
  const [query, setQuery] = useState("");
  const [expanded, setExpandedState] = useState(() => {
    try {
      return localStorage.getItem(EXPANDED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const setExpanded = (next: boolean) => {
    setExpandedState(next);
    try {
      localStorage.setItem(EXPANDED_KEY, next ? "1" : "0");
    } catch {
      // Storage unavailable: the choice just isn't remembered.
    }
  };
  const [tilesRef, cols] = useColumns<HTMLDivElement>();
  const templates = GENERATORS;
  // One row: the blank Worksheet plus as many Topics as fit beside it.
  const shown = expanded ? templates : templates.slice(0, cols - 1);
  const hidden = templates.length - shown.length;

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matching = recents.filter((r) => {
    const hay = `${r.title} ${getGenerator(r.generatorId)?.title ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });

  return (
    <div className="bg-background flex h-screen flex-col overflow-y-auto">
      {/* Brand left, search centred on the page, settings right. */}
      <header className="bg-background/80 sticky top-0 z-10 grid h-16 grid-cols-[1fr_minmax(0,600px)_1fr] items-center gap-4 border-b px-6 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-9" />
          <span className="text-[19px] font-semibold tracking-tight">OpenAlg</span>
        </div>
        <div className="relative" role="search">
          <Search className="text-muted-foreground absolute top-1/2 left-4 size-[18px] -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search your Worksheets"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            className="border-input bg-card placeholder:text-subtle-foreground focus:border-ring h-11 w-full rounded-full border pr-4 pl-11 text-[14px] outline-none"
            placeholder="Search your Worksheets"
          />
        </div>
        <div className="flex justify-end">
          <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
        </div>
      </header>

      {/* Start new: a full-width band, one row of templates unless expanded */}
      <section aria-labelledby="start-new" className="bg-panel border-b">
        <div className="mx-auto max-w-[1180px] px-6 pt-6 pb-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="start-new" className="text-[15px] font-medium">
              Start a new Worksheet
            </h2>
            {hidden > 0 || expanded ? (
              <Button
                variant="quiet"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                aria-controls="start-new-tiles"
              >
                {expanded ? "Fewer Topics" : `All Topics (${templates.length})`}
                {expanded ? <ChevronUp /> : <ChevronDown />}
              </Button>
            ) : null}
          </div>
          <div
            id="start-new-tiles"
            ref={tilesRef}
            className="grid gap-x-4 gap-y-6"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            <StartCard label="New Worksheet" sub="Add Sections as you go" onClick={onNewWorksheet}>
              <BlankThumb />
            </StartCard>
            {shown.map((g) => (
              <StartCard
                key={g.id}
                label={g.title}
                sub={g.unit}
                title={g.title}
                onClick={() => onOpenTemplate(g.id)}
              >
                <TopicThumb topic={g} />
              </StartCard>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-6 pt-7 pb-12">
        {/* Recent */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-medium">
            {query ? `Worksheets matching “${query.trim()}”` : "Recent Worksheets"}
          </h2>
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="quiet" onClick={onOpen}>
              <FolderOpen /> Open a file…
            </Button>
            <Button
              variant="quiet"
              onClick={onBackupLibrary}
              disabled={recents.length === 0}
              title="Download one file holding every Worksheet in your Library"
            >
              <Download /> Back up Library
            </Button>
            <Button
              variant="quiet"
              onClick={onRestoreLibrary}
              title="Rebuild your Library from a Library Backup file"
            >
              <ArchiveRestore /> Restore…
            </Button>
          </div>
        </div>
        {recents.length === 0 ? (
          <div className="border-border-strong bg-card flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
            <FolderOpen className="text-subtle-foreground size-8" />
            <p className="text-foreground mt-3 font-medium">No Worksheets yet</p>
            <p className="text-muted-foreground mt-1 text-[13px]">
              Worksheets you create are saved automatically and show up here.
            </p>
          </div>
        ) : matching.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center">
            No Worksheets match “{query.trim()}”.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {matching.map((r) => (
              <RecentCard
                key={r.id}
                entry={r}
                onOpen={() => onOpenRecent(r.id)}
                onDelete={() => onDeleteRecent(r.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Library safety status, at the very bottom of the screen (or of the
          page, once the content is taller than the screen). */}
      {recents.length > 0 && (
        <footer>
          <div className="mx-auto max-w-[1180px] px-6 py-3">
            <StorageNote storage={storage} install={install} />
          </div>
        </footer>
      )}
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
      <p className="text-muted-foreground flex items-center gap-1.5 text-[12px]">
        <ShieldCheck className="size-3.5" />
        Your Library is stored persistently in this browser.
      </p>
    );
  }
  const howToInstall = install.showAppleHint ? " On iPad, tap Share, then Add to Home Screen." : "";
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] leading-relaxed">
      <p className="flex min-w-0 flex-1 items-start gap-1.5">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>
          This browser may clear your Library if storage runs low or site data
          is cleared. Install OpenAlg as an app and back up your Library now and
          then to keep your Worksheets safe.{howToInstall}
        </span>
      </p>
      {install.canInstall && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void install.install()}
          title="Install OpenAlg as an app so your Library is kept safe"
        >
          <MonitorDown /> Install app
        </Button>
      )}
    </div>
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
  const topic = getGenerator(entry.generatorId)?.title ?? "No Sections yet";
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
      className="group bg-card hover:border-border-strong hover:bg-hover relative flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors"
    >
      <div className="bg-muted text-muted-foreground grid size-10 shrink-0 place-content-center rounded-lg">
        <Sigma className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{entry.title}</div>
        <div className="text-muted-foreground truncate text-[12px]">
          {topic} · {entry.count} problem{entry.count === 1 ? "" : "s"}
        </div>
        <div className="text-subtle-foreground text-[11.5px]">
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
        className="text-muted-foreground hover:bg-hover hover:text-destructive absolute top-2 right-2 rounded-md p-1.5 opacity-0 transition-all group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function StartCard({
  label,
  sub,
  title,
  onClick,
  children,
}: {
  label: string;
  sub: string;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} title={title} className="group flex min-w-0 flex-col self-start text-left">
      <div className="group-hover:ring-primary group-focus-visible:ring-ring rounded-[4px] ring-offset-2 ring-offset-[var(--panel)] transition-shadow group-hover:ring-2 group-focus-visible:ring-2">
        {children}
      </div>
      <div className="mt-2.5 line-clamp-2 leading-snug font-medium">{label}</div>
      <div className="text-muted-foreground truncate text-[12px]">{sub}</div>
    </button>
  );
}
