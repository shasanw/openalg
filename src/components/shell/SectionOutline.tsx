// The left pane: the Worksheet's Sections in printed order. Each row shows the
// Section's letter, its Topic, the Problem numbers it prints as and its Unit.
// The selected row is the highest-contrast fill on screen. Arrow keys move
// between rows; Alt+Arrow moves the Section itself.

import { useRef } from "react";
import { Plus } from "lucide-react";
import { getGenerator } from "@/engine/registry";
import { sectionLetter, sectionRanges, type ProblemRange, type Worksheet } from "@/engine/worksheet";
import { Button } from "@/components/ui/button";
import { GroupLabel, Kbd } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** "Problems 9–14", "Problem 3" or "No problems" for an outline row. */
export function rangeLabel({ first, last }: ProblemRange): string {
  if (last < first) return "No problems";
  if (last === first) return `Problem ${first}`;
  return `Problems ${first}–${last}`;
}

/** The platform's shortcut modifier, for hints: ⌘ on Apple devices, Ctrl elsewhere. */
export const MOD_KEY =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "") ? "⌘" : "Ctrl ";

export function SectionOutline({
  worksheet,
  selected,
  onSelect,
  onMove,
  onAdd,
}: {
  worksheet: Worksheet;
  selected: number;
  onSelect: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onAdd: () => void;
}) {
  const ranges = sectionRanges(worksheet);
  const total = ranges.at(-1)?.last ?? 0;
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const n = worksheet.sections.length;

  function focusRow(i: number) {
    // After a move the rows re-render; focus once the DOM has the new order.
    requestAnimationFrame(() => rows.current[i]?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const j = i + delta;
    if (j < 0 || j >= n) return;
    if (e.altKey) onMove(i, j);
    else onSelect(j);
    focusRow(j);
  }

  return (
    <aside aria-label="Sections" className="bg-panel flex min-h-0 flex-col border-r">
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
        <GroupLabel>Sections</GroupLabel>
        <span className="text-muted-foreground text-[12px] tabular-nums">
          {total} problem{total === 1 ? "" : "s"}
        </span>
      </div>

      <ol className="min-h-0 flex-1 overflow-y-auto p-2">
        {n === 0 && (
          <li className="text-muted-foreground px-2 py-3 leading-snug">
            No Sections yet. Each Section is a run of Problems from one Topic.
          </li>
        )}
        {worksheet.sections.map((section, i) => {
          const topic = getGenerator(section.generatorId);
          const on = i === selected;
          return (
            <li key={i}>
              <button
                ref={(el) => {
                  rows.current[i] = el;
                }}
                type="button"
                aria-current={on ? "true" : undefined}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                tabIndex={on ? 0 : -1}
                onClick={() => onSelect(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={cn(
                  "mb-1 flex w-full gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors",
                  on
                    ? "border-selected-border bg-selected text-selected-foreground"
                    : "hover:bg-hover border-transparent",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-px flex h-5 min-w-5 shrink-0 items-center justify-center rounded px-1 text-[11px] font-semibold tabular-nums",
                    on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {sectionLetter(i)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="sr-only">Section {sectionLetter(i)}: </span>
                  <span className="block truncate font-medium">{topic?.title ?? section.generatorId}</span>
                  <span
                    className={cn(
                      "block truncate text-[12px] tabular-nums",
                      on ? "text-selected-muted" : "text-muted-foreground",
                    )}
                  >
                    {rangeLabel(ranges[i])}
                    {topic && ` · ${topic.chapter}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="border-t p-2">
        <Button className="w-full" onClick={onAdd} aria-keyshortcuts="Meta+K Control+K">
          <Plus /> Add Section
          <Kbd className="ml-auto">{MOD_KEY}K</Kbd>
        </Button>
      </div>
    </aside>
  );
}
