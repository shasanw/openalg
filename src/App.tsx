import { useState } from "react";
import { GENERATORS, getGenerator } from "@/engine/registry";
import { resolveParams, type ParamValues } from "@/engine/types";
import {
  buildWorksheet,
  regenerateAll,
  type Worksheet,
} from "@/engine/worksheet";
import { buildTypstDocument } from "@/engine/typst";
import { platform } from "@/platform";
import { OptionsPanel } from "@/components/OptionsPanel";
import { WorksheetView } from "@/components/WorksheetView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function randomSeed(): number {
  // A fresh seed per user action. Generators never call Math.random themselves;
  // they consume this seed deterministically.
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

function App() {
  const [generatorId, setGeneratorId] = useState(GENERATORS[0].id);
  const generator = getGenerator(generatorId)!;
  const [params, setParams] = useState<ParamValues>(() =>
    resolveParams(generator.schema, {}),
  );
  const [count, setCount] = useState(10);
  const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);

  function selectTopic(id: string) {
    const g = getGenerator(id)!;
    setGeneratorId(id);
    setParams(resolveParams(g.schema, {}));
    setWorksheet(null);
  }

  function generate() {
    setWorksheet(
      buildWorksheet({ generatorId, params, baseSeed: randomSeed(), count }),
    );
  }

  function regenerate() {
    if (worksheet) setWorksheet(regenerateAll(worksheet, randomSeed()));
  }

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

  return (
    <div className="grid h-screen grid-cols-[320px_1fr]">
      {/* Controls */}
      <aside className="flex flex-col gap-6 overflow-y-auto border-r p-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">OpenAlg</h1>
          <p className="text-muted-foreground text-xs">Algebra 2 · Precalculus</p>
        </div>

        <section className="space-y-2">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase">
            Topic
          </h2>
          <ul className="space-y-1">
            {GENERATORS.map((g) => (
              <li key={g.id}>
                <button
                  onClick={() => selectTopic(g.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    g.id === generatorId
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                >
                  {g.title}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase">
            Options
          </h2>
          <OptionsPanel
            schema={generator.schema}
            values={params}
            onChange={setParams}
          />
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Number of problems</span>
            <Input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => {
                const n = Math.round(Number(e.currentTarget.value));
                if (!Number.isNaN(n)) setCount(Math.min(50, Math.max(1, n)));
              }}
            />
          </label>
        </section>

        <div className="flex flex-col gap-2">
          <Button onClick={generate}>Generate</Button>
          <Button
            variant="outline"
            onClick={regenerate}
            disabled={!worksheet}
          >
            Regenerate all
          </Button>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={showAnswers}
              onChange={(e) => setShowAnswers(e.currentTarget.checked)}
            />
            Show answer key
          </label>
        </div>

        <div className="mt-auto flex flex-col gap-2 border-t pt-4">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase">
            File
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={open}>
              Open…
            </Button>
            <Button variant="outline" onClick={save} disabled={!worksheet}>
              Save…
            </Button>
          </div>
          <Button variant="secondary" onClick={exportPdf} disabled={!worksheet}>
            Export PDF…
          </Button>
        </div>
      </aside>

      {/* Preview */}
      <main className="overflow-y-auto p-8">
        {worksheet ? (
          <div className="mx-auto max-w-2xl">
            <WorksheetView worksheet={worksheet} showAnswers={showAnswers} />
          </div>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            Choose a topic, set options, and click <b className="px-1">Generate</b>.
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
