// A quick KaTeX draft of the Worksheet, shown in the Preview only while the
// Typst compiler downloads on a first visit (#29). It is a loading state, not
// a second renderer (ADR 0002): one sheet per copy, laid out roughly like the
// Typst page (same width, paper shape, margins, text size, two columns) so the
// exact pages replace it without a jump, but never paginated and never used by
// Print or Export PDF, which always wait for Typst.

import { useEffect, useRef } from "react";
import { choiceLetter } from "@/engine/mc";
import type { Problem } from "@/engine/types";
import { deriveVersion, versionChoices } from "@/engine/versions";
import {
  allProblems,
  isMultipleChoice,
  type AnswerKeyFormat,
  type PrintConfig,
  type Worksheet,
} from "@/engine/worksheet";
import { Math as TeX } from "@/components/Math";

/**
 * The KaTeX faces the draft sets its text and math in. KaTeX's fonts use
 * `font-display: block`, so the draft's text stays invisible until they
 * arrive; requesting them when the app opens (before the Typst download
 * starts sharing the connection) has them ready by the first draft.
 */
const DRAFT_FONTS = ["1em KaTeX_Main", "bold 1em KaTeX_Main", "italic 1em KaTeX_Main", "italic 1em KaTeX_Math"];

export function loadDraftFonts(): void {
  const fonts = globalThis.document?.fonts;
  if (!fonts?.load) return;
  for (const font of DRAFT_FONTS) fonts.load(font).catch(() => {});
}

/** Paper size in inches, portrait. */
const PAPER_IN: Record<PrintConfig["paper"], [number, number]> = {
  "us-letter": [8.5, 11],
  a4: [210 / 25.4, 297 / 25.4],
  legal: [8.5, 14],
};
const MARGIN_IN: Record<PrintConfig["margin"], number> = { narrow: 0.5, normal: 1, wide: 1.5 };
const FONT_PT: Record<PrintConfig["fontSize"], number> = { small: 10, normal: 12, large: 14 };
const SPACING_EM: Record<PrintConfig["spacing"], number> = { tight: 1.2, normal: 3.5, roomy: 7 };
/** The key ink, matching the Typst layout's. */
const KEY_COLOR = "#c62828";

/** Fields the draft draws, or knows how to handle; anything else gets a placeholder. */
const DRAWABLE_FIELDS = new Set([
  "graph",
  "answerGraph",
  "kind",
  "generatorId",
  "params",
  "seed",
  "prompt",
  "answer",
  "steps",
  "distractorHints",
]);

/**
 * True when this copy of the Problem prints something beyond LaTeX text: its
 * graph (a blank grid or number line on the student copy), its answer graph
 * on an in-context key, or any field the draft doesn't know.
 */
export function hasUndrawableContent(problem: Problem, answers = false): boolean {
  if (problem.graph != null) return true;
  if (answers && problem.answerGraph != null) return true;
  return Object.entries(problem).some(([k, v]) => !DRAWABLE_FIELDS.has(k) && v != null);
}

/** Paper width and height in inches, as printed (landscape turns the sheet). */
export function sheetInches(print: PrintConfig): [number, number] {
  const [w, h] = PAPER_IN[print.paper];
  return print.orientation === "landscape" ? [h, w] : [w, h];
}

interface DraftContext {
  ws: Worksheet;
  mc: boolean;
  choices: number;
  choiceVariant: number;
}

