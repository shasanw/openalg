import { useState } from "react";
import { GENERATORS, getGenerator } from "@/engine/registry";
import { resolveParams, type ParamValues } from "@/engine/types";
import {
  buildWorksheet,
  normalizeWorksheet,
  regenerateAll,
  type PrintConfig,
  type Worksheet,
} from "@/engine/worksheet";
import { buildTypstDocument } from "@/engine/typst";
import { platform } from "@/platform";
import { useTheme } from "@/lib/useTheme";
import { HomeScreen } from "@/components/home/HomeScreen";
import { TopBar, type DocMode } from "@/components/shell/TopBar";
import { Navigator } from "@/components/shell/Navigator";
import { Canvas } from "@/components/shell/Canvas";
import { Inspector } from "@/components/shell/Inspector";
import { PrintConfigDialog } from "@/components/shell/PrintConfigDialog";

function randomSeed(): number {
  // A fresh seed per user action. Generators never call Math.random themselves;
  // they consume this seed deterministically.
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

const DEFAULT_COUNT = 10;

// PrintConfig paper -> CSS @page size keyword.
const PAGE_SIZE: Record<Worksheet["print"]["paper"], string> = {
  "us-letter": "letter",
  a4: "A4",
  legal: "legal",
};

/**
 * Print the worksheet through the OS print dialog (with preview + printer
 * choice), rendering the EXACT Typst pages. We compile the worksheet to SVG
 * (one self-contained page each), drop them into a hidden iframe whose `@page`
 * matches the chosen paper/orientation, and call the iframe's `print()`. No
 * temp file — so it's always fresh (Export PDF remains for saving a file).
 */
async function printWorksheet(ws: Worksheet): Promise<void> {
  const pages = await platform.renderPreview(
    buildTypstDocument(ws, { keyFormat: "full" }),
  );
  if (pages.length === 0) return;

  const size = PAGE_SIZE[ws.print.paper];
  const orientation = ws.print.orientation === "landscape" ? "landscape" : "portrait";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${ws.title}</title>
<style>
  @page { size: ${size} ${orientation}; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page { width: 100%; break-after: page; }
  .page:last-child { break-after: auto; }
  svg { display: block; width: 100%; height: auto; }
</style></head><body>${pages
    .map((svg) => `<div class="page">${svg}</div>`)
    .join("")}</body></html>`;

  // The iframe must cover the whole window: WebView2 anchors/sizes its print
  // preview to the printing document's viewport, so a 0x0 or corner-pinned
  // iframe makes the preview overflow past the app's top edge. A full-window
  // overlay gives the preview the full viewport. It's briefly visible before
  // the preview covers it, then removed once printing finishes.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483647;background:#fff;";
  iframe.srcdoc = html;
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) return;
    // Remove only once the dialog closes (print or cancel both fire afterprint),
    // so we never pull the document out from under an open preview. A long
    // fallback covers the rare case where afterprint doesn't fire.
    const cleanup = () => iframe.remove();
    win.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 120_000);
    win.focus();
    win.print();
  };
  document.body.appendChild(iframe);
}

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
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  // Async file/print actions hit the disk and the Typst compiler, so they can
  // run well past a frame; track each so its button can show progress and
  // guard against double-firing.
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const { theme, setTheme } = useTheme();

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
        // Keep the document's print/layout settings across a topic switch.
        print: worksheet?.print,
      }),
    );
  }

  function generate() {
    setWorksheet(
      buildWorksheet({
        generatorId,
        params,
        baseSeed: randomSeed(),
        count,
        // Regenerating problems must not reset the teacher's layout choices
        // (spacing, paper, margins, …) — carry the current config forward.
        print: worksheet?.print,
      }),
    );
  }

  function regenerate() {
    if (worksheet) setWorksheet(regenerateAll(worksheet, randomSeed()));
  }

  // Editable worksheet chrome (issue #7): title, directions, and print/layout
  // config all live on the worksheet so they persist and drive both the preview
  // and the exported PDF.
  const setTitle = (title: string) =>
    setWorksheet((ws) => (ws ? { ...ws, title } : ws));
  const setDirections = (directions: string) =>
    setWorksheet((ws) => (ws ? { ...ws, directions } : ws));
  const setPrint = (print: PrintConfig) =>
    setWorksheet((ws) => (ws ? { ...ws, print } : ws));

  async function save() {
    if (!worksheet || saving) return;
    setSaving(true);
    try {
      await platform.saveWorksheet(worksheet, `${worksheet.title}.json`);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function open() {
    try {
      const loaded = await platform.openWorksheet();
      if (!loaded) return;
      const ws = normalizeWorksheet(loaded);
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
    if (!worksheet || exporting) return;
    setExporting(true);
    try {
      await platform.exportPdf(
        buildTypstDocument(worksheet, { keyFormat: "full" }),
        `${worksheet.title}.pdf`,
      );
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  }

  async function print() {
    if (!worksheet || printing) return;
    setPrinting(true);
    try {
      await printWorksheet(worksheet);
    } catch (e) {
      console.error(e);
    } finally {
      setPrinting(false);
    }
  }

  if (view === "home") {
    return (
      <HomeScreen
        onNewWorksheet={() => openTopic(GENERATORS[0].id)}
        onOpenTemplate={openTopic}
        onOpen={open}
        theme={theme}
        onThemeChange={setTheme}
      />
    );
  }

  return (
    <div className="bg-muted flex h-screen flex-col gap-2.5 p-2.5">
      <TopBar
        title={worksheet?.title ?? generator.title}
        onTitleChange={worksheet ? setTitle : undefined}
        mode={mode}
        onModeChange={setMode}
        onHome={() => setView("home")}
        onOpen={open}
        onSave={save}
        onExport={exportPdf}
        onPrint={print}
        onPrintConfig={() => setPrintDialogOpen(true)}
        canSave={!!worksheet}
        canExport={!!worksheet}
        saving={saving}
        exporting={exporting}
        printing={printing}
        theme={theme}
        onThemeChange={setTheme}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(180px,236px)_minmax(0,1fr)_minmax(260px,320px)] gap-2.5">
        <Navigator generatorId={generatorId} onSelect={selectTopic} />
        <Canvas
          worksheet={worksheet}
          showAnswers={showAnswers}
          onToggleAnswers={setShowAnswers}
        />
        <Inspector
          generator={generator}
          params={params}
          onParamsChange={setParams}
          directions={worksheet?.directions ?? null}
          onDirectionsChange={setDirections}
          count={count}
          onCountChange={setCount}
          onGenerate={generate}
          onRegenerate={regenerate}
          canRegenerate={!!worksheet}
        />
      </div>

      {worksheet && (
        <PrintConfigDialog
          open={printDialogOpen}
          onOpenChange={setPrintDialogOpen}
          value={worksheet.print}
          onChange={setPrint}
        />
      )}
    </div>
  );
}

export default App;
