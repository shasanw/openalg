// The center pane: the exact Preview on a neutral desk, under a toolbar that
// switches between the Student copy and the Answer Key and sets the zoom. The
// pages are the ACTUAL Typst pages compiled to SVG (one per sheet), identical
// to the exported PDF and to what prints (#7).

import { memo, useEffect, useState } from "react";
import { FilePlus2, Minus, Plus } from "lucide-react";
import { buildTypstDocument } from "@/engine/typst";
import type { Worksheet } from "@/engine/worksheet";
import { versionCount, versionLetter } from "@/engine/versions";
import { platform } from "@/platform";
import { RenderSupersededError, type RendererStatus } from "@/platform/types";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { ANSWER_KEY_LABELS } from "@/components/shell/answerKey";
import { MOD_KEY } from "@/components/shell/SectionOutline";

/** Which copy the Preview shows. */
export type PreviewView = "student" | "key";

export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** A page's on-screen width at 100% zoom, in CSS pixels. */
const PAGE_WIDTH = 760;

export function Preview({
  worksheet,
  view,
  onViewChange,
  zoom,
  onZoomChange,
  onAddSection,
}: {
  worksheet: Worksheet;
  view: PreviewView;
  onViewChange: (view: PreviewView) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onAddSection: () => void;
}) {
  const format = worksheet.answerKeyFormat;
  const noKey = format === "none";
  const empty = worksheet.sections.length === 0;
  const zi = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
  // Which Version the Preview shows (Print and Export PDF emit them all).
  // Clamped so lowering the Version count falls back to the last Version.
  const [previewVersion, setPreviewVersion] = useState(0);
  const versions = versionCount(worksheet);
  const shownVersion = Math.min(previewVersion, versions - 1);

  return (
    <main aria-label="Preview" className="flex min-h-0 min-w-0 flex-col">
      <div className="bg-panel flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3">
        <Segmented
          size="sm"
          label="Preview"
          value={noKey ? "student" : view}
          onChange={onViewChange}
          options={[
            { value: "student", label: "Student copy" },
            {
              value: "key",
              label: `Answer Key · ${ANSWER_KEY_LABELS[format].name}`,
              disabled: noKey || empty,
              title: noKey ? "This Worksheet prints no Answer Key" : undefined,
            },
          ]}
        />
        <div className="flex items-center gap-1">
          {versions > 1 && !empty && (
            <Segmented
              size="sm"
              label="Previewed Version"
              value={shownVersion}
              onChange={setPreviewVersion}
              options={Array.from({ length: versions }, (_, i) => ({
                value: i,
                label: versionLetter(i),
                ariaLabel: `Version ${versionLetter(i)}`,
              }))}
              className="mr-2"
            />
          )}
          <div role="group" aria-label="Zoom" className="flex items-center">
            <Button
              variant="quiet"
              size="icon-sm"
              aria-label="Zoom out"
              disabled={zi <= 0}
              onClick={() => onZoomChange(ZOOM_STEPS[Math.max(0, zi - 1)])}
            >
              <Minus />
            </Button>
            <Button
              variant="quiet"
              size="sm"
              className="w-14 tabular-nums"
              title="Reset zoom to 100%"
              aria-label={`Zoom ${Math.round(zoom * 100)}%, reset to 100%`}
              onClick={() => onZoomChange(1)}
            >
              {Math.round(zoom * 100)}%
            </Button>
            <Button
              variant="quiet"
              size="icon-sm"
              aria-label="Zoom in"
              disabled={zi >= ZOOM_STEPS.length - 1}
              onClick={() => onZoomChange(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, zi + 1)])}
            >
              <Plus />
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-canvas relative min-h-0 flex-1 overflow-auto">
        {empty ? (
          <EmptyWorksheet onAddSection={onAddSection} />
        ) : (
          <Pages
            worksheet={worksheet}
            showAnswers={!noKey && view === "key"}
            version={shownVersion}
            zoom={zoom}
          />
        )}
      </div>
    </main>
  );
}

/** A new Worksheet with no Sections: invite the teacher to add the first one. */
function EmptyWorksheet({ onAddSection }: { onAddSection: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="bg-panel border-border-strong flex max-w-[380px] flex-col items-center rounded-xl border border-dashed px-8 py-10 text-center">
        <div className="bg-selected text-accent-text mb-4 grid size-11 place-content-center rounded-lg">
          <FilePlus2 className="size-5" />
        </div>
        <h2 className="text-[15px] font-semibold">Add your first Section</h2>
        <p className="text-muted-foreground mt-1.5 leading-relaxed">
          A Section is a run of Problems from one Topic. Add as many as you need;
          Problem numbers continue from one Section to the next.
        </p>
        <Button variant="primary" className="mt-5" onClick={onAddSection}>
          <Plus /> Add Section
        </Button>
        <p className="text-subtle-foreground mt-3 flex items-center gap-1.5 text-[12px]">
          or press <Kbd>{MOD_KEY}K</Kbd>
        </p>
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
      className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
    >
      <span className="text-foreground">Getting the Preview ready…</span>
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
export function Pages({
  worksheet,
  showAnswers,
  version = 0,
  zoom = 1,
}: {
  worksheet: Worksheet;
  showAnswers: boolean;
  /** Which Version to show: one at a time, with its own Answer Key. */
  version?: number;
  zoom?: number;
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
        version,
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
  }, [worksheet, showAnswers, version, attempt]);

  if (error) {
    return (
      <div className="text-destructive mx-auto flex max-w-[760px] flex-col items-start gap-3 p-8 whitespace-pre-wrap">
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
      <div className="text-muted-foreground flex h-full items-center justify-center">
        Rendering the Preview…
      </div>
    );
  }

  return (
    // min-w-fit lets a zoomed-in page widen the scroll area instead of being
    // clipped on the left by the centering.
    <div className="flex min-w-fit flex-col items-center gap-6 p-6 pb-24">
      {pages.map((svg, i) => (
        <Page key={i} svg={svg} width={PAGE_WIDTH * zoom} fit={zoom <= 1} />
      ))}
    </div>
  );
}

/**
 * One sheet. Memoized on its SVG so an edit that leaves a page unchanged
 * doesn't replace that page's DOM.
 */
const Page = memo(function Page({
  svg,
  width,
  fit,
}: {
  svg: string;
  width: number;
  /** Shrink to the pane when it is narrower than `width`. */
  fit: boolean;
}) {
  return (
    <div
      // The Typst SVG carries its own page dimensions/viewBox; we set the
      // width and let height scale, so each sheet shows at its true aspect.
      style={{ width, maxWidth: fit ? "100%" : undefined }}
      className="shrink-0 overflow-hidden rounded-sm bg-white shadow-[var(--shadow-page)] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      // Trusted: SVG is produced by our own Typst compile (the Web Worker).
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});