export function DraftPages({
  worksheet,
  showAnswers,
  version = 0,
  width,
  fit,
  banner,
}: {
  worksheet: Worksheet;
  showAnswers: boolean;
  version?: number;
  /** A sheet's on-screen width in CSS pixels (the exact pages' width). */
  width: number;
  /** Shrink to the pane when it is narrower than `width`. */
  fit: boolean;
  /** The "Preparing the exact preview" banner, floated over the sheets. */
  banner?: React.ReactNode;
}) {
  const v = deriveVersion(worksheet, version);
  const ws = v.worksheet;
  const ctx: DraftContext = {
    ws,
    mc: isMultipleChoice(ws),
    choices: ws.responseFormat.choices,
    choiceVariant: v.choiceVariant,
  };
  const format: AnswerKeyFormat = showAnswers ? ws.answerKeyFormat : "none";
  const keySheet = useRef<HTMLDivElement>(null);

  // Switching to the Answer Key jumps to it, as the exact Preview does.
  useEffect(() => {
    if (showAnswers) keySheet.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [showAnswers]);

  const sheet = { print: ws.print, width, fit };
  return (
    <div data-preview-draft className="flex min-w-fit flex-col items-center gap-6 p-6 pb-24">
      {banner && (
        // Zero height, so the banner floats over the first sheet's top margin
        // and the sheets sit exactly where the exact pages will.
        <div className="sticky top-3 z-10 -my-3 flex h-0 w-full justify-center">{banner}</div>
      )}
      <Sheet {...sheet} label={v.label ? `Draft · ${v.label}` : "Draft"}>
        <Copy ctx={ctx} label={v.label} answers={false} />
      </Sheet>
      {format !== "none" && (
        <Sheet {...sheet} sheetRef={keySheet} label="Draft · Answer Key">
          {format === "in-context" ? (
            <Copy ctx={ctx} label={v.label} answers />
          ) : (
            <KeyList ctx={ctx} label={v.label} odds={format === "odds"} />
          )}
        </Sheet>
      )}
    </div>
  );
}

/**
 * A white sheet with the paper's shape (it grows if the draft runs long). Its
 * text is sized in container units so it scales with the sheet like the SVG.
 */
function Sheet({
  print,
  width,
  fit,
  label,
  sheetRef,
  children,
}: {
  print: PrintConfig;
  width: number;
  fit: boolean;
  label: string;
  sheetRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const [w, h] = sheetInches(print);
  const margin = MARGIN_IN[print.margin];
  return (
    <div
      ref={sheetRef}
      data-draft-sheet
      style={{
        width,
        maxWidth: fit ? "100%" : undefined,
        aspectRatio: `${w} / ${h}`,
        containerType: "inline-size",
      }}
      className="relative shrink-0 scroll-mt-6 rounded-sm bg-white text-black shadow-[var(--shadow-page)]"
    >
      <span
        className="absolute top-2 right-3 font-sans text-[11px] font-medium tracking-wide text-neutral-400 uppercase select-none"
        aria-hidden
      >
        {label}
      </span>
      <div
        // KaTeX sets math at 1.21em; Typst sets it at the text size.
        className="[&_.katex]:text-[1em]"
        style={{
          padding: `${(margin / w) * 100}%`,
          fontSize: `${((FONT_PT[print.fontSize] / 72 / w) * 100).toFixed(4)}cqw`,
          fontFamily: "KaTeX_Main, 'Times New Roman', serif",
          lineHeight: 1.35,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Font size relative to the body text, from a Typst point size. */
const pt = (print: PrintConfig, size: number) => `${size / FONT_PT[print.fontSize]}em`;

/** The student copy, or (with `answers`) the in-context Answer Key. */
function Copy({ ctx, label, answers }: { ctx: DraftContext; label: string | null; answers: boolean }) {
  const { ws } = ctx;
  const print = ws.print;
  const title = (
    <div>
      <div style={{ fontSize: pt(print, 16), fontWeight: 700 }}>{ws.title}</div>
      {label && <div style={{ fontWeight: 700 }}>{label}</div>}
    </div>
  );
  let number = 0;
  return (
    <>
      <div className="flex items-center justify-between gap-[1.5em]">
        {title}
        {answers ? (
          <div style={{ fontSize: pt(print, 14), fontWeight: 700, color: KEY_COLOR }}>
            {label ? `${label} Answer Key` : "Answer Key"}
          </div>
        ) : (
          print.showNameDatePeriod && (
            <div className="shrink-0" style={{ fontSize: pt(print, 10), lineHeight: 1.9 }}>
              <div>
                Name <Blank w={1.9} />
              </div>
              <div>
                Date <Blank w={1.1} /> <span className="ml-[1em]">Period</span> <Blank w={0.7} />
              </div>
            </div>
          )
        )}
      </div>
      <hr className="mt-[0.5em] mb-[1.6em] border-0 border-t-[0.07em] border-black" />
      {ws.sections.map((section, s) => (
        <section key={s} style={{ marginTop: s > 0 ? "1.2em" : undefined }}>
          <p className="italic">{section.directions}</p>
          <Grid rowGap={`${SPACING_EM[print.spacing]}em`}>
            {section.problems.map((p, i) => (
              <Cell key={i} n={++number}>
                <ProblemBody ctx={ctx} problem={p} answers={answers} />
              </Cell>
            ))}
          </Grid>
        </section>
      ))}
    </>
  );
}

/** The full or odd-numbered Answer Key: one numbered list of Answers. */
function KeyList({ ctx, label, odds }: { ctx: DraftContext; label: string | null; odds: boolean }) {
  const print = ctx.ws.print;
  const cells = allProblems(ctx.ws)
    .map((p, i) => ({ p, n: i + 1 }))
    .filter(({ n }) => !odds || n % 2 === 1);
  return (
    <>
      <div className="text-center" style={{ fontSize: pt(print, 14), fontWeight: 700 }}>
        {label ? `${label} Answer Key` : "Answer Key"}
        {odds && (
          <span style={{ fontSize: `${11 / 14}em`, fontWeight: 400 }}> (odd-numbered problems)</span>
        )}
      </div>
      <Grid rowGap="1em">
        {cells.map(({ p, n }) => (
          <Cell key={n} n={n}>
            {ctx.mc && (
              <strong>({choiceLetter(versionChoices(p, ctx.choices, ctx.choiceVariant).correctIndex)}) </strong>
            )}
            <TeX tex={p.answer} />
          </Cell>
        ))}
      </Grid>
    </>
  );
}

function ProblemBody({ ctx, problem, answers }: { ctx: DraftContext; problem: Problem; answers: boolean }) {
  const prompt = (
    <>
      <TeX tex={problem.prompt} />
      {hasUndrawableContent(problem, answers) && (
        <div
          data-draft-placeholder
          className="mt-[0.4em] flex aspect-[4/3] w-full max-w-[14em] items-center justify-center rounded-[0.3em] border border-dashed border-neutral-300 bg-neutral-50 font-sans text-[0.75em] text-neutral-400"
        >
          Shown in the exact preview
        </div>
      )}
    </>
  );
  if (ctx.mc) {
    const { choices, correctIndex } = versionChoices(problem, ctx.choices, ctx.choiceVariant);
    return (
      <>
        {prompt}
        <div className="mt-[0.3em] flex flex-col gap-[0.4em] pl-[1.6em]">
          {choices.map((latex, i) => {
            const correct = answers && i === correctIndex;
            return (
              <div key={i} className="flex" style={correct ? { color: KEY_COLOR } : undefined}>
                <span className="w-[1.8em] shrink-0">
                  {correct ? (
                    <span className="rounded-full border px-[0.2em] font-bold" style={{ borderColor: KEY_COLOR }}>
                      {choiceLetter(i)}
                    </span>
                  ) : (
                    `(${choiceLetter(i)})`
                  )}
                </span>
                <TeX tex={latex} />
              </div>
            );
          })}
          {answers && (
            <strong style={{ color: KEY_COLOR }}>Answer: ({choiceLetter(correctIndex)})</strong>
          )}
        </div>
      </>
    );
  }
  return (
    <>
      {prompt}
      {answers && (
        <div className="mt-[0.3em] pl-[1.6em]" style={{ color: KEY_COLOR }}>
          <strong>Answer:</strong> <TeX tex={problem.answer} />
        </div>
      )}
    </>
  );
}

function Grid({ rowGap, children }: { rowGap: string; children: React.ReactNode }) {
  return (
    <div className="mt-[1.2em] grid grid-cols-2 items-start gap-x-[1.5em]" style={{ rowGap }}>
      {children}
    </div>
  );
}

/** One numbered Problem or Answer; a wrapped body hangs under its first line. */
function Cell({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0" data-draft-problem={n}>
      <span className="w-[1.6em] shrink-0">{n})</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Blank({ w }: { w: number }) {
  return <span className="inline-block border-b border-neutral-500 align-baseline" style={{ width: `${w * 7.2}em` }} />;
}
