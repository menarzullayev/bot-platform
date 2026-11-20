// Number parsing/formatting shared by the calculator, converter and finance pages. Pure, DOM-free.

import { Decimal } from "../../../worker/src/calc/decimal";
import { LOCALE_SYMBOLS, formatDecimal, formatLocale, type LocaleCode } from "../../../worker/src/calc/format";

export interface Prefs {
  lang: LocaleCode;
  angle: "deg" | "rad";
  /** Maximum fractional digits of a displayed result (0..20). */
  digits: number;
}

export const DEFAULT_PREFS: Prefs = { lang: "uz-latn", angle: "deg", digits: 12 };

/** Significant digits kept before the fraction limit is applied. */
const SIGNIFICANT = 20;

/** Mapping of Arabic-Indic and Persian digits to ASCII. */
export function asciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (c) => {
    const code = c.charCodeAt(0);
    return String.fromCharCode(48 + (code >= 0x06f0 ? code - 0x06f0 : code - 0x0660));
  });
}

/**
 * Parses what a person types into a number field: "1 000 000", "1,5", "1,234.5", "1.234,5", "٣٫٥".
 * Returns null for anything that is not one finite decimal number.
 */
export function parseNumber(input: string): Decimal | null {
  if (typeof input !== "string") return null;
  let s = asciiDigits(input)
    .replace(/[\s  ​]/g, "")
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
  if (s === "" || s.length > 60) return null;
  if (s[0] === "+") s = s.slice(1);
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  // The decimal separator is the later of '.' and ',' when both occur; a lone comma/dot is decimal when it occurs once.
  let dec: "." | "," | null = null;
  if (dots > 0 && commas > 0) dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
  else if (commas === 1) dec = ",";
  else if (dots === 1) dec = ".";
  const group = dec === "." ? "," : dec === "," ? "." : dots > 1 ? "." : commas > 1 ? "," : null;
  const intPart = dec ? s.slice(0, s.lastIndexOf(dec)) : s;
  const fracPart = dec ? s.slice(s.lastIndexOf(dec) + 1) : "";
  if (fracPart.includes(".") || fracPart.includes(",")) return null;
  let digits = intPart;
  if (group && intPart.includes(group)) {
    const grouped = group === "." ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(,\d{3})+$/;
    if (!grouped.test(intPart)) return null;
    digits = intPart.split(group).join("");
  }
  s = (neg ? "-" : "") + digits + (dec ? "." + fracPart : "");
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d{1,4})?$/i.test(s)) return null;
  try {
    return Decimal.parse(s.startsWith(".") ? "0" + s : s.startsWith("-.") ? "-0" + s.slice(1) : s);
  } catch {
    return null;
  }
}

/** Display form of a result for the person's language and fraction-digit setting. */
export function formatResult(d: Decimal, prefs: Pick<Prefs, "lang" | "digits">): string {
  return formatLocale(d, prefs.lang, { significant: SIGNIFICANT, maxFraction: prefs.digits });
}

/** Machine form (ASCII, no grouping, '.' decimal) that the expression parser reads back. */
export function formatRaw(d: Decimal, digits: number): string {
  return formatDecimal(d, { groupSep: "", decimalSep: ".", significant: SIGNIFICANT, maxFraction: digits, sciStyle: "e" });
}

/** Money-like value: fixed number of fraction digits, grouped for the language. */
export function formatMoney(d: Decimal, lang: LocaleCode, fraction = 2): string {
  const out = formatLocale(d.round(fraction), lang, { significant: 30, maxFraction: fraction });
  // keep two decimals on money amounts that have a fraction: 63 445 316,7 -> 63 445 316,70
  const sep = LOCALE_SYMBOLS[lang].decimalSep;
  return fraction >= 2 && out.length >= 2 && out[out.length - 2] === sep && /\d/.test(out[out.length - 1]) ? out + "0" : out;
}

/** Percent value with up to `fraction` digits. */
export function formatPercent(d: Decimal, lang: LocaleCode, fraction = 4): string {
  return formatLocale(d.round(fraction), lang, { significant: 30, maxFraction: fraction }) + "%";
}

export const LRI = "⁦";
export const PDI = "⁩";

/** Isolates a left-to-right fragment (numbers, expressions) inside right-to-left text. */
export function isolateLtr(text: string): string {
  return text === "" ? text : `${LRI}${text}${PDI}`;
}
