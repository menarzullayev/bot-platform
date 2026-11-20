// Pure-ish calculation front end: text in, a structured outcome out. No Telegram, no D1 (rates come through a callback).

import {
  CalcError,
  Decimal,
  evaluate,
  formatDecimal,
  formatLocale,
  parseConvertQuery,
  runConvert,
  type AngleMode,
  type ConvertQuery,
  type FxRates,
} from "../../calc";
import { isStale } from "../../fx/store";
import type { Lang, MessageKey } from "../../i18n";

export const MAX_INPUT_LEN = 1000;

export type ErrKey = Extract<
  MessageKey,
  | "err_syntax"
  | "err_div0"
  | "err_domain"
  | "err_overflow"
  | "err_unknown"
  | "err_too_long"
  | "err_units_mismatch"
  | "err_no_rate"
  | "err_generic"
>;

export interface CalcOk {
  kind: "calc";
  expr: string;
  /** Localized result, e.g. "1 234,5". */
  result: string;
  value: Decimal;
  /** Alternative renderings of the same value (rounded, scientific); excludes `result`. */
  variants: string[];
}

export interface ConvertOk {
  kind: "convert";
  expr: string;
  /** "100 km". */
  fromText: string;
  /** "62,1371 mi". */
  result: string;
  value: Decimal;
  variants: string[];
  /** Present for currency conversions. */
  fx?: { updatedAt: number; stale: boolean };
}

export interface ErrOut {
  kind: "error";
  key: ErrKey;
  params: Record<string, string | number>;
}

export interface NotMath {
  kind: "not_math";
}

export type Computed = CalcOk | ConvertOk | ErrOut | NotMath;

export interface ComputeOptions {
  lang: Lang;
  angle: AngleMode;
  digits: number;
  ans?: Decimal;
  /** Unix seconds. */
  now: number;
  /** Lazy FX table loader; only called for currency conversions. */
  getRates: () => Promise<FxRates | null>;
}

const err = (key: ErrKey, params: Record<string, string | number> = {}): ErrOut => ({ kind: "error", key, params });

export function mapCalcError(e: CalcError): ErrOut {
  switch (e.code) {
    case "syntax":
    case "arg_count":
      return err("err_syntax", { pos: (e.pos ?? 0) + 1 });
    case "div0":
      return err("err_div0");
    case "domain":
      return err("err_domain");
    case "overflow":
      return err("err_overflow");
    case "unknown_ident":
      return err("err_unknown", { name: e.ident ?? e.fn ?? "?" });
    case "too_long":
    case "too_deep":
      return err("err_too_long");
    default:
      return err("err_generic");
  }
}

/** Display string of a value for a language and precision (significant digits). */
export function fmt(value: Decimal, lang: Lang, digits: number): string {
  return formatLocale(value, lang, { significant: digits });
}

/** The result plus up to two alternative renderings (2 decimals, scientific). Unique, main first. */
export function renderings(value: Decimal, lang: Lang, digits: number): string[] {
  const out = [fmt(value, lang, digits)];
  if (value.isZero()) return out;
  const r2 = formatLocale(value, lang, { significant: 30, sciUpper: 40, maxFraction: 2 });
  if (r2 !== "0" && !out.includes(r2)) out.push(r2);
  const e = value.abs().exponent;
  if (e >= 4 || e <= -4) {
    const sci = formatDecimal(value, { ...formatLocale(lang), significant: Math.min(digits, 10), sciUpper: 0, sciLower: 0 });
    if (!out.includes(sci)) out.push(sci);
  }
  return out;
}

/** Text with letters but no digits is treated as chit-chat, not as a malformed calculation. */
function looksLikeProse(s: string): boolean {
  return !/\d/.test(s) && /\p{L}{2,}/u.test(s);
}

export async function computeConvertQuery(q: ConvertQuery, expr: string, o: ComputeOptions): Promise<Computed> {
  const rates = q.kind === "currency" ? await o.getRates() : null;
  const r = runConvert(q, rates);
  if (!r.ok) {
    switch (r.code) {
      case "units_mismatch":
        return err("err_units_mismatch");
      case "no_rate":
        return err("err_no_rate", { pair: r.pair ?? `${q.from}/${q.to}` });
      case "unknown_unit":
        return err("err_unknown", { name: r.pair ?? q.from });
      default:
        return err("err_overflow");
    }
  }
  const all = renderings(r.value, o.lang, o.digits);
  const out: ConvertOk = {
    kind: "convert",
    expr,
    fromText: `${fmt(q.value, o.lang, o.digits)} ${r.from}`,
    result: `${all[0]} ${r.to}`,
    value: r.value,
    variants: all.slice(1).map((v) => `${v} ${r.to}`),
  };
  if (r.kind === "currency" && rates) out.fx = { updatedAt: rates.updatedAt, stale: isStale(rates, o.now) };
  return out;
}

/** Conversion request for /convert: the text after the command. Null when it is not a conversion. */
export async function computeConvertCommand(args: string, o: ComputeOptions): Promise<Computed | null> {
  const q = parseConvertQuery(`/convert ${args}`);
  if (!q) return null;
  return computeConvertQuery(q, args.trim(), o);
}

/** Free-form input: a conversion if it parses as one, otherwise an arithmetic expression. Never throws. */
export async function computeInput(input: string, o: ComputeOptions): Promise<Computed> {
  const s = input.replace(/[   ]/g, " ").trim();
  if (s === "") return { kind: "not_math" };
  if (s.length > MAX_INPUT_LEN) return err("err_too_long");
  try {
    const q = parseConvertQuery(s);
    if (q) return await computeConvertQuery(q, s, o);

    const r = evaluate(s, { angle: o.angle, ...(o.ans ? { vars: { ans: o.ans } } : {}) });
    if (!r.ok) {
      const chaining = r.error.ident === "ans" || r.error.ident === "_";
      if (!chaining && (r.error.code === "unknown_ident" || r.error.code === "syntax") && looksLikeProse(s)) return { kind: "not_math" };
      return mapCalcError(r.error);
    }
    const all = renderings(r.value, o.lang, o.digits);
    return { kind: "calc", expr: s, result: all[0], value: r.value, variants: all.slice(1) };
  } catch {
    return err("err_generic");
  }
}
