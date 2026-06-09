// On-screen preview of a worksheet, laid out like the printed page: a header
// (chapter eyebrow + title + name/date/period blanks), a rule, the directions,
// and the numbered problems in two columns. This is the screen counterpart to
// the Typst PDF. Math is rendered with KaTeX (its own Computer Modern font); the
// surrounding text inherits the page's `.font-paper` (also KaTeX's font).

import { Math } from "@/components/Math";
import { getGenerator } from "@/engine/registry";
import type { Worksheet } from "@/engine/worksheet";

export function WorksheetView({
  worksheet,
  showAnswers,
}: {
  worksheet: Worksheet;
  showAnswers: boolean;
}) {
  const chapter = getGenerator(worksheet.generatorId)?.chapter ?? "";

  return (
    <div className="text-[15px] leading-snug text-neutral-900">
      <header className="flex items-start justify-between gap-6">
        <div>
          {chapter && (
            <div className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
              {chapter}
            </div>
          )}
          <h2 className="mt-1 text-2xl font-bold">{worksheet.title}</h2>
        </div>
        <div className="shrink-0 text-right text-[13px] leading-[2] whitespace-nowrap text-neutral-600">
          <div>
            Name
            <span className="ml-2 inline-block min-w-24 border-b border-neutral-300 align-baseline" />
          </div>
          <div>
            Date
            <span className="mx-2 inline-block min-w-16 border-b border-neutral-300 align-baseline" />
            Period
            <span className="ml-2 inline-block min-w-8 border-b border-neutral-300 align-baseline" />
          </div>
        </div>
      </header>

      <div className="mt-4 mb-1 h-0.5 bg-neutral-800" />

      <p className="mt-4 mb-4 font-semibold">{worksheet.directions}</p>

      <ol className="columns-2 gap-10 [column-fill:balance]">
        {worksheet.problems.map((p, i) => (
          <li
            key={i}
            className="mb-4 flex break-inside-avoid items-baseline gap-2.5"
          >
            <span className="shrink-0 text-neutral-400 tabular-nums">
              {i + 1})
            </span>
            <div className="min-w-0">
              <Math tex={p.prompt} />
              {showAnswers && (
                <div className="text-primary mt-1 text-[13px] font-semibold">
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
