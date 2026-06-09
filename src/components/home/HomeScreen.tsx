// The launch screen, shown when no document is open. Word-style: "start new"
// (blank worksheet / test + topic templates) on top, recent documents below.
// Recents are a stub until persistence (#3) lands a recent-files store.

import { FolderOpen, Plus, Search, Settings, Sigma } from "lucide-react";
import { GENERATORS } from "@/engine/registry";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen({
  onNewWorksheet,
  onOpenTemplate,
  onOpen,
}: {
  onNewWorksheet: () => void;
  onOpenTemplate: (generatorId: string) => void;
  onOpen: () => void;
}) {
  return (
    <div className="bg-background h-screen overflow-y-auto">
      <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-6 backdrop-blur">
        <span className="from-primary/85 to-primary grid size-7 place-content-center rounded-lg bg-gradient-to-br text-white shadow-sm">
          <Sigma className="size-4" />
        </span>
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
        <SectionTitle>Recent</SectionTitle>
        <div className="border-border bg-card flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <FolderOpen className="text-muted-foreground/60 size-8" />
          <p className="text-foreground mt-3 text-sm font-medium">
            No worksheets yet
          </p>
          <p className="text-muted-foreground mt-1 text-[13px]">
            Saved worksheets will show up here.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={onOpen}>
            <FolderOpen /> Open a worksheet…
          </Button>
        </div>
      </main>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground mt-9 mb-4 text-xs font-bold tracking-wide uppercase">
      {children}
    </h2>
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
      <div className="border-border text-primary flex aspect-[8.5/11] items-center justify-center rounded-lg border border-dashed bg-white">
        <Plus className="size-7" />
      </div>
    );
  }
  // Abstract "mini paper" preview lines.
  const Line = ({ w }: { w: string }) => (
    <div className={cn("bg-border mb-1.5 h-1 rounded-full", w)} />
  );
  return (
    <div className="border-border/70 relative aspect-[8.5/11] overflow-hidden rounded-lg border bg-white p-3">
      {test && (
        <span className="text-chart-2 bg-chart-2/10 absolute top-2 right-2 rounded px-1.5 text-[8px] font-bold">
          A · B
        </span>
      )}
      <div className="bg-muted-foreground/40 mb-2.5 h-1.5 w-3/5 rounded-full" />
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
