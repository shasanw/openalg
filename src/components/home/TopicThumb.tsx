// A Start-new tile's thumbnail: a miniature first page of a Worksheet from the
// Topic (title, Directions, real sample Problems in two columns, and the graph
// a Problem prints with, if any), so each template looks like what it makes.
//
// Everything is sized in container-query units (cqw), so the page scales with
// the tile's width without measuring it in JavaScript. KaTeX sizes in em, so
// the math follows the font size. The page is always white paper, so it uses
// fixed neutrals rather than theme tokens.

import { memo, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { Plus } from "lucide-react";
import { resolveParams, type Generator } from "@/engine/types";
import { plot } from "@/engine/plot";

const THUMB_SEEDS = [11, 23, 37, 41, 53, 67] as const;

interface ThumbContent {
  problems: string[];
  graph: string | null;
}

const cache = new Map<string, ThumbContent>();

/** Sample Problems for a Topic's thumbnail, generated once per Topic. */
function thumbContent(g: Generator): ThumbContent {
  let c = cache.get(g.id);
  if (!c) {
    const params = resolveParams(g.schema, {});
    const generated = THUMB_SEEDS.map((seed) => g.generate(params, seed));
    const html = generated.map((p) =>
      katex.renderToString(p.prompt, { throwOnError: false, output: "html" }),
    );
    const graph = generated[0].graph;
    // With a graph per Problem, a page holds fewer of them.
    c = { problems: graph ? html.slice(0, 2) : html, graph: graph ? plot(graph) : null };
    cache.set(g.id, c);
  }
  return c;
}

const PAPER =
  "relative aspect-[8.5/11] overflow-hidden rounded-[3px] border border-neutral-200 bg-white text-neutral-900 [container-type:inline-size]";

export const TopicThumb = memo(function TopicThumb({ topic }: { topic: Generator }) {
  const { problems, graph } = useMemo(() => thumbContent(topic), [topic]);
  const graphSrc = graph ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(graph)}` : null;
  return (
    <div aria-hidden className={PAPER}>
      <div className="font-paper absolute inset-0 px-[9cqw] pt-[9cqw] text-[3.4cqw] leading-[1.35]">
        <div className="flex items-start justify-between gap-[3cqw]">
          <div className="text-[5.2cqw] leading-tight font-bold">{topic.title}</div>
          <div className="mt-[1cqw] w-[30cqw] shrink-0 space-y-[2.2cqw]">
            <div className="h-px bg-neutral-400" />
            <div className="h-px bg-neutral-400" />
          </div>
        </div>
        <div className="my-[3cqw] h-[0.4cqw] bg-neutral-800" />
        <div className="mb-[3cqw] italic">{topic.defaultDirections}</div>
        <div className="grid grid-cols-2 gap-x-[4cqw] gap-y-[7cqw]">
          {problems.map((html, i) => (
            <div key={i} className="min-w-0">
              <div className="flex gap-[1.5cqw] whitespace-nowrap">
                <span>{i + 1})</span>
                <span dangerouslySetInnerHTML={{ __html: html }} />
              </div>
              {graphSrc && <img src={graphSrc} alt="" className="mt-[2cqw] w-[36cqw]" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

/** The blank-Worksheet thumbnail: empty paper with a plus. */
export function BlankThumb() {
  return (
    <div aria-hidden className={`${PAPER} grid place-content-center text-neutral-500`}>
      <Plus className="size-9" strokeWidth={1.5} />
    </div>
  );
}
