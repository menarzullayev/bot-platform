// Display formatting: significant-digit rounding, digit grouping, locale symbols, scientific form.

import type { Decimal } from "./decimal";

export interface FormatOptions {
  /** Thousands separator ("" disables grouping). Default " " (NBSP is used by the locale presets). */
  groupSep?: string;
  /** Decimal separator. Default ".". */
  decimalSep?: string;
  /** Significant digits shown. Default 12. */
  significant?: number;
  /** Maximum fractional digits (applied after significant-digit rounding). Default: unlimited. */
  maxFraction?: number;
  /** Values with decimal exponent >= this use scientific form. Default 15. */
  sciUpper?: number;
  /** Values with decimal exponent < this use scientific form. Default -6 (so 0.000001 stays plain, 0.0000001 does not). */
  sciLower?: number;
  /** Scientific style: "times" -> 1.23×10^25, "e" -> 1.23e25. Default "times". */
  sciStyle?: "times" | "e";
  /** Digits per group. Default 3. */
  groupSize?: number;
}

export type LocaleCode = "uz-latn" | "uz-cyrl" | "ru" | "en" | "tr" | "ar" | "es";

const NBSP = " ";

/** Separator table. Western (ASCII) digits are always used for math output, also for "ar". */
export const LOCALE_SYMBOLS: Record<LocaleCode, { groupSep: string; decimalSep: string }> = {
  "uz-latn": { groupSep: NBSP, decimalSep: "," },
  "uz-cyrl": { groupSep: NBSP, decimalSep: "," },
  ru: { groupSep: NBSP, decimalSep: "," },
  en: { groupSep: ",", decimalSep: "." },
  tr: { groupSep: ".", decimalSep: "," },
  es: { groupSep: ".", decimalSep: "," },
  ar: { groupSep: ",", decimalSep: "." },
};

function groupInt(int: string, sep: string, size: number): string {
  if (sep === "" || int.length <= size) return int;
  const parts: string[] = [];
  let end = int.length;
  while (end > 0) {
    parts.unshift(int.slice(Math.max(0, end - size), end));
    end -= size;
  }
  return parts.join(sep);
}

export function formatDecimal(d: Decimal, opts: FormatOptions = {}): string {
  if (d.isZero()) return "0";
  const groupSep = opts.groupSep ?? " ";
  const decimalSep = opts.decimalSep ?? ".";
  const sig = Math.max(1, Math.floor(opts.significant ?? 12));
  const sciUpper = opts.sciUpper ?? 15;
  const sciLower = opts.sciLower ?? -6;
  const size = opts.groupSize ?? 3;
  const neg = d.isNegative();

  // Integers up to sciUpper digits are shown exactly; otherwise significant-digit rounding applies.
  let r = d.abs();
  const e0 = r.exponent;
  if (e0 < sciUpper && e0 + 1 > sig) r = r.round(0);
  else r = r.roundSig(sig);
  if (opts.maxFraction !== undefined) r = r.round(Math.max(0, Math.floor(opts.maxFraction)));
  if (r.isZero()) return "0";

  const e = r.exponent;
  const sign = neg ? "-" : "";
  if (e >= sciUpper || e < sciLower) {
    const digs = r.digits();
    const mant = digs.length > 1 ? digs[0] + decimalSep + digs.slice(1) : digs;
    return opts.sciStyle === "e" ? `${sign}${mant}e${e}` : `${sign}${mant}×10^${e}`;
  }
  const plain = r.toString();
  const dot = plain.indexOf(".");
  const int = dot < 0 ? plain : plain.slice(0, dot);
  const frac = dot < 0 ? "" : plain.slice(dot + 1);
  return sign + groupInt(int, groupSep, size) + (frac ? decimalSep + frac : "");
}

/** Options preset for a language: formatLocale("ru"). */
export function formatLocale(lang: LocaleCode): FormatOptions;
/** Format a value for a language: formatLocale(d, "ru"). */
export function formatLocale(d: Decimal, lang: LocaleCode, extra?: FormatOptions): string;
export function formatLocale(a: Decimal | LocaleCode, b?: LocaleCode, extra: FormatOptions = {}): FormatOptions | string {
  if (typeof a === "string") {
    const sym = LOCALE_SYMBOLS[a] ?? LOCALE_SYMBOLS.en;
    return { groupSep: sym.groupSep, decimalSep: sym.decimalSep };
  }
  const sym = LOCALE_SYMBOLS[b as LocaleCode] ?? LOCALE_SYMBOLS.en;
  return formatDecimal(a, { groupSep: sym.groupSep, decimalSep: sym.decimalSep, ...extra });
}
