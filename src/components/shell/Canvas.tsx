// The center pane: a thin preview toolbar over a soft, dotted "desk" surface
// with the worksheet rendered as a real US-Letter page. The page keeps its
// 8.5 x 11 proportions at all times — it never shrinks to fit the content (short
// sheets leave honest whitespace at the bottom, exactly as they will print).

import { WorksheetView } from "@/components/WorksheetView";
import { Label } from "@/components/ui/label";
import type { Worksheet } from "@/engine/worksheet";

// A faint dot grid so the white page edges read clearly against the surface.
const DOT_SURFACE = {
  backgroundImage:
    "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
  backgroundSize: "22px 22px",
};

export function Canvas({
  worksheet,
  showAnswers,
  onToggleAnswers,
}: {
  worksheet: Worksheet | null;
  showAnswers: boolean;
  onToggleAnswers: (show: boolean) => void;
}) {
  return (
    <div className="bg-sidebar flex min-h-0 flex-col overflow-hidden rounded-xl border shadow-sm">
      <div className="bg-sidebar flex h-9 shrink-0 items-center justify-between border-b px-3.5">
        <span className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
          Preview
        </span>
        <Label className="text-muted-foreground gap-1.5 text-[13px] font-normal">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={showAnswers}
            onChange={(e) => onToggleAnswers(e.currentTarget.checked)}
          />
          Answer key
        </Label>
      </div>

      <div
        className="no-scrollbar bg-background relative min-h-0 flex-1 overflow-auto"
        style={DOT_SURFACE}
      >
        {worksheet ? (
          <div className="flex justify-center p-8 pb-24">
            {/* US-Letter page: aspect-locked, fixed width, never scales to content. */}
            <div className="font-paper aspect-[8.5/11] w-full max-w-[760px] rounded-sm bg-white px-[64px] py-[60px] shadow-[0_1px_2px_rgba(20,20,20,0.08),0_20px_46px_-18px_rgba(20,20,20,0.20)]">
              <WorksheetView worksheet={worksheet} showAnswers={showAnswers} />
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center px-8 text-center text-sm">
            Set your options on the right, then click&nbsp;
            <span className="text-foreground font-semibold">Generate</span>.
          </div>
        )}
      </div>
    </div>
  );
}
