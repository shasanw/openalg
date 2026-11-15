// The Worksheet editor (#30): Section outline on the left, the exact Preview in
// the middle, and the tabbed Inspector on the right. It owns the editor's view
// state (selected Section, Inspector tab, picker, Preview copy and zoom) and
// turns every edit into a new Worksheet through the engine's Section helpers;
// the App owns the Worksheet itself and keeps it in the Library.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getGenerator } from "@/engine/registry";
import { resolveParams } from "@/engine/types";
import {
  addSection,
  buildSection,
  DEFAULT_SECTION_PROBLEMS,
  duplicateSection,
  moveSection,
  regenerateAll,
  regenerateSection,
  removeSection,
  sectionLetter,
  setResponseFormat,
  setSectionCount,
  setSectionDirections,
  setSectionParams,
  setVersionSettings,
  type Worksheet,
} from "@/engine/worksheet";
import { useToast } from "@/components/ui/toast";
import { randomSeed } from "@/lib/randomSeed";
import { Inspector, type InspectorTab, type SectionActions } from "@/components/shell/Inspector";
import { Preview, type PreviewView } from "@/components/shell/Preview";
import { SectionOutline } from "@/components/shell/SectionOutline";
import { TopicPicker } from "@/components/shell/TopicPicker";

type Update = (fn: (ws: Worksheet) => Worksheet) => void;

export function Editor({
  worksheet,
  onChange,
  topBar,
}: {
  worksheet: Worksheet;
  /** Apply an edit to the open Worksheet. */
  onChange: Update;
  /** The top bar, rendered above the three panes. */
  topBar: ReactNode;
}) {
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<InspectorTab>("section");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState<PreviewView>("student");
  const [zoom, setZoom] = useState(1);
  const { toast } = useToast();

  const count = worksheet.sections.length;
  // Keep the selection on a real Section as Sections come and go.
  const current = Math.max(0, Math.min(selected, count - 1));

  const openPicker = useCallback(() => setPickerOpen(true), []);

  // Cmd/Ctrl+K opens the Add Section picker from anywhere in the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPickerOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function select(i: number) {
    setSelected(i);
    setTab("section");
  }

  function add(generatorId: string) {
    const topic = getGenerator(generatorId);
    if (!topic) return;
    const section = buildSection({
      generatorId,
      params: resolveParams(topic.schema, {}),
      baseSeed: randomSeed(),
      count: DEFAULT_SECTION_PROBLEMS,
    });
    onChange((ws) => addSection(ws, section));
    setPickerOpen(false);
    select(count);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= count) return;
    onChange((ws) => moveSection(ws, from, to));
    setSelected(to);
  }

  function remove(i: number) {
    const removed = worksheet.sections[i];
    if (!removed) return;
    const topic = getGenerator(removed.generatorId);
    onChange((ws) => removeSection(ws, i));
    setSelected(Math.max(0, i - 1));
    toast({
      title: `Deleted Section ${sectionLetter(i)}`,
      description: topic?.title,
      action: {
        label: "Undo",
        onClick: () => {
          // Put the Section back where it was, keeping any edits made since.
          onChange((ws) => addSection(ws, removed, i));
          setSelected(i);
        },
      },
    });
  }

  const i = current;
  const sectionActions: SectionActions = {
    setParams: (params) => onChange((ws) => setSectionParams(ws, i, params)),
    setCount: (n) => onChange((ws) => setSectionCount(ws, i, n)),
    setDirections: (d) => onChange((ws) => setSectionDirections(ws, i, d)),
    regenerate: () => onChange((ws) => regenerateSection(ws, i, randomSeed())),
    moveUp: () => move(i, i - 1),
    moveDown: () => move(i, i + 1),
    duplicate: () => {
      onChange((ws) => duplicateSection(ws, i, randomSeed()));
      setSelected(i + 1);
    },
    remove: () => remove(i),
  };

  return (
    <div className="bg-background flex h-screen flex-col">
      {topBar}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(200px,264px)_minmax(0,1fr)_minmax(280px,320px)]">
        <SectionOutline
          worksheet={worksheet}
          selected={current}
          onSelect={select}
          onMove={move}
          onAdd={openPicker}
        />
        <Preview
          worksheet={worksheet}
          view={view}
          onViewChange={setView}
          zoom={zoom}
          onZoomChange={setZoom}
          onAddSection={openPicker}
        />
        <Inspector
          tab={tab}
          onTabChange={setTab}
          worksheet={worksheet}
          selected={current}
          section={sectionActions}
          onAddSection={openPicker}
          onResponseFormatChange={(rf) => onChange((ws) => setResponseFormat(ws, rf))}
          onAnswerKeyFormatChange={(answerKeyFormat) => onChange((ws) => ({ ...ws, answerKeyFormat }))}
          onVersionsChange={(v) => onChange((ws) => setVersionSettings(ws, v))}
          onPrintChange={(print) => onChange((ws) => ({ ...ws, print }))}
          onRegenerateAll={() => onChange((ws) => regenerateAll(ws, randomSeed()))}
        />
      </div>
      <TopicPicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={add} />
    </div>
  );
}
