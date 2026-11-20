// i18n core types. English (en.ts) is the source of truth for keys and placeholders.

// Must stay identical to LANGS in src/env.ts (checked by test/i18n/i18n.test.ts).
export const LANGS = ["uz-latn", "uz-cyrl", "ru", "en", "tr", "ar", "es"] as const;
export type Lang = (typeof LANGS)[number];

/** Bot commands registered through setMyCommands (message keys are `cmd_<name>`). */
export const COMMAND_NAMES = [
  "start",
  "help",
  "lang",
  "settings",
  "history",
  "convert",
  "loan",
  "vat",
  "solve",
  "derive",
  "integrate",
  "widget",
  "app",
  "pro",
  "privacy",
  "terms",
  "paysupport",
  "deleteme",
] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];

export const MESSAGE_KEYS = [
  "start",
  "help",
  "lang_menu_title",
  "lang_changed",
  "settings_title",
  "settings_angle",
  "settings_digits",
  "btn_back",
  "btn_cancel",
  "btn_delete",
  "err_syntax",
  "err_div0",
  "err_domain",
  "err_overflow",
  "err_unknown",
  "err_too_long",
  "err_units_mismatch",
  "err_no_rate",
  "err_generic",
  "rate_limited",
  "history_title",
  "history_empty",
  "history_cleared",
  "fx_updated",
  "fx_stale",
  "pro_title",
  "pro_features",
  "pro_price",
  "pro_active",
  "pro_required",
  "pro_thanks",
  "pro_already",
  "pro_cancel_info",
  "privacy",
  "terms",
  "paysupport",
  "deleteme_confirm",
  "deleteme_done",
  "unknown_command",
  "inline_help_title",
  "inline_help_desc",
  "inline_result_desc",
  "guest_hint",
  "converter_help",
  "loan_help",
  "loan_label_monthly",
  "loan_label_total",
  "loan_label_interest",
  "widget_open",
  "mini_open",
  "cmd_start",
  "cmd_help",
  "cmd_lang",
  "cmd_settings",
  "cmd_history",
  "cmd_convert",
  "cmd_loan",
  "cmd_pro",
  "cmd_privacy",
  "cmd_terms",
  "cmd_paysupport",
  "cmd_deleteme",
  "bot_name",
  "bot_short_description",
  "bot_description",
  "bot_about",
  "not_math_hint",
  "settings_history",
  "btn_on",
  "btn_off",
  "loan_schedule_title",
  "loan_row_legend",
  "vat_help",
  "vat_label_net",
  "vat_label_vat",
  "vat_label_gross",
  "widget_unavailable",
  "symbolic_help",
  "err_parse",
  "err_unsupported",
  "err_too_complex",
  "deleteme_payments_note",
  "cmd_vat",
  "cmd_solve",
  "cmd_derive",
  "cmd_integrate",
  "cmd_widget",
  "cmd_app",
] as const;
export type MessageKey = (typeof MESSAGE_KEYS)[number];

/** A complete dictionary for one language. Values use Telegram HTML parse mode unless noted. */
export type Messages = Record<MessageKey, string>;

/** Placeholder values; callers must HTML-escape user-supplied values themselves. */
export type Params = Record<string, string | number>;

/** Placeholders each key must contain, in every language (checked by tests). */
export const PLACEHOLDERS: Partial<Record<MessageKey, readonly string[]>> = {
  start: ["name"],
  err_syntax: ["pos"],
  err_unknown: ["name"],
  err_no_rate: ["pair"],
  fx_updated: ["date"],
  fx_stale: ["date"],
  pro_price: ["stars"],
  pro_active: ["date"],
  loan_schedule_title: ["n"],
};

/** Keys whose value is sent as plain text (no HTML parse mode): profile texts, command list, inline strings, buttons. */
export const PLAIN_KEYS: readonly MessageKey[] = [
  "btn_back",
  "btn_cancel",
  "btn_delete",
  "inline_help_title",
  "inline_help_desc",
  "inline_result_desc",
  "guest_hint",
  "widget_open",
  "mini_open",
  "cmd_start",
  "cmd_help",
  "cmd_lang",
  "cmd_settings",
  "cmd_history",
  "cmd_convert",
  "cmd_loan",
  "cmd_pro",
  "cmd_privacy",
  "cmd_terms",
  "cmd_paysupport",
  "cmd_deleteme",
  "bot_name",
  "bot_short_description",
  "bot_description",
  "lang_menu_title",
  "btn_on",
  "btn_off",
  "settings_history",
  "cmd_vat",
  "cmd_solve",
  "cmd_derive",
  "cmd_integrate",
  "cmd_widget",
  "cmd_app",
];

/** Telegram length limits. */
export const LIMITS = {
  message: 4096,
  botName: 64,
  shortDescription: 120,
  description: 512,
  commandDescription: 256,
  button: 64,
} as const;

/**
 * Telegram `language_code` used with setMyCommands / setMyName / setMyDescription.
 * `null` = no such Telegram language (Uzbek Cyrillic users report plain "uz"), so nothing is registered.
 * English is the default (registered without language_code); see `telegramLanguageCode`.
 */
export const TELEGRAM_LANGUAGE_CODE: Record<Lang, string | null> = {
  "uz-latn": "uz",
  "uz-cyrl": null,
  ru: "ru",
  en: "en",
  tr: "tr",
  ar: "ar",
  es: "es",
};

/** Native language names for the language menu. */
export const LANG_LABELS: Record<Lang, string> = {
  "uz-latn": "🇺🇿 Oʻzbekcha",
  "uz-cyrl": "🇺🇿 Ўзбекча",
  ru: "🇷🇺 Русский",
  en: "🇬🇧 English",
  tr: "🇹🇷 Türkçe",
  ar: "🇸🇦 العربية",
  es: "🇪🇸 Español",
};
