// The right pane: a tabbed Inspector. Each tab edits one level only:
// - Section: the selected Section (Topic Options, Problem count, Directions);
// - Worksheet: whole-sheet content choices (Question type, Answer Key);
// - Print: the Print Settings.
// A footer button regenerates every Section at once.

import { useId, type ReactNode } from "react";
import { Tabs } from "radix-ui";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Info,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { listingFor } from "@/engine/courses";
import { getGenerator } from "@/engine/registry";
import { MAX_CHOICES, MIN_CHOICES } from "@/engine/mc";
import type { ParamValues } from "@/engine/types";
import { versionsAreIdentical } from "@/engine/versions";
import {
  ANSWER_KEY_FORMATS,
  MAX_SECTION_PROBLEMS,
  MAX_VERSIONS,
  MIN_SECTION_PROBLEMS,
  MIN_VERSIONS,
  sectionLetter,
  sectionRanges,
  type AnswerKeyFormat,
  type PrintConfig,
  type ResponseFormat,
  type ScrambleMode,
  type VersionSettings,
  type Worksheet,
} from "@/engine/worksheet";
import { TopicOptions } from "@/components/TopicOptions";
import { Button } from "@/components/ui/button";
import { Field, GroupLabel, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { ANSWER_KEY_LABELS } from "@/components/shell/answerKey";
import { rangeLabel } from "@/components/shell/SectionOutline";

export type InspectorTab = "section" | "worksheet" | "print";

/** Everything the Section tab can do to the selected Section. */
export interface SectionActions {
  setParams: (params: ParamValues) => void;
  setCount: (count: number) => void;
  setDirections: (directions: string) => void;
  regenerate: () => void;
  moveUp: () => void;
  moveDown: () => void;
  duplicate: () => void;
  remove: () => void;
}

export function Inspector({
  tab,
  onTabChange,
  worksheet,
  selected,
  section,
  onAddSection,
  onResponseFormatChange,
  onAnswerKeyFormatChange,
  onVersionsChange,
  onPrintChange,
  onRegenerateAll,
}: {
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  worksheet: Worksheet;
  /** Index of the selected Section (meaningless when there are none). */
  selected: number;
  section: SectionActions;
  onAddSection: () => void;
  onResponseFormatChange: (next: ResponseFormat) => void;
  onAnswerKeyFormatChange: (next: AnswerKeyFormat) => void;
  onVersionsChange: (next: VersionSettings) => void;
  onPrintChange: (next: PrintConfig) => void;
  onRegenerateAll: () => void;
}) {
  const tabs: { value: InspectorTab; label: string }[] = [
    { value: "section", label: "Section" },
    { value: "worksheet", label: "Worksheet" },
    { value: "print", label: "Print" },
  ];
  return (
    <Tabs.Root
      asChild
      value={tab}
      onValueChange={(v) => onTabChange(v as InspectorTab)}
    >
      <aside aria-label="Inspector" className="bg-panel flex min-h-0 flex-col border-l">
        <Tabs.List aria-label="Inspector" className="flex h-11 shrink-0 items-end gap-5 border-b px-4">
          {tabs.map((t) => (
            <Tabs.Trigger
              key={t.value}
              value={t.value}
              className="text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground -mb-px rounded-t-sm border-b-2 border-transparent pb-2.5 font-medium transition-colors"
            >
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Tabs.Content value="section" className="p-4 outline-none">
            <SectionPanel
              worksheet={worksheet}
              index={selected}
              actions={section}
              onAddSection={onAddSection}
            />
          </Tabs.Content>
          <Tabs.Content value="worksheet" className="p-4 outline-none">
            <WorksheetPanel
              worksheet={worksheet}
              onResponseFormatChange={onResponseFormatChange}
              onAnswerKeyFormatChange={onAnswerKeyFormatChange}
              onVersionsChange={onVersionsChange}
            />
          </Tabs.Content>
          <Tabs.Content value="print" className="p-4 outline-none">
            <PrintPanel value={worksheet.print} onChange={onPrintChange} />
          </Tabs.Content>
        </div>

        <div className="border-t p-3">
          <Button
            className="w-full"
            onClick={onRegenerateAll}
            disabled={worksheet.sections.length === 0}
          >
            <RefreshCw /> Regenerate all Sections
          </Button>
        </div>
      </aside>
    </Tabs.Root>
  );
}

function SectionPanel({
  worksheet,
  index,
  actions,
  onAddSection,
}: {
  worksheet: Worksheet;
  index: number;
  actions: SectionActions;
  onAddSection: () => void;
}) {
  const directionsId = useId();
  const section = worksheet.sections[index];
  if (!section) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground leading-relaxed">
          Add a Section to choose its Topic Options, Problem count and Directions here.
        </p>
        <Button onClick={onAddSection}>
          <Plus /> Add Section
        </Button>
      </div>
    );
  }
  const topic = getGenerator(section.generatorId);
  const letter = sectionLetter(index);
  const last = worksheet.sections.length - 1;
  const range = sectionRanges(worksheet)[index];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-subtle-foreground text-[11px] font-semibold tracking-[0.06em] uppercase">
            Section {letter}
            {topic && ` · ${listingFor(topic.id)?.unit ?? ""}`}
          </div>
          <h2 className="mt-0.5 text-[15px] leading-snug font-semibold">
            {topic?.title ?? section.generatorId}
          </h2>
          <p className="text-muted-foreground mt-0.5 text-[12px] tabular-nums">{rangeLabel(range)}</p>
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="quiet" size="icon" aria-label={`Section ${letter} actions`}>
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={actions.moveUp} disabled={index === 0} hint="Alt ↑">
              <ArrowUp /> Move up
            </MenuItem>
            <MenuItem onSelect={actions.moveDown} disabled={index === last} hint="Alt ↓">
              <ArrowDown /> Move down
            </MenuItem>
            <MenuItem onSelect={actions.duplicate}>
              <Copy /> Duplicate
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={actions.remove} danger>
              <Trash2 /> Delete Section
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <Field label="Problems" inline hint={`${MIN_SECTION_PROBLEMS} to ${MAX_SECTION_PROBLEMS}`}>
        <Stepper
          label="Problems in this Section"
          value={section.count}
          min={MIN_SECTION_PROBLEMS}
          max={MAX_SECTION_PROBLEMS}
          onChange={actions.setCount}
        />
      </Field>

      <Field label="Directions" htmlFor={directionsId} hint="Printed above this Section's Problems.">
        <Textarea
          id={directionsId}
          rows={2}
          value={section.directions}
          onChange={(e) => actions.setDirections(e.currentTarget.value)}
        />
      </Field>

      <div className="flex flex-col gap-3 border-t pt-4">
        <GroupLabel>Topic Options</GroupLabel>
        {topic ? (
          <TopicOptions schema={topic.schema} values={section.params} onChange={actions.setParams} />
        ) : (
          <p className="text-muted-foreground">This Topic isn't available in this version of OpenAlg.</p>
        )}
      </div>

      <Button onClick={actions.regenerate} disabled={!topic}>
        <RefreshCw /> New problems for this Section
      </Button>
    </div>
  );
}

const CHOICE_COUNTS = Array.from({ length: MAX_CHOICES - MIN_CHOICES + 1 }, (_, i) => MIN_CHOICES + i);

function WorksheetPanel({
  worksheet,
  onResponseFormatChange,
  onAnswerKeyFormatChange,
  onVersionsChange,
}: {
  worksheet: Worksheet;
  onResponseFormatChange: (next: ResponseFormat) => void;
  onAnswerKeyFormatChange: (next: AnswerKeyFormat) => void;
  onVersionsChange: (next: VersionSettings) => void;
}) {
  const keyId = useId();
  const rf = worksheet.responseFormat;
  return (
    <div className="flex flex-col gap-5">
      <Field label="Question type" hint="Applies to every Section.">
        <Segmented
          full
          label="Question type"
          value={rf.mode}
          options={[
            { value: "free-response", label: "Free response" },
            { value: "multiple-choice", label: "Multiple choice" },
          ]}
          onChange={(mode) => onResponseFormatChange({ ...rf, mode })}
        />
      </Field>
      {rf.mode === "multiple-choice" && (
        <Field label="Choices per problem" inline>
          <Segmented
            size="sm"
            label="Choices per problem"
            value={rf.choices}
            options={CHOICE_COUNTS.map((n) => ({ value: n, label: String(n) }))}
            onChange={(choices) => onResponseFormatChange({ ...rf, choices })}
          />
        </Field>
      )}
      <Field
        label="Answer Key"
        htmlFor={keyId}
        hint={ANSWER_KEY_LABELS[worksheet.answerKeyFormat].description}
      >
        <Select
          id={keyId}
          value={worksheet.answerKeyFormat}
          options={ANSWER_KEY_FORMATS.map((k) => ({ value: k, label: ANSWER_KEY_LABELS[k].name }))}
          onChange={onAnswerKeyFormatChange}
        />
      </Field>
      <div className="border-t pt-5">
        <VersionsControls
          value={worksheet.versions}
          onChange={onVersionsChange}
          identical={versionsAreIdentical(worksheet)}
        />
      </div>
    </div>
  );
}

const SCRAMBLE_MODES: { value: ScrambleMode; label: string; hint: string }[] = [
  {
    value: "scramble-order",
    label: "Shuffle problem order",
    hint: "Same Problems, in a different order within each Section.",
  },
  {
    value: "scramble-choices",
    label: "Shuffle answer choices",
    hint: "Same Problems in the same order; the multiple-choice letters move.",
  },
  {
    value: "new-questions",
    label: "New problems",
    hint: "Fresh Problems from the same Topic Options. Hand-picked Problems are replaced.",
  },
];

/** How many Versions print (each with its own Answer Key) and how they differ. */
function VersionsControls({
  value,
  onChange,
  identical,
}: {
  value: VersionSettings;
  onChange: (next: VersionSettings) => void;
  /** True when every Version would print the same (see versionsAreIdentical). */
  identical: boolean;
}) {
  const modeId = useId();
  const mode = SCRAMBLE_MODES.find((o) => o.value === value.mode) ?? SCRAMBLE_MODES[0];
  const many = value.count > 1;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Versions" inline hint={`${MIN_VERSIONS} to ${MAX_VERSIONS}, each with its own Answer Key`}>
        <Stepper
          label="Versions"
          value={value.count}
          min={MIN_VERSIONS}
          max={MAX_VERSIONS}
          onChange={(count) => onChange({ ...value, count })}
        />
      </Field>
      {many && (
        <Field label="Versions differ by" htmlFor={modeId} hint={mode.hint}>
          <Select
            id={modeId}
            value={value.mode}
            options={SCRAMBLE_MODES}
            onChange={(m) => onChange({ ...value, mode: m })}
          />
        </Field>
      )}
      {many && identical && (
        <p
          role="note"
          className="bg-muted border-border-strong flex gap-2 rounded-md border px-2.5 py-2 leading-snug"
        >
          <Info className="text-muted-foreground mt-px size-4 shrink-0" />
          <span>
            These are free-response Problems, so every Version will print the same. Switch to
            multiple choice, or pick another option.
          </span>
        </p>
      )}
      {many && (
        <p className="text-muted-foreground text-[12px] leading-snug">
          Printing gives every Version, then each Version&apos;s Answer Key.
        </p>
      )}
    </div>
  );
}

