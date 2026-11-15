// The right pane. For now it holds the document-level generation options
// (schema-driven) plus the Generate / Regenerate actions. The contextual,
// selection-driven behavior (per-problem re-roll / remove / edit) is a staged
// follow-up — see docs/ui-conventions.md.

import { OptionsPanel } from "@/components/OptionsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Segmented } from "@/components/shell/PrintConfigDialog";
import { MAX_CHOICES, MIN_CHOICES } from "@/engine/mc";
import type { Generator, ParamValues } from "@/engine/types";
import type { AnswerKeyFormat, ResponseFormat } from "@/engine/worksheet";

const CHOICE_COUNTS = Array.from(
  { length: MAX_CHOICES - MIN_CHOICES + 1 },
  (_, i) => String(MIN_CHOICES + i),
);

const MAX_PROBLEMS = 50;

export function Inspector({
  generator,
  params,
  onParamsChange,
  directions,
  onDirectionsChange,
  responseFormat,
  onResponseFormatChange,
  answerKeyFormat,
  onAnswerKeyFormatChange,
  count,
  onCountChange,
  onGenerate,
  onRegenerate,
  canRegenerate,
}: {
  generator: Generator;
  params: ParamValues;
  onParamsChange: (next: ParamValues) => void;
  /** Worksheet directions; null when no worksheet is open yet. */
  directions: string | null;
  onDirectionsChange: (next: string) => void;
  /** Whole-sheet free response / multiple choice; null when no worksheet is open. */
  responseFormat: ResponseFormat | null;
  onResponseFormatChange: (next: ResponseFormat) => void;
  /** The Worksheet's Answer Key format; null when no worksheet is open. */
  answerKeyFormat: AnswerKeyFormat | null;
  onAnswerKeyFormatChange: (next: AnswerKeyFormat) => void;
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

        {responseFormat !== null && (
          <>
            <Separator className="my-4" />
            <ResponseFormatControls
              value={responseFormat}
              onChange={onResponseFormatChange}
            />
          </>
        )}

        {answerKeyFormat !== null && (
          <>
            <Separator className="my-4" />
            <AnswerKeyControls
              value={answerKeyFormat}
              onChange={onAnswerKeyFormatChange}
            />
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

/** Free response / multiple choice for the whole sheet, plus the choice count. */
function ResponseFormatControls({
  value,
  onChange,
}: {
  value: ResponseFormat;
  onChange: (next: ResponseFormat) => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1.5">
        <div className="text-muted-foreground font-medium">Answer format</div>
        <Segmented
          value={value.mode}
          onChange={(mode) => onChange({ ...value, mode })}
          options={[
            { value: "free-response", label: "Free response" },
            { value: "multiple-choice", label: "Multiple choice" },
          ]}
        />
      </div>
      {value.mode === "multiple-choice" && (
        <div className="space-y-1.5">
          <div className="text-muted-foreground font-medium">
            Choices per problem
          </div>
          <Segmented
            value={String(value.choices)}
            onChange={(n) => onChange({ ...value, choices: Number(n) })}
            options={CHOICE_COUNTS.map((n) => ({ value: n, label: n }))}
          />
        </div>
      )}
    </div>
  );
}

const ANSWER_KEY_HINTS: Record<AnswerKeyFormat, string> = {
  full: "Every answer, on its own page after the problems.",
  odds: "Answers to odd-numbered problems only.",
  "in-context": "A copy of the worksheet with each answer under its problem.",
  none: "No answer key is printed.",
};

/** Which Answer Key prints after the Problems: full, odds only, in context, none. */
function AnswerKeyControls({
  value,
  onChange,
}: {
  value: AnswerKeyFormat;
  onChange: (next: AnswerKeyFormat) => void;
}) {
  return (
    <div className="space-y-1.5 text-sm">
      <div className="text-muted-foreground font-medium">Answer key</div>
      <Segmented
        value={value}
        onChange={onChange}
        options={[
          { value: "full", label: "Full" },
          { value: "odds", label: "Odds" },
          { value: "in-context", label: "In context" },
          { value: "none", label: "None" },
        ]}
      />
      <p className="text-muted-foreground text-xs">{ANSWER_KEY_HINTS[value]}</p>
    </div>
  );
}
