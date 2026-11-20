// Calculator logic for the Mini App: evaluation with user prefs, error mapping, keypad editing. Pure, DOM-free.
// Uses the same evaluator as the bot (worker/src/calc), so results are identical to the chat.

import { CalcError, type CalcErrorCode } from "../../../worker/src/calc/errors";
import { Decimal } from "../../../worker/src/calc/decimal";
import { evaluate } from "../../../worker/src/calc/evaluate";
import { formatRaw, formatResult, type Prefs } from "./num";

export type ErrKey = "err_syntax" | "err_div0" | "err_domain" | "err_overflow" | "err_unknown" | "err_too_long";

export interface CalcFailure {
  key: ErrKey;
  params: Record<string, string | number>;
  /** UTF-16 offset of a syntax error, when known. */
  pos?: number;
}

export type CalcOutcome =
  | { ok: true; text: string; raw: string; value: Decimal }
  | { ok: false; error: CalcFailure };

const CODE_TO_KEY: Record<CalcErrorCode, ErrKey> = {
  syntax: "err_syntax",
  div0: "err_div0",
  domain: "err_domain",
  overflow: "err_overflow",
  unknown_ident: "err_unknown",
  arg_count: "err_syntax",
  too_long: "err_too_long",
  too_deep: "err_too_long",
};

export function mapError(e: CalcError): CalcFailure {
  const key = CODE_TO_KEY[e.code] ?? "err_syntax";
  const params: Record<string, string | number> = { pos: (e.pos ?? 0) + 1, name: e.ident ?? e.fn ?? "?" };
  return e.pos === undefined ? { key, params } : { key, params, pos: e.pos };
}

/** Evaluates an expression the way the chat bot does; `ans` feeds the `ans` / `_` variables. */
export function runCalc(expr: string, prefs: Prefs, ans?: Decimal | null): CalcOutcome {
  const r = evaluate(expr, { angle: prefs.angle, vars: ans ? { ans, _: ans } : {} });
  if (!r.ok) return { ok: false, error: mapError(r.error) };
  return { ok: true, value: r.value, text: formatResult(r.value, prefs), raw: formatRaw(r.value, prefs.digits) };
}

// ---------- keypad ----------

export interface KeyDef {
  id: string;
  /** Text shown on the key. */
  label: string;
  /** Text inserted into the expression (functions end with an opening bracket). */
  insert?: string;
  kind: "digit" | "op" | "fn" | "const" | "ctl";
}

/** Main 4x5 pad. Order is row-major. */
export const MAIN_PAD: readonly KeyDef[] = [
  { id: "ac", label: "AC", kind: "ctl" },
  { id: "lp", label: "(", insert: "(", kind: "op" },
  { id: "rp", label: ")", insert: ")", kind: "op" },
  { id: "div", label: "÷", insert: "/", kind: "op" },
  { id: "7", label: "7", insert: "7", kind: "digit" },
  { id: "8", label: "8", insert: "8", kind: "digit" },
  { id: "9", label: "9", insert: "9", kind: "digit" },
  { id: "mul", label: "×", insert: "*", kind: "op" },
  { id: "4", label: "4", insert: "4", kind: "digit" },
  { id: "5", label: "5", insert: "5", kind: "digit" },
  { id: "6", label: "6", insert: "6", kind: "digit" },
  { id: "sub", label: "−", insert: "-", kind: "op" },
  { id: "1", label: "1", insert: "1", kind: "digit" },
  { id: "2", label: "2", insert: "2", kind: "digit" },
  { id: "3", label: "3", insert: "3", kind: "digit" },
  { id: "add", label: "+", insert: "+", kind: "op" },
  { id: "0", label: "0", insert: "0", kind: "digit" },
  { id: "dot", label: ".", insert: ".", kind: "digit" },
  { id: "bs", label: "⌫", kind: "ctl" },
  { id: "eq", label: "=", kind: "ctl" },
];

/** Scientific chips (scrollable strip above the main pad). */
export const SCI_KEYS: readonly KeyDef[] = [
  { id: "sin", label: "sin", insert: "sin(", kind: "fn" },
  { id: "cos", label: "cos", insert: "cos(", kind: "fn" },
  { id: "tan", label: "tan", insert: "tan(", kind: "fn" },
  { id: "asin", label: "sin⁻¹", insert: "asin(", kind: "fn" },
  { id: "acos", label: "cos⁻¹", insert: "acos(", kind: "fn" },
  { id: "atan", label: "tan⁻¹", insert: "atan(", kind: "fn" },
  { id: "ln", label: "ln", insert: "ln(", kind: "fn" },
  { id: "log", label: "log", insert: "log(", kind: "fn" },
  { id: "sqrt", label: "√", insert: "√(", kind: "fn" },
  { id: "cbrt", label: "∛", insert: "cbrt(", kind: "fn" },
  { id: "pow", label: "xʸ", insert: "^", kind: "op" },
  { id: "sq", label: "x²", insert: "^2", kind: "op" },
  { id: "fact", label: "n!", insert: "!", kind: "op" },
  { id: "pct", label: "%", insert: "%", kind: "op" },
  { id: "abs", label: "|x|", insert: "abs(", kind: "fn" },
  { id: "exp", label: "eˣ", insert: "exp(", kind: "fn" },
  { id: "pi", label: "π", insert: "pi", kind: "const" },
  { id: "e", label: "e", insert: "e", kind: "const" },
  { id: "ans", label: "Ans", insert: "ans", kind: "const" },
  { id: "comma", label: ",", insert: ",", kind: "op" },
];

export interface EditState {
  text: string;
  /** Selection start/end (UTF-16 offsets); equal for a caret. */
  start: number;
  end: number;
}

const FN_OPEN = /(?:[A-Za-z_][A-Za-z0-9_]*|√)\($/;

/** Inserts `ins` at the selection. A function key over a selection wraps it: sin(<selection>). */
export function insertAt(s: EditState, ins: string): EditState {
  const a = Math.max(0, Math.min(s.start, s.end));
  const b = Math.max(0, Math.max(s.start, s.end));
  const before = s.text.slice(0, a);
  const sel = s.text.slice(a, b);
  const after = s.text.slice(b);
  if (sel !== "" && ins.endsWith("(")) {
    const text = before + ins + sel + ")" + after;
    const caret = (before + ins + sel + ")").length;
    return { text, start: caret, end: caret };
  }
  const text = before + ins + after;
  const caret = before.length + ins.length;
  return { text, start: caret, end: caret };
}

/** Backspace: deletes the selection, else the previous character (a whole "name(" at once). */
export function backspace(s: EditState): EditState {
  const a = Math.min(s.start, s.end);
  const b = Math.max(s.start, s.end);
  if (a !== b) return { text: s.text.slice(0, a) + s.text.slice(b), start: a, end: a };
  if (a === 0) return s;
  const before = s.text.slice(0, a);
  const m = FN_OPEN.exec(before);
  const cut = m ? m[0].length : Array.from(before.slice(-2)).length === 1 && before.length >= 2 && /[\uDC00-\uDFFF]/.test(before[before.length - 1]) ? 2 : 1;
  const nb = before.slice(0, before.length - cut);
  return { text: nb + s.text.slice(a), start: nb.length, end: nb.length };
}

/** Applies a keypad key to the editing state. Returns the same state for control keys that the UI handles. */
export function applyKey(s: EditState, key: KeyDef): EditState {
  if (key.id === "bs") return backspace(s);
  if (key.id === "ac") return { text: "", start: 0, end: 0 };
  if (key.insert === undefined) return s;
  return insertAt(s, key.insert);
}
