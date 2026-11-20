// "100 usd to uzs", "5 km in mi", "20 c to f", "$50 in som", "/convert 100 km mi" -> ConvertQuery -> result.
// A query is produced only when both sides are known units or currencies, so plain arithmetic
// such as "3 to 4" or "5 in" is never captured.

import { convertCurrency, findCurrency, type FxRates } from "./currency";
import { Decimal } from "./decimal";
import { evaluate } from "./evaluate";
import { convertUnit, findUnit, resolveUnitPair, UnitError, type UnitRef } from "./units";

export interface ConvertQuery {
  value: Decimal;
  /** unit: both sides are units; currency: both are currencies; mismatch: one unit and one currency. */
  kind: "unit" | "currency" | "mismatch";
  /** Canonical unit code or ISO currency code. */
  from: string;
  to: string;
  fromUnit?: UnitRef;
  toUnit?: UnitRef;
}

export type ConvertResult =
  | { ok: true; value: Decimal; from: string; to: string; kind: "unit" | "currency" }
  | { ok: false; code: "units_mismatch" | "unknown_unit" | "no_rate" | "overflow"; pair?: string };

const MAX_INPUT = 200;
const MAX_TOKENS = 40;
const CONNECTORS = new Set(["to", "in", "into", "as", "ga", "в", "на", "na", "en", "a", "->", "→", "=>", "⇒", "➔", "➜", "="]);
const SYMBOLS = "$€£¥₽₺₸₴₹₩₼₾";
const UNIT_START = /[\p{L}°$€£¥₽₺₸₴₹₩₼₾元円′″]/u;

interface Side {
  unit: UnitRef | null;
  ccy: string | null;
}

function side(text: string): Side {
  return { unit: findUnit(text), ccy: findCurrency(text) };
}

function decide(l: Side, r: Side): Omit<ConvertQuery, "value"> | null {
  if (l.ccy && r.ccy) return { kind: "currency", from: l.ccy, to: r.ccy };
  if (l.unit && r.unit) return { kind: "unit", from: l.unit.code, to: r.unit.code, fromUnit: l.unit, toUnit: r.unit };
  const lc = l.ccy ?? l.unit?.code;
  const rc = r.ccy ?? r.unit?.code;
  if ((l.unit || l.ccy) && (r.unit || r.ccy) && lc && rc) return { kind: "mismatch", from: lc, to: rc };
  return null;
}

/** Strip digit grouping ("1 000 000", "1,000", "1,5") so the calculator parser sees a plain number. */
function cleanExpr(expr: string): string {
  let s = expr.trim();
  for (let i = 0; i < 6; i++) {
    const t = s.replace(/(\d) (\d{3})(?!\d)/g, "$1$2");
    if (t === s) break;
    s = t;
  }
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  return s;
}

function evalValue(expr: string): Decimal | null {
  if (expr === "") return null;
  const r = evaluate(cleanExpr(expr));
  return r.ok ? r.value : null;
}

function tryPair(left: string, rightRaw: string): ConvertQuery | null {
  const right = rightRaw.replace(/[?!.,;:=\s]+$/u, "").trim();
  if (right === "" || right.length > 48) return null;
  const r = side(right);
  if (!r.unit && !r.ccy) return null;
  const l = left.trim();
  if (l === "") return null;

  // Symbol prefix: "$50", "€ 100".
  if (SYMBOLS.includes(l[0])) {
    const d = decide(side(l[0]), r);
    if (d) {
      const v = evalValue(l.slice(1));
      if (v) return { value: v, ...d };
    }
  }
  // Unit suffix: the longest tail that is a unit/currency, preceded by a digit, ")" or space.
  for (let p = 1; p < l.length; p++) {
    if (!UNIT_START.test(l[p]) || !/[\d)\s%\]]/.test(l[p - 1])) continue;
    const text = l.slice(p).trim();
    if (text.length > 48) continue;
    const d = decide(side(text), r);
    if (!d) continue;
    const v = evalValue(l.slice(0, p));
    if (v) return { value: v, ...d };
  }
  return null;
}

/** Parse a conversion request; null when it is not one (never throws). */
export function parseConvertQuery(input: string): ConvertQuery | null {
  try {
    if (typeof input !== "string" || input.length === 0 || input.length > MAX_INPUT) return null;
    let s = input.replace(/[   ]/g, " ").trim();
    let hasCmd = false;
    const cmd = /^\/[A-Za-z_]+(?:@\w+)?(?:\s+|$)/.exec(s);
    if (cmd) {
      hasCmd = true;
      s = s.slice(cmd[0].length);
    }
    s = s.replace(/(->|=>|→|⇒|➔|➜|=)/g, " $1 ");
    const tokens = s.split(/\s+/).filter(Boolean);
    if (tokens.length < 2 || tokens.length > MAX_TOKENS) return null;
    for (let i = 1; i < tokens.length - 1; i++) {
      if (!CONNECTORS.has(tokens[i].toLowerCase())) continue;
      const q = tryPair(tokens.slice(0, i).join(" "), tokens.slice(i + 1).join(" "));
      if (q) return q;
    }
    if (hasCmd) {
      // "/convert 100 km mi": the unit to convert to is the tail.
      for (let k = 1; k <= 3 && tokens.length - k >= 2; k++) {
        const q = tryPair(tokens.slice(0, tokens.length - k).join(" "), tokens.slice(tokens.length - k).join(" "));
        if (q) return q;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Run a parsed query. `rates` is only needed for currency queries. Never throws. */
export function runConvert(q: ConvertQuery, rates: FxRates | null): ConvertResult {
  try {
    const pair = `${q.from}/${q.to}`;
    if (q.kind === "mismatch") return { ok: false, code: "units_mismatch", pair };
    if (q.kind === "unit") {
      if (!q.fromUnit || !q.toUnit) return { ok: false, code: "unknown_unit", pair };
      const eff = resolveUnitPair(q.fromUnit, q.toUnit);
      if (!eff) return { ok: false, code: "units_mismatch", pair };
      return { ok: true, value: convertUnit(q.value, q.fromUnit, q.toUnit), from: eff[0].code, to: eff[1].code, kind: "unit" };
    }
    if (!rates) return { ok: false, code: "no_rate", pair };
    const v = convertCurrency(q.value, q.from, q.to, rates);
    if (!v) return { ok: false, code: "no_rate", pair };
    return { ok: true, value: v, from: q.from, to: q.to, kind: "currency" };
  } catch (e) {
    if (e instanceof UnitError) return { ok: false, code: "units_mismatch", pair: `${q.from}/${q.to}` };
    return { ok: false, code: "overflow", pair: `${q.from}/${q.to}` };
  }
}
