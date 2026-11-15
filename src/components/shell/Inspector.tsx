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
import {
  MAX_VERSIONS,
  MIN_VERSIONS,
  type AnswerKeyFormat,
  type ResponseFormat,
  type ScrambleMode,
  type VersionSettings,
} from "@/engine/worksheet";
import { versionsAreIdentical } from "@/engine/versions";

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
  versions = null,
  onVersionsChange = () => {},
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
  /** Version count and Scramble Mode; null when no worksheet is open. */
  versions?: VersionSettings | null;
  onVersionsChange?: (next: VersionSettings) => void;
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

        {versions !== null && responseFormat !== null && (
          <>
            <Separator className="my-4" />
            <VersionsControls
              value={versions}
              onChange={onVersionsChange}
              identical={versionsAreIdentical({ versions, responseFormat })}
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
        <div className="text-muted-foreground font-medium">Question type</div>
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

const SCRAMBLE_MODE_OPTIONS: { value: ScrambleMode; label: string; hint: string }[] = [
  {
    value: "scramble-order",
    label: "Shuffle problem order",
    hint: "Same problems, in a different order within each section.",
  },
  {
    value: "scramble-choices",
    label: "Shuffle answer choices",
    hint: "Same problems in the same order; the multiple-choice letters move.",
  },
  {
    value: "new-questions",
    label: "New problems",
    hint: "Fresh problems from the same options. Hand-picked problems are replaced.",
  },
];

/**
 * How many Versions print (each with its own Answer Key) and how they differ.
 * Kept self-contained so it can move into the new editor layout (#30).
 */
function VersionsControls({
  value,
  onChange,
  identical,
}: {
  value: VersionSettings;
  onChange: (next: VersionSettings) => void;
  /** True when every Version would print the same (see versionsAreIdentical). */
  identical: boolean;
}) {
  const setCount = (count: number) =>
    onChange({ ...value, count: Math.min(MAX_VERSIONS, Math.max(MIN_VERSIONS, count)) });
  const mode = SCRAMBLE_MODE_OPTIONS.find((o) => o.value === value.mode)!;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground font-medium">Versions</span>
        <div className="flex items-center gap-1" role="group" aria-label="Versions">
          <Button
            variant="outline"
            size="sm"
            className="size-7 px-0"
            aria-label="Fewer versions"
            disabled={value.count <= MIN_VERSIONS}
            onClick={() => setCount(value.count - 1)}
          >
            −
          </Button>
          <span className="w-6 text-center tabular-nums" aria-live="polite">
            {value.count}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="size-7 px-0"
            aria-label="More versions"
            disabled={value.count >= MAX_VERSIONS}
            onClick={() => setCount(value.count + 1)}
          >
            +
          </Button>
        </div>
      </div>
      {value.count > 1 && (
        <Label className="flex-col items-start gap-1.5">
          <span className="text-muted-foreground font-medium">Versions differ by</span>
          <select
            value={value.mode}
            onChange={(e) =>
              onChange({ ...value, mode: e.currentTarget.value as ScrambleMode })
            }
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
          >
            {SCRAMBLE_MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-xs font-normal">{mode.hint}</span>
          {identical && (
            <span role="note" className="text-xs font-normal text-amber-700 dark:text-amber-400">
              These are free-response problems, so every version will print the same. Switch
              to multiple choice, or pick another option.
            </span>
          )}
        </Label>
      )}
      {value.count > 1 && (
        <p className="text-muted-foreground text-xs">
          Printing gives every version, then each version&apos;s answer key.
        </p>
      )}
    </div>
  );
}
