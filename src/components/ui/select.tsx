// A styled select. It keeps the native <select> underneath (so the OS picker,
// keyboard and screen readers all work) with our own border, focus and chevron.

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Select<T extends string>({
  value,
  options,
  onChange,
  id,
  label,
  className,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  id?: string;
  /** Accessible name when no <label htmlFor> points at it. */
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as T)}
        className="border-input bg-panel text-foreground hover:border-border-strong h-8 w-full cursor-pointer appearance-none rounded-md border pr-8 pl-2.5 transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2" />
    </div>
  );
}
