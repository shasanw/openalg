// A Topic's Topic Options, rendered from the Topic's declared schema, so adding
// a Topic never requires touching this component. Booleans are switches,
// numbers are steppers showing their limits, and choices are a segmented
// control when they're few and short, otherwise a select.

import { useId } from "react";
import type { ParamField, ParamSchema, ParamValue, ParamValues } from "@/engine/types";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";

/** Drop a trailing "(...)" aside so a choice fits a segmented control. */
function shortLabel(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, "");
}

/** Few, short choices read best side by side; anything longer gets a select. */
function fitsSegmented(field: Extract<ParamField, { type: "enum" }>): boolean {
  return field.options.length <= 3 && field.options.every((o) => shortLabel(o.label).length <= 14);
}

export function TopicOptions({
  schema,
  values,
  onChange,
}: {
  schema: ParamSchema;
  values: ParamValues;
  onChange: (next: ParamValues) => void;
}) {
  if (schema.length === 0) {
    return <p className="text-muted-foreground">This Topic has no options.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {schema.map((field) => (
        <OptionField
          key={field.key}
          field={field}
          value={values[field.key] ?? field.default}
          onChange={(v) => onChange({ ...values, [field.key]: v })}
        />
      ))}
    </div>
  );
}

function OptionField({
  field,
  value,
  onChange,
}: {
  field: ParamField;
  value: ParamValue;
  onChange: (v: ParamValue) => void;
}) {
  const id = useId();
  if (field.type === "boolean") {
    return <Switch checked={Boolean(value)} onCheckedChange={onChange} label={field.label} />;
  }
  if (field.type === "int") {
    return (
      <Field label={field.label} inline hint={`${field.min} to ${field.max}`}>
        <Stepper
          label={field.label}
          value={Number(value)}
          min={field.min}
          max={field.max}
          onChange={onChange}
        />
      </Field>
    );
  }
  if (fitsSegmented(field)) {
    return (
      <Field label={field.label}>
        <Segmented
          full
          label={field.label}
          value={String(value)}
          options={field.options.map((o) => ({
            value: o.value,
            label: shortLabel(o.label),
            title: o.label,
          }))}
          onChange={onChange}
        />
      </Field>
    );
  }
  return (
    <Field label={field.label} htmlFor={id}>
      <Select id={id} value={String(value)} options={field.options} onChange={onChange} />
    </Field>
  );
}
