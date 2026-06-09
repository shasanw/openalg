// The right pane. For now it holds the document-level generation options
// (schema-driven) plus the Generate / Regenerate actions. The contextual,
// selection-driven behavior (per-problem re-roll / remove / edit) is a staged
// follow-up — see docs/ui-conventions.md.

import { OptionsPanel } from "@/components/OptionsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Generator, ParamValues } from "@/engine/types";

const MAX_PROBLEMS = 50;

export function Inspector({
  generator,
  params,
  onParamsChange,
  count,
  onCountChange,
  onGenerate,
  onRegenerate,
  canRegenerate,
}: {
  generator: Generator;
  params: ParamValues;
  onParamsChange: (next: ParamValues) => void;
  count: number;
  onCountChange: (n: number) => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  canRegenerate: boolean;
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
