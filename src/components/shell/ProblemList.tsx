// Per-problem curation (issue #4), relocated from an on-page hover toolbar into
// a compact list in the inspector. The center canvas now shows the faithful,
// paginated Typst pages (print-truth), which can't host interactive controls —
// so curation lives here: drag a row to REORDER, hover for RE-ROLL / REMOVE.
// This is the selection-driven model described in docs/ui-conventions.md.

import { useRef, useState, type ReactNode } from "react";
import { Dice5, GripVertical, X } from "lucide-react";
import { Math } from "@/components/Math";
import type { Worksheet } from "@/engine/worksheet";

export interface CurationHandlers {
  onReroll: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

export function ProblemList({
  worksheet,
  curation,
}: {
  worksheet: Worksheet;
  curation: CurationHandlers;
}) {
  // Drag-and-drop reorder. `dragFrom` (a ref) is the source index, read at drop
  // time so it never goes stale; `dragIndex`/`overIndex` drive the visuals.
  const dragFrom = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragging = dragIndex !== null;

  function endDrag() {
    dragFrom.current = null;
    setDragIndex(null);
    setOverIndex(null);
  }

  function rowClass(i: number): string {
    const base =
      "group relative flex items-center gap-1.5 rounded-md border px-1.5 py-1.5 transition-colors";
    if (dragIndex === i)
      return `${base} cursor-grabbing border-transparent opacity-40`;
    if (dragging && overIndex === i)
      return `${base} cursor-grabbing border-emerald-500 bg-emerald-50`;
    return `${base} cursor-grab border-transparent ${
      dragging ? "" : "hover:border-border hover:bg-accent/60"
    }`;
  }

  return (
    <ol className="flex flex-col gap-1">
      {worksheet.problems.map((p, i) => (
        <li
          key={i}
          className={rowClass(i)}
          draggable
          onDragStart={(e) => {
            dragFrom.current = i;
            setDragIndex(i);
            if (e.dataTransfer) {
              e.dataTransfer.effectAllowed = "move";
              // Firefox won't start a drag without some payload set.
              e.dataTransfer.setData("text/plain", String(i));
            }
          }}
          onDragEnter={() => setOverIndex(i)}
          onDragOver={(e) => {
            e.preventDefault();
            if (overIndex !== i) setOverIndex(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = dragFrom.current;
            if (from !== null && from !== i) curation.onReorder(from, i);
            endDrag();
          }}
          onDragEnd={endDrag}
        >
          <GripVertical className="text-muted-foreground/60 size-4 shrink-0" />
          <span className="text-muted-foreground w-5 shrink-0 text-right text-xs tabular-nums">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 overflow-x-auto text-[13px] text-neutral-900 dark:text-neutral-100">
            <Math tex={p.prompt} />
          </div>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <CtrlButton label="Re-roll problem" onClick={() => curation.onReroll(i)}>
              <Dice5 className="size-3.5" />
            </CtrlButton>
            <CtrlButton
              label="Remove problem"
              variant="danger"
              onClick={() => curation.onRemove(i)}
            >
              <X className="size-3.5" />
            </CtrlButton>
          </div>
        </li>
      ))}
    </ol>
  );
}

function CtrlButton({
  label,
  onClick,
  variant,
  children,
}: {
  label: string;
  onClick: () => void;
  variant?: "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={
        "flex size-6 items-center justify-center rounded text-neutral-500 transition-colors " +
        (variant === "danger"
          ? "hover:bg-red-50 hover:text-red-600"
          : "hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100")
      }
    >
      {children}
    </button>
  );
}
