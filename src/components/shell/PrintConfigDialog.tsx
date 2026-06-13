// Print / layout configuration, opened as a dialog from the top bar (per
// docs/ui-conventions.md: "Print config as dialogs from the top bar"). Edits the
// worksheet's PrintConfig; both the live preview and the exported PDF read from
// it, so changing a setting here is reflected identically in both (#7).

import type { PrintConfig } from "@/engine/worksheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PrintConfigDialog({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: PrintConfig;
  onChange: (next: PrintConfig) => void;
}) {
  const set = <K extends keyof PrintConfig>(key: K, v: PrintConfig[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print &amp; layout</DialogTitle>
          <DialogDescription>
            Applies to both the preview and the exported PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <Row label="Paper size">
            <Segmented
              value={value.paper}
              onChange={(v) => set("paper", v)}
              options={[
                { value: "us-letter", label: "Letter" },
                { value: "a4", label: "A4" },
                { value: "legal", label: "Legal" },
              ]}
            />
          </Row>

          <Row label="Orientation">
            <Segmented
              value={value.orientation}
              onChange={(v) => set("orientation", v)}
              options={[
                { value: "portrait", label: "Portrait" },
                { value: "landscape", label: "Landscape" },
              ]}
            />
          </Row>

          <Row label="Margins">
            <Segmented
              value={value.margin}
              onChange={(v) => set("margin", v)}
              options={[
                { value: "narrow", label: "Narrow" },
                { value: "normal", label: "Normal" },
                { value: "wide", label: "Wide" },
              ]}
            />
          </Row>

          <Row
            label="Work space"
            hint="Vertical room under each free-response problem."
          >
            <Segmented
              value={value.spacing}
              onChange={(v) => set("spacing", v)}
              options={[
                { value: "tight", label: "Tight" },
                { value: "normal", label: "Normal" },
                { value: "roomy", label: "Roomy" },
              ]}
            />
          </Row>

          <Row label="Page numbers">
            <Toggle
              checked={value.pageNumbers}
              onChange={(v) => set("pageNumbers", v)}
            />
          </Row>

          <Row label="Name / Date / Period">
            <Toggle
              checked={value.showNameDatePeriod}
              onChange={(v) => set("showNameDatePeriod", v)}
            />
          </Row>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A small segmented control for a string enum. */
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="bg-muted flex gap-0.5 rounded-lg border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-md px-2.5 text-[13px] font-medium transition-colors",
            value === o.value
              ? "bg-card text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A toggle-style switch for a boolean. */
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
