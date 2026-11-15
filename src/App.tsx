import { useEffect, useRef, useState } from "react";
import { GENERATORS, getGenerator } from "@/engine/registry";
import { resolveParams, type ParamValues } from "@/engine/types";
import {
  buildWorksheet,
  regenerateAll,
  setResponseFormat as withResponseFormat,
  setSectionDirections,
  type PrintConfig,
  type ResponseFormat,
  type AnswerKeyFormat,
  type Worksheet,
} from "@/engine/worksheet";
import { buildTypstDocument } from "@/engine/typst";
import { platform } from "@/platform";
import type {
  LibraryEntry,
  LibraryRestoreSummary,
  StoragePersistence,
} from "@/platform/types";
import { useTheme } from "@/lib/useTheme";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
import { useToast } from "@/components/ui/toast";
import { HomeScreen } from "@/components/home/HomeScreen";
import { TopBar, type DocMode } from "@/components/shell/TopBar";
import { Navigator } from "@/components/shell/Navigator";
import { Canvas } from "@/components/shell/Canvas";
import { Inspector } from "@/components/shell/Inspector";
import { PrintConfigDialog } from "@/components/shell/PrintConfigDialog";

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** One-line summary of a Library restore for the toast. */
function restoreDescription(s: LibraryRestoreSummary): string {
  const parts: string[] = [];
  if (s.overwritten > 0) parts.push(`${s.overwritten} replaced by a newer backup copy`);
  if (s.skipped > 0) parts.push(`${s.skipped} kept because your Library copy is newer`);
  if (s.failed.length > 0) {
    const which = s.failed.map((f) => f.id ?? `entry ${f.index + 1}`).join(", ");
    const n = s.failed.length;
    parts.push(`${n} ${n === 1 ? "entry" : "entries"} couldn't be read (${which})`);
  }
  return parts.length > 0 ? `${parts.join("; ")}.` : "Every Worksheet in the backup was added.";
}

