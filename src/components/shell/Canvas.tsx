// The center pane: a thin toolbar over a soft, dotted "desk" surface showing the
// worksheet as real, paginated US-Letter pages. These are the ACTUAL Typst
// pages compiled to SVG (one per sheet) — pixel-identical to the exported PDF
// and to what prints, and paginated exactly as it will print (#7). Curation
// (re-roll / remove / reorder) lives in the inspector's Problems list, not on
// the page, so this view is pure print-truth.

import { useEffect, useState } from "react";
import { buildTypstDocument } from "@/engine/typst";
import type { Worksheet } from "@/engine/worksheet";
import { platform } from "@/platform";
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
        {worksheet && worksheet.problems.length > 0 ? (
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

/**
 * Compiles the worksheet to Typst SVG (via the platform) and renders one page
 * per sheet. Debounced so rapid edits don't fire a compile on every keystroke;
 * the previous pages stay on screen while the next compile runs, so the view
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

  useEffect(() => {
    let cancelled = false;
    // Build the Typst source inside the debounce timer so rapid edits that are
    // superseded before the 200ms elapses don't pay for assembling a document
    // that's never compiled.
    const timer = setTimeout(() => {
      const doc = buildTypstDocument(worksheet, {
        keyFormat: showAnswers ? "full" : "none",
      });
      platform
        .renderPreview(doc)
        .then((svgs) => {
          if (cancelled) return;
          setPages(svgs);
          setError(null);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(String(e));
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [worksheet, showAnswers]);

  if (error) {
    return (
      <div className="text-destructive mx-auto max-w-[760px] p-8 text-sm whitespace-pre-wrap">
        Couldn&apos;t render the preview:
        {"\n"}
        {error}
      </div>
    );
  }

  if (!pages) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        Rendering preview…
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-6 pb-24">
      {pages.map((svg, i) => (
        <div
          key={i}
          // The Typst SVG carries its own page dimensions/viewBox; we cap the
          // width and let height scale, so each sheet shows at its true aspect.
          className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full w-full max-w-[760px] overflow-hidden rounded-sm bg-white shadow-[0_1px_2px_rgba(20,20,20,0.08),0_20px_46px_-18px_rgba(20,20,20,0.20)]"
          // Trusted: SVG is produced by our own Typst compile in the Rust core.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ))}
    </div>
  );
}
