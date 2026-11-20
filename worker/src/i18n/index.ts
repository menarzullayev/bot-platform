import { ar } from "./ar";
import { en } from "./en";
import { es } from "./es";
import { ru } from "./ru";
import { tr } from "./tr";
import {
  COMMAND_NAMES,
  LANGS,
  TELEGRAM_LANGUAGE_CODE,
  type CommandName,
  type Lang,
  type MessageKey,
  type Messages,
  type Params,
} from "./types";
import { uzCyrl } from "./uz-cyrl";
import { uzLatn } from "./uz-latn";

export * from "./types";
export { latinToCyrillic } from "./translit";

export const DICTIONARIES: Record<Lang, Messages> = {
  "uz-latn": uzLatn,
  "uz-cyrl": uzCyrl,
  ru,
  en,
  tr,
  ar,
  es,
};

/**
 * Look up a message and substitute `{name}` placeholders from `params`.
 * Falls back to English for a missing key/language; unknown keys return the key itself.
 * Placeholders without a matching param are left as-is. Values are inserted verbatim (escape HTML yourself).
 */
export function t(lang: Lang, key: MessageKey, params?: Params): string {
  const raw = DICTIONARIES[lang]?.[key] ?? en[key] ?? String(key);
  if (!params) return raw;
  return raw.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
  );
}

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/**
 * Map a Telegram `language_code` (IETF tag such as "ru", "en-US", "uz", "uz-Cyrl", "uz_UZ", "ar-SA") to a Lang.
 * Bare "uz" and any "uz-*" without a Cyrillic script tag mean Latin. Unsupported or missing codes give `fallback`.
 */
export function detectLang(languageCode?: string | null, fallback: Lang = "en"): Lang {
  if (!languageCode) return fallback;
  const parts = languageCode.trim().toLowerCase().replace(/_/g, "-").split("-").filter(Boolean);
  const primary = parts[0];
  if (!primary) return fallback;
  if (primary === "uz") return parts.includes("cyrl") ? "uz-cyrl" : "uz-latn";
  if (primary === "ru" || primary === "en" || primary === "tr" || primary === "ar" || primary === "es") return primary;
  return fallback;
}

export function isRtl(lang: Lang): boolean {
  return lang === "ar";
}

const LRI = "⁦";
const PDI = "⁩";

/** Wrap a left-to-right math expression in a Unicode isolate (LRI..PDI) for RTL languages; other languages unchanged. */
export function wrapForRtl(lang: Lang, mathText: string): string {
  if (!isRtl(lang) || mathText === "") return mathText;
  if (mathText.startsWith(LRI) && mathText.endsWith(PDI)) return mathText;
  return `${LRI}${mathText}${PDI}`;
}

export interface BotCommand {
  command: CommandName;
  description: string;
}

/** Command list for setMyCommands in the given language. */
export function commandsFor(lang: Lang): BotCommand[] {
  return COMMAND_NAMES.map((command) => ({ command, description: t(lang, `cmd_${command}`) }));
}

export interface BotProfile {
  name: string;
  shortDescription: string;
  description: string;
}

/** Texts for setMyName / setMyShortDescription / setMyDescription. */
export function profileFor(lang: Lang): BotProfile {
  return {
    name: t(lang, "bot_name"),
    shortDescription: t(lang, "bot_short_description"),
    description: t(lang, "bot_description"),
  };
}

/**
 * Telegram `language_code` to register texts under, or null when Telegram has no such language
 * (uz-cyrl: Telegram only knows "uz", which is served by uz-latn). English is registered both as the
 * default (no language_code) and as "en"; use `telegramLanguageCode` for the localized set.
 */
export function telegramLanguageCode(lang: Lang): string | null {
  return TELEGRAM_LANGUAGE_CODE[lang];
}
