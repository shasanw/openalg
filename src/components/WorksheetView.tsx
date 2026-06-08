// On-screen preview of a worksheet: header, directions, numbered problems, and
// an optional answer key. This is the screen counterpart to the Typst PDF.

import { Math } from "@/components/Math";
import type { Worksheet } from "@/engine/worksheet";

export function WorksheetView({
  worksheet,
  showAnswers,
}: {
  worksheet: Worksheet;
  showAnswers: boolean;
}) {
  return (
    <div className="space-y-4">
      <header className="space-y-1 border-b pb-3">
        <h2 className="text-xl font-semibold">{worksheet.title}</h2>
        <p className="text-muted-foreground text-sm">{worksheet.directions}</p>
      </header>

      <ol className="space-y-3">
        {worksheet.problems.map((p, i) => (
          <li key={i} className="flex items-baseline gap-3">
            <span className="text-muted-foreground w-6 shrink-0 text-right text-sm tabular-nums">
              {i + 1}.
            </span>
            <div className="space-y-1">
              <Math tex={p.prompt} />
              {showAnswers && (
                <div className="text-muted-foreground text-sm">
                  <Math tex={p.answer} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
