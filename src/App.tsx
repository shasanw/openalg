import { useCallback, useEffect, useRef, useState } from "react";
import { getGenerator } from "@/engine/registry";
import { resolveParams } from "@/engine/types";
import {
  buildWorksheet,
  DEFAULT_SECTION_PROBLEMS,
  emptyWorksheet,
  isThrowaway,
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
import { TopBar, type AutosaveState } from "@/components/shell/TopBar";
import { Editor } from "@/components/shell/Editor";
import { randomSeed } from "@/lib/randomSeed";

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

/** A stable id for a worksheet's library file (the auto-save filename). */
function newDocId(): string {
  return crypto.randomUUID();
}

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
  // Every Version's student pages, then every Version's Answer Key.
  const pages = await platform.renderPreview(buildTypstDocument(ws, { version: "all" }));
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

  // A full-window overlay iframe gives the print preview the full viewport.
  // It's briefly visible before the dialog covers it, then removed once
  // printing finishes.
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
  const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
  // Stable id of the open document's library file. Assigned when a document is
  // created/opened and held across edits so auto-save overwrites the same file.
  const [docId, setDocId] = useState<string | null>(null);
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
  // Whether the open document has reached the Library yet.
  const inLibrary = useRef(false);
  // A brand-new Worksheet (blank or from a template) as it was opened. It
  // isn't saved until the teacher changes it, so opening one and going
  // straight back home leaves nothing in the Library.
  const pristine = useRef<Worksheet | null>(null);
  // A document discarded on leaving (see leaveDocument); a debounced save
  // still pending for it must not write it back.
  const discarded = useRef<string | null>(null);

  useEffect(() => {
    platform.storagePersistence().then(setStorage).catch(() => setStorage(null));
  }, []);

  // Auto-save: whenever the open document changes, debounce a silent write to
  // its library file. This is the primary persistence path — the user never has
  // to click Save. Errors surface as a toast (and the top-bar indicator) so a
  // failed write is never silent.
  useEffect(() => {
    if (!worksheet || !docId) return;
    if (!inLibrary.current && (worksheet === pristine.current || isThrowaway(worksheet))) return;
    inLibrary.current = true;
    setAutosave("saving");
    const timer = setTimeout(() => {
      if (discarded.current === docId) return;
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

  /**
   * Leave the open document. One that ended up thrown away (no Problems, never
   * named; e.g. a Section added and then deleted) is removed from the Library
   * rather than left in Recent.
   */
  async function leaveDocument() {
    if (!worksheet || !docId || !isThrowaway(worksheet)) return;
    discarded.current = docId;
    if (!inLibrary.current) return;
    inLibrary.current = false;
    try {
      await platform.deleteLibrary(docId);
    } catch (e) {
      console.error(e);
    }
  }

  async function goHome() {
    await leaveDocument();
    setView("home");
  }

  /**
   * Make `ws` the open document under library id `id` and enter the editor.
   * A new document (`isNew`) waits for its first change before it's saved.
   */
  function openDocument(ws: Worksheet, id: string, alreadyInLibrary: boolean, isNew = false) {
    void leaveDocument();
    pristine.current = isNew ? ws : null;
    discarded.current = null;
    inLibrary.current = alreadyInLibrary;
    setAutosave("idle");
    setDocId(id);
    setWorksheet(ws);
    setView("doc");
  }

  /** A one-Section Worksheet from a Topic template on the home screen. */
  function openTopic(id: string) {
    const g = getGenerator(id)!;
    openDocument(
      buildWorksheet({
        generatorId: id,
        params: resolveParams(g.schema, {}),
        baseSeed: randomSeed(),
        count: DEFAULT_SECTION_PROBLEMS,
      }),
      newDocId(),
      false,
      true,
    );
  }

  /**
   * Start a new Worksheet with no Sections. The Preview invites the teacher to
   * add the first one; it reaches the Library once it has a Section.
   */
  function newBlank() {
    openDocument(emptyWorksheet(), newDocId(), false, true);
  }

  /**
   * Load a worksheet object into the workspace as a fresh document (new library
   * id). Shared by file import and OS "open with".
   */
  function adoptWorksheet(ws: Worksheet) {
    openDocument(ws, newDocId(), false);
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
      openDocument(ws, id, true);
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

  /** Apply an edit to the open Worksheet. */
  const updateWorksheet = useCallback(
    (fn: (ws: Worksheet) => Worksheet) => setWorksheet((ws) => (ws ? fn(ws) : ws)),
    [],
  );

  /** Download a Worksheet File (.oalg) copy; the Library autosave is separate. */
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
        // Every Version's student pages, then every Version's Answer Key.
        buildTypstDocument(worksheet, { version: "all" }),
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

  if (!worksheet) return null;
  const hasProblems = worksheet.sections.some((sec) => sec.problems.length > 0);

  return (
    <Editor
      // A different document starts with a fresh selection, tab and zoom.
      key={docId ?? "doc"}
      worksheet={worksheet}
      onChange={updateWorksheet}
      topBar={
        <TopBar
          title={worksheet.title}
          onTitleChange={(title) => updateWorksheet((ws) => ({ ...ws, title }))}
          onHome={() => void goHome()}
          onOpen={open}
          onSaveCopy={save}
          onExport={exportPdf}
          onPrint={print}
          canExport={hasProblems}
          autosave={autosave}
          saving={saving}
          exporting={exporting}
          printing={printing}
          theme={theme}
          onThemeChange={setTheme}
        />
      }
    />
  );
}

export default App;
