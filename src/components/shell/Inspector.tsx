// The right pane. For now it holds the document-level generation options
// (schema-driven) plus the Generate / Regenerate actions. The contextual,
// selection-driven behavior (per-problem re-roll / remove / edit) is a staged
// follow-up — see docs/ui-conventions.md.

import { OptionsPanel } from "@/components/OptionsPanel";
import { ProblemList, type CurationHandlers } from "@/components/shell/ProblemList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Generator, ParamValues } from "@/engine/types";
import type { Worksheet } from "@/engine/worksheet";

const MAX_PROBLEMS = 50;

export function Inspector({
  generator,
  params,
  onParamsChange,
  directions,
  onDirectionsChange,
  count,
  onCountChange,
  onGenerate,
  onRegenerate,
  canRegenerate,
  worksheet,
  curation,
}: {
  generator: Generator;
  params: ParamValues;
  onParamsChange: (next: ParamValues) => void;
  /** Worksheet directions; null when no worksheet is open yet. */
  directions: string | null;
  onDirectionsChange: (next: string) => void;
  count: number;
  onCountChange: (n: number) => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  canRegenerate: boolean;
  /** Open worksheet (for the Problems curation list); null before first generate. */
  worksheet: Worksheet | null;
  curation: CurationHandlers;
}) {
  return (
    <aside className="bg-sidebar flex min-h-0 flex-col overflow-hidden rounded-xl border shadow-sm">
      <div className="text-muted-foreground flex h-9 shrink-0 items-center border-b px-3.5 text-[11px] font-bold tracking-wide uppercase">
        Options
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        <OptionsPanel
          schema={generator.schema}
          values={params}
          onChange={onParamsChange}
        />

        {directions !== null && (
          <>
            <Separator className="my-4" />
            <Label className="flex-col items-start gap-1.5">
              <span className="text-muted-foreground font-medium">
                Directions
              </span>
              <textarea
                value={directions}
                onChange={(e) => onDirectionsChange(e.currentTarget.value)}
                rows={2}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-16 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px]"
              />
            </Label>
          </>
        )}

        <Separator className="my-4" />

        <Label className="flex-col items-start gap-1.5">
          <span className="text-muted-foreground font-medium">
            Number of problems
          </span>
          <Input
            type="number"
            min={1}
            max={MAX_PROBLEMS}
            value={count}
            onChange={(e) => {
              const n = Math.round(Number(e.currentTarget.value));
              if (!Number.isNaN(n)) {
                onCountChange(Math.min(MAX_PROBLEMS, Math.max(1, n)));
              }
            }}
          />
        </Label>

        {worksheet && worksheet.problems.length > 0 && (
          <>
            <Separator className="my-4" />
            <div className="mb-2 flex items-center justify-between">
              <span className="text-muted-foreground text-sm font-medium">
                Problems
              </span>
              <span className="text-muted-foreground/70 text-xs">
                drag to reorder
              </span>
            </div>
            <ProblemList worksheet={worksheet} curation={curation} />
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t p-3.5">
        <Button onClick={onGenerate}>Generate</Button>
        <Button
          variant="outline"
          onClick={onRegenerate}
          disabled={!canRegenerate}
        >
          Regenerate all
        </Button>
      </div>
    </aside>
  );
}
