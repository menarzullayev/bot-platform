// Text lookup for the Mini App: its own short strings (strings.ts) first, then the bot's shared i18n catalog.
// The build keeps only the catalog keys listed in catalog-keys.json (see build.mjs), so unlisted keys are absent
// from the bundle; tests make sure every key used here is listed.

import { DICTIONARIES, detectLang, isLang, isRtl } from "../../worker/src/i18n";
import type { Lang, MessageKey } from "../../worker/src/i18n/types";
import { ms, MS, type MsKey } from "./strings";

export { detectLang, isLang, isRtl };
export type { Lang, MessageKey, MsKey };

const entities: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'" };

/** The catalog stores Telegram HTML; the Mini App shows plain text. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:lt|gt|amp|quot|#39);/g, (e) => entities[e] ?? e);
}

function interpolate(raw: string, params?: Record<string, string | number>): string {
  if (!params) return raw;
  return raw.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (w, n: string) => (Object.hasOwn(params, n) ? String(params[n]) : w));
}

export function isMsKey(key: string): key is MsKey {
  return Object.hasOwn(MS.en, key);
}

/** Mini App string or catalog message (as plain text). */
export function tr(lang: Lang, key: MsKey | MessageKey, params?: Record<string, string | number>): string {
  if (isMsKey(key)) return ms(lang, key, params);
  const raw = DICTIONARIES[lang]?.[key] ?? DICTIONARIES.en[key] ?? String(key);
  return plainText(interpolate(raw, params));
}
