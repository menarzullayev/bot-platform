import type { Lang } from "../env";
import { buildCalculatorWidget } from "./calculator";
import { WIDGET_LABELS } from "./labels";

/**
 * Parameters of Bot API `sendWidget` (names exactly as in https://core.telegram.org/bots/api,
 * Bot API 10.4). Only the ones this module fills are declared.
 */
export interface SendWidgetParams {
  chat_id?: number | string; // required by the API; the caller may add it later
  html: string; // 1-32768 bytes, <= 4096 bytes after zlib level 9
  caption: string; // 0-1024 characters after entity parsing
  allow_queries: boolean; // lets the widget call TelegramWidget.request() ("send to bot")
  protect_content: boolean; // production forces it for widgets anyway
}

/** Prefix of the request data the widget sends: `s:<result>` (<= 64 bytes, ASCII digits, `.`, `-`, `e`). */
export const WIDGET_SEND_PREFIX = "s:";

/**
 * Pure builder of the sendWidget payload for the calculator (no network).
 * - No `width` / `height`: the widget fills the bubble and takes its content height (<= ~550 px).
 * - No `is_shared`: a static widget, everything it needs is in the HTML (state lives in localStorage).
 * - No `public_data` / `chat_data`: the calculator needs no bot-written state.
 * - `allow_queries: true` only for the "send to bot" button: the bot gets a `widget_query`
 *   with data `s:<result>` and SHOULD answer it with `answerWidgetQuery` within 15 s.
 */
export function widgetSendParams(lang: Lang, chatId?: number | string): SendWidgetParams {
  const params: SendWidgetParams = {
    html: buildCalculatorWidget(lang),
    caption: WIDGET_LABELS[lang].caption,
    allow_queries: true,
    protect_content: true,
  };
  if (chatId !== undefined) params.chat_id = chatId;
  return params;
}

/** Parse the `data` of a widget_query produced by the calculator's send button; null if not ours. */
export function parseWidgetSendData(data: string): number | null {
  if (!data.startsWith(WIDGET_SEND_PREFIX)) return null;
  const body = data.slice(WIDGET_SEND_PREFIX.length);
  if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/.test(body)) return null;
  const n = Number(body);
  return Number.isFinite(n) ? n : null;
}
