// Minimal strict JSON-schema style validation (no dependency): unknown keys are rejected.

export type Rule =
  | { kind: "enum"; values: readonly string[] }
  | { kind: "int"; min: number; max: number }
  | { kind: "bool" }
  | { kind: "string"; min: number; max: number };

export type Spec = Record<string, Rule>;
export type Validated = { ok: true; value: Record<string, string | number | boolean> } | { ok: false; error: string };

// C0 control characters other than tab/newline are never legitimate in expressions.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

function check(rule: Rule, v: unknown): boolean {
  switch (rule.kind) {
    case "enum":
      return typeof v === "string" && rule.values.includes(v);
    case "int":
      return typeof v === "number" && Number.isInteger(v) && v >= rule.min && v <= rule.max;
    case "bool":
      return typeof v === "boolean";
    case "string":
      return typeof v === "string" && v.length >= rule.min && v.length <= rule.max && !CONTROL.test(v);
  }
}

/** `required` lists mandatory keys; `nonEmpty` demands at least one known key (partial updates). */
export function validate(raw: unknown, spec: Spec, opts: { required?: string[]; nonEmpty?: boolean } = {}): Validated {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "body must be a JSON object" };
  const out: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(raw)) {
    const rule = Object.hasOwn(spec, key) ? spec[key] : undefined;
    if (!rule) return { ok: false, error: `unknown field: ${key.slice(0, 32)}` };
    const v = (raw as Record<string, unknown>)[key];
    if (!check(rule, v)) return { ok: false, error: `invalid field: ${key}` };
    out[key] = v as string | number | boolean;
  }
  for (const key of opts.required ?? []) if (!(key in out)) return { ok: false, error: `missing field: ${key}` };
  if (opts.nonEmpty && Object.keys(out).length === 0) return { ok: false, error: "no fields" };
  return { ok: true, value: out };
}
