// HTML rendering of calculation outcomes. Every user-supplied string is escaped; math fragments are isolated
// for right-to-left languages (wrapForRtl).

import { escapeHtml } from "../../calc";
import { LANG_LABELS, LANGS, t, wrapForRtl, type Lang } from "../../i18n";
import type { CalcOk, Computed, ConvertOk, ErrOut } from "./engine";

export const esc = escapeHtml;
const MAX_SHOWN_EXPR = 400;

export function shortExpr(expr: string, max = MAX_SHOWN_EXPR): string {
  const one = expr.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max - 1) + "…" : one;
}

/** `<code>…</code>` of a math fragment, RTL-isolated and escaped. */
export const code = (lang: Lang, text: string): string => `<code>${esc(wrapForRtl(lang, text))}</code>`;

/** "expr = result" as one HTML line. */
export function line(lang: Lang, expr: string, result: string): string {
  return `${code(lang, shortExpr(expr))} = ${code(lang, result)}`;
}

export function dateOf(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

export function renderError(lang: Lang, e: ErrOut): string {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(e.params)) params[k] = typeof v === "string" ? esc(v) : v;
  return t(lang, e.key, params);
}

/** Error text for contexts without HTML (inline titles): raw parameters, no escaping. */
export function plainError(lang: Lang, e: ErrOut): string {
  return t(lang, e.key, e.params).replace(/^⚠️\s*/, "");
}

export function fxNote(lang: Lang, c: ConvertOk): string {
  if (!c.fx) return "";
  const date = dateOf(c.fx.updatedAt);
  return "\n\n" + (c.fx.stale ? t(lang, "fx_stale", { date }) : t(lang, "fx_updated", { date }));
}

/** Full chat text for a successful outcome. */
export function renderOk(lang: Lang, c: CalcOk | ConvertOk): string {
  if (c.kind === "calc") return line(lang, c.expr, c.result);
  return line(lang, c.fromText, c.result) + fxNote(lang, c);
}

/** Text for any outcome except not_math (callers decide what to do with chit-chat). */
export function renderComputed(lang: Lang, c: Computed): string | null {
  if (c.kind === "not_math") return null;
  if (c.kind === "error") return renderError(lang, c);
  return renderOk(lang, c);
}

/** Message body of an inline/guest result for one rendering of the value. */
export function resultMessage(lang: Lang, c: CalcOk | ConvertOk, rendering: string): string {
  const left = c.kind === "calc" ? c.expr : c.fromText;
  const body = line(lang, left, rendering);
  return c.kind === "convert" ? body + fxNote(lang, c) : body;
}

export { LANG_LABELS, LANGS };
