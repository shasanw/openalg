// The center pane: a thin toolbar over a soft, dotted "desk" surface showing the
// worksheet as real, paginated US-Letter pages. These are the ACTUAL Typst
// pages compiled to SVG (one per sheet) — pixel-identical to the exported PDF
// and to what prints, and paginated exactly as it will print (#7). Curation
// (re-roll / remove / reorder) lives in the inspector's Problems list, not on
// the page, so this view is pure print-truth.

import { memo, useEffect, useState } from "react";
import { buildTypstDocument } from "@/engine/typst";
import { problemCount, type Worksheet } from "@/engine/worksheet";
import { platform } from "@/platform";
import { RenderSupersededError, type RendererStatus } from "@/platform/types";
import { Label } from "@/components/ui/label";

// A faint dot grid so the white page edges read clearly against the surface.
const DOT_SURFACE = {
  backgroundImage:
    "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
  backgroundSize: "22px 22px",
};

export function Canvas({
  worksheet,
  showAnswers,
  onToggleAnswers,
}: {
  worksheet: Worksheet | null;
  showAnswers: boolean;
  onToggleAnswers: (show: boolean) => void;
}) {
  return (
    <div className="bg-sidebar flex min-h-0 flex-col overflow-hidden rounded-xl border shadow-sm">
      <div className="bg-sidebar flex h-9 shrink-0 items-center justify-between border-b px-3.5">
        <span className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
          Preview
        </span>
        <Label className="text-muted-foreground gap-1.5 text-[13px] font-normal">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={showAnswers}
            onChange={(e) => onToggleAnswers(e.currentTarget.checked)}
          />
          Answer key
        </Label>
      </div>

      <div
        className="no-scrollbar bg-background relative min-h-0 flex-1 overflow-auto"
        style={DOT_SURFACE}
      >
        {worksheet && problemCount(worksheet) > 0 ? (
          <Pages worksheet={worksheet} showAnswers={showAnswers} />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center px-8 text-center text-sm">
            Set your options on the right, then click&nbsp;
            <span className="text-foreground font-semibold">Generate</span>.
          </div>
        )}
      </div>
    </div>
  );
}

/** The Preview compiler's loading status, live. */
function useRendererStatus(): RendererStatus {
  const [status, setStatus] = useState<RendererStatus>({ state: "ready" });
  useEffect(() => platform.onRendererStatus(setStatus), []);
  return status;
}

const MB = 1024 * 1024;

/**
 * Shown on a first visit while the Typst compiler (WASM + fonts) downloads.
 * The download starts when the app opens, so this is often already done.
 */
function LoadingCompiler({ loaded, total }: { loaded: number; total: number }) {
  const fraction = total > 0 ? Math.min(1, loaded / total) : 0;
  return (
    <div
      role="status"
      aria-live="polite"
      className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-sm"
    >
      <span>Getting the Preview ready…</span>
      <div
        className="bg-border h-1.5 w-56 overflow-hidden rounded-full"
        role="progressbar"
        aria-label="Downloading the Preview"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-200"
          style={{ width: `${Math.max(4, fraction * 100)}%` }}
        />
      </div>
      <span className="text-xs">
        {total > 0
          ? `${(loaded / MB).toFixed(1)} of ${(total / MB).toFixed(1)} MB. Only the first visit downloads this.`
          : "Only the first visit downloads this."}
      </span>
    </div>
  );
}

/**
 * Compiles the worksheet to Typst SVG (via the platform) and renders one page
 * per sheet. Debounced so rapid edits don't fire a compile on every keystroke,
 * and latest-wins so a superseded compile never reaches the screen; the
 * previous pages stay on screen while the next compile runs, so the view
 * doesn't flash blank between edits.
 */
function Pages({
  worksheet,
  showAnswers,
}: {
  worksheet: Worksheet;
  showAnswers: boolean;
}) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const status = useRendererStatus();

  useEffect(() => {
    let cancelled = false;
    // Build the Typst source inside the debounce timer so rapid edits that are
    // superseded before the delay elapses don't pay for assembling a document
    // that's never compiled. A warm compile takes a few ms, so the delay is
    // short.
    const timer = setTimeout(() => {
      const doc = buildTypstDocument(worksheet, {
        // Showing answers previews the Worksheet's own Answer Key format,
        // exactly as it will print; hiding them previews the student copy.
        keyFormat: showAnswers ? undefined : "none",
      });
      platform
        .renderPreview(doc, { latestWins: true })
        .then((svgs) => {
          if (cancelled) return;
          setPages(svgs);
          setError(null);
        })
        .catch((e) => {
          if (cancelled || e instanceof RenderSupersededError) return;
          setError(e instanceof Error ? e.message : String(e));
        });
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [worksheet, showAnswers, attempt]);

  if (error) {
    return (
      <div className="text-destructive mx-auto flex max-w-[760px] flex-col items-start gap-3 p-8 text-sm whitespace-pre-wrap">
        <span>
          Couldn&apos;t render the preview:
          {"\n"}
          {error}
        </span>
        <button
          type="button"
          className="text-foreground rounded-md border px-3 py-1.5 text-[13px] font-medium"
          onClick={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!pages) {
    if (status.state === "loading") {
      return <LoadingCompiler loaded={status.loaded} total={status.total} />;
    }
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        Rendering preview…
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-6 pb-24">
      {pages.map((svg, i) => (
        <Page key={i} svg={svg} />
      ))}
    </div>
  );
}

/**
 * One sheet. Memoized on its SVG so an edit that leaves a page unchanged
 * doesn't replace that page's DOM.
 */
const Page = memo(function Page({ svg }: { svg: string }) {
  return (
    <div
      // The Typst SVG carries its own page dimensions/viewBox; we cap the
      // width and let height scale, so each sheet shows at its true aspect.
      className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full w-full max-w-[760px] overflow-hidden rounded-sm bg-white shadow-[0_1px_2px_rgba(20,20,20,0.08),0_20px_46px_-18px_rgba(20,20,20,0.20)]"
      // Trusted: SVG is produced by our own Typst compile (the Web Worker).
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});
