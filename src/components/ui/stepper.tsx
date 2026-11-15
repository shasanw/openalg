// A whole-number stepper: minus, a typed value, plus. The buttons disable at
// the limits, and a typed value is clamped into range when committed (on blur
// or Enter), so a half-typed number never reaches the Worksheet.

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  className,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Accessible name for the number field. */
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  function commit(n: number) {
    const next = Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : value;
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  const btn =
    "text-muted-foreground hover:bg-hover hover:text-foreground flex w-7 items-center justify-center disabled:pointer-events-none disabled:opacity-35";

  return (
    <div
      className={cn(
        "border-input bg-panel focus-within:border-ring inline-flex h-8 items-stretch overflow-hidden rounded-md border focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_24%,transparent)]",
        className,
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => commit(value - 1)}
        className={btn}
      >
        <Minus className="size-3.5" />
      </button>
      <input
        data-bare
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => commit(draft.trim() === "" ? value : Number(draft))}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft.trim() === "" ? value : Number(draft));
          if (e.key === "ArrowUp") {
            e.preventDefault();
            commit(value + 1);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            commit(value - 1);
          }
        }}
        className="border-input w-11 border-x bg-transparent text-center tabular-nums outline-none"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => commit(value + 1)}
        className={btn}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