function randomSeed(): number {
  // A fresh seed per user action. Generators never call Math.random themselves;
  // they consume this seed deterministically.
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** A stable id for a worksheet's library file (the auto-save filename). */
function newDocId(): string {
  return crypto.randomUUID();
}

const DEFAULT_COUNT = 10;

/** How a document is being persisted to the library, for the top-bar indicator. */
export type AutosaveState = "idle" | "saving" | "saved" | "error";

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
    buildTypstDocument(ws),
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
  // Stable id of the open document's library file. Assigned when a document is
  // created/opened and held across edits so auto-save overwrites the same file.
  const [docId, setDocId] = useState<string | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [mode, setMode] = useState<DocMode>("worksheet");
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  // Async file/print actions hit the disk and the Typst compiler, so they can
  // run well past a frame; track each so its button can show progress and
  // guard against double-firing.
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  // Silent library auto-save status, surfaced as a subtle top-bar indicator.
  const [autosave, setAutosave] = useState<AutosaveState>("idle");
  // Recent worksheets shown on the home screen, loaded from the library.
  const [recents, setRecents] = useState<LibraryEntry[]>([]);
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const install = useInstallPrompt();
  // Whether the browser keeps the Library from eviction (#26); null = unknown.
  const [storage, setStorage] = useState<StoragePersistence | null>(null);
  // Persistent storage is requested once per session, after the first save.
  const persistRequested = useRef(false);

  useEffect(() => {
    platform.storagePersistence().then(setStorage).catch(() => setStorage(null));
  }, []);

  // Auto-save: whenever the open document changes, debounce a silent write to
  // its library file. This is the primary persistence path — the user never has
  // to click Save. Errors surface as a toast (and the top-bar indicator) so a
  // failed write is never silent.
  useEffect(() => {
    if (!worksheet || !docId) return;
    setAutosave("saving");
    const timer = setTimeout(() => {
      platform
        .autosaveWorksheet(docId, worksheet)
        .then(() => {
          setAutosave("saved");
          // Browsers grant persistence more readily once the site holds real
          // data, so ask right after the first Worksheet is saved.
          if (!persistRequested.current) {
            persistRequested.current = true;
            platform
              .requestPersistentStorage()
              .then(setStorage)
              .catch((e) => console.error(e));
          }
        })
        .catch((e) => {
          console.error(e);
          setAutosave("error");
          toast({
            variant: "error",
            title: "Couldn't auto-save",
            description: "Your latest changes may not be saved.",
          });
        });
    }, 600);
    return () => clearTimeout(timer);
  }, [worksheet, docId, toast]);

  // Refresh the recents list whenever we return to the home screen.
  useEffect(() => {
    if (view !== "home") return;
    platform.listLibrary().then(setRecents).catch((e) => console.error(e));
  }, [view]);

  // OS file-open integration: load a .oalg file the app was launched with
  // (double-click while closed), and listen for files opened while running
  // (double-click / "Open with" on a second launch). Mount-only.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;
    platform
      .takeLaunchWorksheet()
      .then((ws) => {
        if (active && ws) adoptWorksheet(ws);
      })
      .catch((e) => console.error(e));
    platform
      .onOpenWorksheet((ws) => adoptWorksheet(ws))
      .then((un) => {
        if (active) unlisten = un;
        else un();
      })
      .catch((e) => console.error(e));
    return () => {
      active = false;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Build a filled worksheet from a topic template and enter the workspace. */
  function openTopic(id: string) {
    const g = getGenerator(id)!;
    const resolved = resolveParams(g.schema, {});
    setGeneratorId(id);
    setParams(resolved);
    setCount(DEFAULT_COUNT);
    setShowAnswers(false);
    setDocId(newDocId());
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

  /**
   * Start a blank, untitled worksheet: no problems yet. The canvas shows an
   * empty state; the teacher fills it by choosing options and pressing Generate
   * (or switching topics). It's auto-saved on creation like any document.
   */
  function newBlank() {
    const g = GENERATORS[0];
    const resolved = resolveParams(g.schema, {});
    setGeneratorId(g.id);
    setParams(resolved);
    setCount(DEFAULT_COUNT);
    setShowAnswers(false);
    setDocId(newDocId());
    setWorksheet(
      buildWorksheet({
        generatorId: g.id,
        params: resolved,
        baseSeed: randomSeed(),
        count: 0,
        title: "Untitled worksheet",
      }),
    );
    setView("doc");
  }

  /**
   * Point the Topic picker and Topic Options at the Worksheet's first Section.
   * The UI builds single-Section Worksheets only, so that Section is the whole
   * sheet.
   */
  function loadSectionControls(ws: Worksheet) {
    const section = ws.sections[0];
    setGeneratorId(section.generatorId);
    setParams(section.params);
    setCount(section.count || DEFAULT_COUNT);
  }

  /**
   * Load a worksheet object into the workspace as a fresh document (new library
   * id). Shared by file import, recents-less opens, and OS "open with".
   */
  function adoptWorksheet(ws: Worksheet) {
    setDocId(newDocId());
    setWorksheet(ws);
    loadSectionControls(ws);
    setShowAnswers(false);
    setView("doc");
  }

  /** Open a saved worksheet from the library (recents) into the workspace. */
  async function openRecent(id: string) {
    try {
      const ws = await platform.loadLibrary(id);
      if (!ws) {
        toast({
          variant: "error",
          title: "Couldn't open worksheet",
          description: "It may have been moved or removed.",
        });
        return;
      }
      setDocId(id);
      setWorksheet(ws);
      loadSectionControls(ws);
      setShowAnswers(false);
      setView("doc");
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Couldn't open worksheet" });
    }
  }

  /** Delete a saved worksheet from the library and drop it from recents. */
  async function deleteRecent(id: string) {
    try {
      await platform.deleteLibrary(id);
      setRecents((xs) => xs.filter((x) => x.id !== id));
      toast({ variant: "success", title: "Worksheet deleted" });
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Couldn't delete worksheet" });
    }
  }

  /** Download a Library Backup holding every Worksheet in the Library. */
  async function backupLibrary() {
    try {
      const { saved, skipped } = await platform.backupLibrary();
      toast({
        variant: "success",
        title: "Library Backup downloaded",
        description:
          `${plural(saved, "Worksheet")} backed up.` +
          (skipped > 0 ? ` Left out ${plural(skipped, "damaged Worksheet")} that couldn't be read.` : ""),
      });
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Couldn't back up the Library" });
    }
  }

  /** Rebuild the Library from a Library Backup file the teacher picks. */
  async function restoreLibrary() {
    let summary: LibraryRestoreSummary | null;
    try {
      summary = await platform.restoreLibrary();
    } catch (e) {
      console.error(e);
      toast({
        variant: "error",
        title: "Couldn't restore that file",
        description: e instanceof Error ? e.message : undefined,
      });
      return;
    }
    if (!summary) return;
    platform.listLibrary().then(setRecents).catch((e) => console.error(e));
    toast({
      variant: summary.failed.length > 0 ? "error" : "success",
      title: `Restored ${plural(summary.restored + summary.overwritten, "Worksheet")}`,
      description: restoreDescription(summary),
    });
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
        // Keep the document's print/layout settings, Response Format and Answer
        // Key format across a topic switch.
        print: worksheet?.print,
        responseFormat: worksheet?.responseFormat,
        answerKeyFormat: worksheet?.answerKeyFormat,
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
        // (spacing, paper, margins, …) or free response / multiple choice —
        // carry the current config forward.
        print: worksheet?.print,
        responseFormat: worksheet?.responseFormat,
        answerKeyFormat: worksheet?.answerKeyFormat,
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
    setWorksheet((ws) => (ws ? setSectionDirections(ws, 0, directions) : ws));
  const setPrint = (print: PrintConfig) =>
    setWorksheet((ws) => (ws ? { ...ws, print } : ws));
  const setResponseFormat = (responseFormat: ResponseFormat) =>
    setWorksheet((ws) => (ws ? withResponseFormat(ws, responseFormat) : ws));
  const setAnswerKeyFormat = (answerKeyFormat: AnswerKeyFormat) =>
    setWorksheet((ws) => (ws ? { ...ws, answerKeyFormat } : ws));

  /** Export a portable copy to a user-chosen .json file (auto-save is separate). */
  async function save() {
    if (!worksheet || saving) return;
    setSaving(true);
    try {
      const ok = await platform.saveWorksheet(worksheet, `${worksheet.title}.oalg`);
      if (ok) {
        toast({
          variant: "success",
          title: "Saved a copy",
          description: `${worksheet.title}.oalg`,
        });
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Couldn't save a copy" });
    } finally {
      setSaving(false);
    }
  }

  /** Import a worksheet file from disk; it becomes a new document in the library. */
  async function open() {
    try {
      // The platform adapter validates and normalizes the file (engine/persist),
      // so a loaded worksheet is ready to drive the workspace as-is.
      const ws = await platform.openWorksheet();
      if (!ws) return;
      adoptWorksheet(ws);
    } catch (e) {
      console.error(e);
      toast({
        variant: "error",
        title: "Couldn't open that file",
        description: "It isn't a valid OpenAlg worksheet.",
      });
    }
  }

  async function exportPdf() {
    if (!worksheet || exporting) return;
    setExporting(true);
    try {
      const ok = await platform.exportPdf(
        buildTypstDocument(worksheet),
        `${worksheet.title}.pdf`,
      );
      if (ok) {
        toast({
          variant: "success",
          title: "Exported PDF",
          description: `${worksheet.title}.pdf`,
        });
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Couldn't export PDF" });
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
        onNewWorksheet={newBlank}
        onOpenTemplate={openTopic}
        onOpen={open}
        recents={recents}
        onOpenRecent={openRecent}
        onDeleteRecent={deleteRecent}
        theme={theme}
        onThemeChange={setTheme}
        onBackupLibrary={backupLibrary}
        onRestoreLibrary={restoreLibrary}
        storage={storage}
        install={install}
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
        autosave={worksheet ? autosave : "idle"}
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
          directions={worksheet?.sections[0]?.directions ?? null}
          onDirectionsChange={setDirections}
          responseFormat={worksheet?.responseFormat ?? null}
          onResponseFormatChange={setResponseFormat}
          answerKeyFormat={worksheet?.answerKeyFormat ?? null}
          onAnswerKeyFormatChange={setAnswerKeyFormat}
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
