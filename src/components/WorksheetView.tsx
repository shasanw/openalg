// On-screen preview of a worksheet, laid out like the printed page: a header
// (chapter eyebrow + title + name/date/period blanks), a rule, the directions,
// and the numbered problems in two columns. This is the screen counterpart to
// the Typst PDF. Math is rendered with KaTeX (its own Computer Modern font); the
// surrounding text inherits the page's `.font-paper` (also KaTeX's font).

import type { ReactNode } from "react";
import { ChevronUp, ChevronDown, Dice5, X } from "lucide-react";
import { Math } from "@/components/Math";
import { getGenerator } from "@/engine/registry";
import type { Worksheet } from "@/engine/worksheet";

/**
 * Per-problem curation callbacks (issue #4). When supplied, each problem grows a
 * screen-only hover toolbar (re-roll / move / remove). These controls are absent
 * from the printed PDF — they live only in this interactive preview — and are
 * absolutely positioned so they never disturb the page's column flow.
 */
export interface CurationHandlers {
  onReroll: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
}

export function WorksheetView({
  worksheet,
  showAnswers,
  curation,
}: {
  worksheet: Worksheet;
  showAnswers: boolean;
  curation?: CurationHandlers;
}) {
  const chapter = getGenerator(worksheet.generatorId)?.chapter ?? "";
  const last = worksheet.problems.length - 1;

  return (
    <div className="text-[15px] leading-snug text-neutral-900">
      <header className="flex items-start justify-between gap-6">
        <div>
          {chapter && (
            <div className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
              {chapter}
            </div>
          )}
          <h2 className="mt-1 text-2xl font-bold">{worksheet.title}</h2>
        </div>
        <div className="shrink-0 text-right text-[13px] leading-[2] whitespace-nowrap text-neutral-600">
          <div>
            Name
            <span className="ml-2 inline-block min-w-24 border-b border-neutral-300 align-baseline" />
          </div>
          <div>
            Date
            <span className="mx-2 inline-block min-w-16 border-b border-neutral-300 align-baseline" />
            Period
            <span className="ml-2 inline-block min-w-8 border-b border-neutral-300 align-baseline" />
          </div>
        </div>
      </header>

      <div className="mt-4 mb-1 h-0.5 bg-neutral-800" />

      <p className="mt-4 mb-4 font-semibold">{worksheet.directions}</p>

      <ol className="columns-2 gap-10 [column-fill:balance]">
        {worksheet.problems.map((p, i) => (
          <li
            key={i}
            className="group relative mb-4 flex break-inside-avoid items-baseline gap-2.5"
          >
            <span className="shrink-0 text-neutral-400 tabular-nums">
              {i + 1})
            </span>
            <div className="min-w-0">
              <Math tex={p.prompt} />
              {showAnswers && (
                <div className="text-primary mt-1 text-[13px] font-semibold">
                  <Math tex={p.answer} />
                </div>
              )}
            </div>
            {curation && (
              <ProblemControls
                index={i}
                isFirst={i === 0}
                isLast={i === last}
                {...curation}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Floating hover toolbar for one problem: re-roll, move up/down, remove. */
function ProblemControls({
  index,
  isFirst,
  isLast,
  onReroll,
  onMove,
  onRemove,
}: { index: number; isFirst: boolean; isLast: boolean } & CurationHandlers) {
  return (
    <div
      className="absolute -top-2.5 right-0 z-10 flex items-center gap-0.5 rounded-md border border-neutral-200 bg-white p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100"
      // Controls are interactive chrome, not worksheet content — never printed.
      data-no-print
    >
      <CtrlButton label="Re-roll problem" onClick={() => onReroll(index)}>
        <Dice5 className="size-3.5" />
      </CtrlButton>
      <CtrlButton
        label="Move up"
        disabled={isFirst}
        onClick={() => onMove(index, -1)}
      >
        <ChevronUp className="size-3.5" />
      </CtrlButton>
      <CtrlButton
        label="Move down"
        disabled={isLast}
        onClick={() => onMove(index, 1)}
      >
        <ChevronDown className="size-3.5" />
      </CtrlButton>
      <CtrlButton
        label="Remove problem"
        variant="danger"
        onClick={() => onRemove(index)}
      >
        <X className="size-3.5" />
      </CtrlButton>
    </div>
  );
}

function CtrlButton({
  label,
  onClick,
  disabled,
  variant,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={
        "flex size-6 items-center justify-center rounded text-neutral-500 transition-colors disabled:pointer-events-none disabled:opacity-30 " +
        (variant === "danger"
          ? "hover:bg-red-50 hover:text-red-600"
          : "hover:bg-neutral-100 hover:text-neutral-900")
      }
    >
      {children}
    </button>
  );
}
