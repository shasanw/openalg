import type { ParamSchema, ParamValues } from "./types";

/** Defaults and every single-option variant, including both integer boundaries. */
export function topicVariants(schema: ParamSchema): ParamValues[] {
  const out: ParamValues[] = [{}];
  for (const f of schema) {
    if (f.type === "enum") for (const o of f.options) out.push({ [f.key]: o.value });
    if (f.type === "boolean") out.push({ [f.key]: !f.default });
    if (f.type === "int") out.push({ [f.key]: f.min }, { [f.key]: f.max });
  }
  return out;
}
