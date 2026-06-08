// Generic, schema-driven options panel. Renders ANY generator's declared
// parameter schema — so adding a topic never requires touching this component.

import type { ParamField, ParamSchema, ParamValue, ParamValues } from "@/engine/types";
import { Input } from "@/components/ui/input";

export function OptionsPanel({
  schema,
  values,
  onChange,
}: {
  schema: ParamSchema;
  values: ParamValues;
  onChange: (next: ParamValues) => void;
}) {
  const set = (key: string, value: ParamValue) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="space-y-4">
      {schema.map((field) => (
        <Field
          key={field.key}
          field={field}
          value={values[field.key] ?? field.default}
          onChange={(v) => set(field.key, v)}
        />
      ))}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: ParamField;
  value: ParamValue;
  onChange: (v: ParamValue) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
        {field.label}
      </label>
    );
  }

  if (field.type === "int") {
    return (
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">{field.label}</span>
        <Input
          type="number"
          min={field.min}
          max={field.max}
          value={Number(value)}
          onChange={(e) => {
            const n = Math.round(Number(e.currentTarget.value));
            if (Number.isNaN(n)) return;
            onChange(Math.min(field.max, Math.max(field.min, n)));
          }}
        />
      </label>
    );
  }

  // enum
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{field.label}</span>
      <select
        className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        value={String(value)}
        onChange={(e) => onChange(e.currentTarget.value)}
      >
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
