import { useState } from "react";
import { GENERATORS, getGenerator } from "@/engine/registry";
import { resolveParams, type ParamValues } from "@/engine/types";
import {
  buildWorksheet,
  regenerateAll,
  rerollProblem,
  removeProblem,
  reorderProblem,
  type Worksheet,
} from "@/engine/worksheet";
import { buildTypstDocument } from "@/engine/typst";
import { platform } from "@/platform";
import { HomeScreen } from "@/components/home/HomeScreen";
import { TopBar, type DocMode } from "@/components/shell/TopBar";
import { Navigator } from "@/components/shell/Navigator";
import { Canvas } from "@/components/shell/Canvas";
import { Inspector } from "@/components/shell/Inspector";

function randomSeed(): number {
  // A fresh seed per user action. Generators never call Math.random themselves;
  // they consume this seed deterministically.
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

const DEFAULT_COUNT = 10;

function App() {
  const [view, setView] = useState<"home" | "doc">("home");
  const [generatorId, setGeneratorId] = useState(GENERATORS[0].id);
  const generator = getGenerator(generatorId)!;
  const [params, setParams] = useState<ParamValues>(() =>
    resolveParams(generator.schema, {}),
  );
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [mode, setMode] = useState<DocMode>("worksheet");

  /** Build a worksheet for the given topic and enter the workspace. */
  function openTopic(id: string) {
    const g = getGenerator(id)!;
    const resolved = resolveParams(g.schema, {});
    setGeneratorId(id);
    setParams(resolved);
    setCount(DEFAULT_COUNT);
    setShowAnswers(false);
    setWorksheet(
      buildWorksheet({
        generatorId: id,
        params: resolved,
        baseSeed: randomSeed(),
        count: DEFAULT_COUNT,
      }),
    );
    setView("doc");
  }

  /** Switch topic within the workspace and immediately show a fresh sheet. */
  function selectTopic(id: string) {
    const g = getGenerator(id)!;
    const resolved = resolveParams(g.schema, {});
    setGeneratorId(id);
    setParams(resolved);
    setWorksheet(
      buildWorksheet({
        generatorId: id,
        params: resolved,
        baseSeed: randomSeed(),
        count,
      }),
    );
  }

  function generate() {
    setWorksheet(
      buildWorksheet({ generatorId, params, baseSeed: randomSeed(), count }),
    );
  }

  function regenerate() {
    if (worksheet) setWorksheet(regenerateAll(worksheet, randomSeed()));
  }

  // Per-problem curation (issue #4). Each op produces a new worksheet whose
  // `problems`/recipe stay consistent; re-roll uses the problem's own recipe so
  // it remains correct-by-construction.
  const curation = {
    onReroll: (i: number) =>
      setWorksheet((ws) => (ws ? rerollProblem(ws, i, randomSeed()) : ws)),
    onRemove: (i: number) =>
      setWorksheet((ws) => (ws ? removeProblem(ws, i) : ws)),
    onReorder: (from: number, to: number) =>
      setWorksheet((ws) => (ws ? reorderProblem(ws, from, to) : ws)),
  };

  async function save() {
    if (!worksheet) return;
    try {
      await platform.saveWorksheet(worksheet, `${worksheet.title}.json`);
    } catch (e) {
      console.error(e);
    }
  }

  async function open() {
    try {
      const ws = await platform.openWorksheet();
      if (!ws) return;
      setWorksheet(ws);
      setGeneratorId(ws.generatorId);
      setParams(ws.params);
      setCount(ws.count);
      setView("doc");
    } catch (e) {
      console.error(e);
    }
  }

  async function exportPdf() {
    if (!worksheet) return;
    try {
      await platform.exportPdf(
        buildTypstDocument(worksheet, { keyFormat: "full" }),
        `${worksheet.title}.pdf`,
      );
    } catch (e) {
      console.error(e);
    }
  }

  if (view === "home") {
    return (
      <HomeScreen
        onNewWorksheet={() => openTopic(GENERATORS[0].id)}
        onOpenTemplate={openTopic}
        onOpen={open}
      />
    );
  }

  return (
    <div className="bg-muted flex h-screen flex-col gap-2.5 p-2.5">
      <TopBar
        title={worksheet?.title ?? generator.title}
        mode={mode}
        onModeChange={setMode}
        onHome={() => setView("home")}
        onOpen={open}
        onSave={save}
        onExport={exportPdf}
        canSave={!!worksheet}
        canExport={!!worksheet}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[236px_1fr_320px] gap-2.5">
        <Navigator generatorId={generatorId} onSelect={selectTopic} />
        <Canvas
          worksheet={worksheet}
          showAnswers={showAnswers}
          onToggleAnswers={setShowAnswers}
          curation={curation}
        />
        <Inspector
          generator={generator}
          params={params}
          onParamsChange={setParams}
          count={count}
          onCountChange={setCount}
          onGenerate={generate}
          onRegenerate={regenerate}
          canRegenerate={!!worksheet}
        />
      </div>
    </div>
  );
}

export default App;