const PAPER = [
  { value: "us-letter", label: "US Letter" },
  { value: "a4", label: "A4" },
  { value: "legal", label: "Legal" },
] as const;
const ORIENTATION = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
] as const;
const MARGIN = [
  { value: "narrow", label: "Narrow" },
  { value: "normal", label: "Normal" },
  { value: "wide", label: "Wide" },
] as const;
const TEXT_SIZE = [
  { value: "small", label: "Small" },
  { value: "normal", label: "Normal" },
  { value: "large", label: "Large" },
] as const;

function PrintPanel({
  value,
  onChange,
}: {
  value: PrintConfig;
  onChange: (next: PrintConfig) => void;
}) {
  const set = <K extends keyof PrintConfig>(key: K, v: PrintConfig[K]) =>
    onChange({ ...value, [key]: v });
  const ids = { paper: useId(), orientation: useId(), margin: useId(), size: useId() };
  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground leading-snug">
        Print Settings apply to the Preview, the printout and the exported PDF.
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <SelectField label="Paper" id={ids.paper}>
          <Select id={ids.paper} value={value.paper} options={PAPER} onChange={(v) => set("paper", v)} />
        </SelectField>
        <SelectField label="Orientation" id={ids.orientation}>
          <Select
            id={ids.orientation}
            value={value.orientation}
            options={ORIENTATION}
            onChange={(v) => set("orientation", v)}
          />
        </SelectField>
        <SelectField label="Margins" id={ids.margin}>
          <Select id={ids.margin} value={value.margin} options={MARGIN} onChange={(v) => set("margin", v)} />
        </SelectField>
        <SelectField label="Text size" id={ids.size}>
          <Select id={ids.size} value={value.fontSize} options={TEXT_SIZE} onChange={(v) => set("fontSize", v)} />
        </SelectField>
      </div>
      <Field label="Work space" hint="Room under each free-response Problem.">
        <Segmented
          full
          label="Work space"
          value={value.spacing}
          options={[
            { value: "tight", label: "Tight" },
            { value: "normal", label: "Normal" },
            { value: "roomy", label: "Roomy" },
          ]}
          onChange={(v) => set("spacing", v)}
        />
      </Field>
      <div className="flex flex-col gap-3 border-t pt-4">
        <Switch
          checked={value.showNameDatePeriod}
          onCheckedChange={(v) => set("showNameDatePeriod", v)}
          label="Name, Date and Period blanks"
        />
        <Switch
          checked={value.pageNumbers}
          onCheckedChange={(v) => set("pageNumbers", v)}
          label="Page numbers"
        />
      </div>
    </div>
  );
}

function SelectField({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <Field label={label} htmlFor={id}>
      {children}
    </Field>
  );
}
