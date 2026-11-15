// A segmented control: a row of mutually exclusive options. The chosen one is a
// filled, raised chip (never just tinted text). It is a radio group, so arrow
// keys move the choice and only the chosen option is in the tab order.

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label isn't plain text. */
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = "md",
  full,
  label,
  className,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  /** Stretch to the container, splitting the width evenly. */
  full?: boolean;
  /** Accessible name for the group. */
  label?: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  function step(from: number, delta: number) {
    const at = enabled.indexOf(from);
    const next = enabled[(at + delta + enabled.length) % enabled.length];
    if (next === undefined) return;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "bg-track border-border-strong inline-flex rounded-md border p-0.5",
        full && "flex w-full",
        className,
      )}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.ariaLabel}
            title={o.title}
            disabled={o.disabled}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                step(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                step(i, -1);
              }
            }}
            className={cn(
              "rounded-[5px] px-2.5 font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40",
              size === "md" ? "h-7 text-[12.5px]" : "h-6 text-[12px]",
              full && "min-w-0 flex-1 truncate",
              on
                ? "bg-control-on text-foreground shadow-[0_0_0_1px_var(--border-strong),0_1px_2px_rgba(0,0,0,0.2)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
