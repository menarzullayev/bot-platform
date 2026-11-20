import { InlineKeyboard, type Context } from "grammy";
import type { Db } from "../../db";
import type { AppConfig } from "../../env";
import { detectLang, isLang, LANG_LABELS, LANGS, type Lang } from "../../i18n";
import { errInfo, log } from "../../log";
import type { CalcConfig } from "./config";
import type { ComputeOptions } from "./engine";
import { getRatesCached, getAns } from "./memory";
import { DEFAULT_STATE, getUserState, type UserState } from "./store";

/** Everything the handlers share; built once per update in install(). */
export interface Svc {
  botId: string;
  db: Db;
  config: CalcConfig;
  appConfig: AppConfig;
  /** Unix seconds. */
  now: () => number;
  fetchFn: typeof fetch;
  /** Consumes a token of the per-user bucket; true = over the limit. */
  rateLimited: (userId: number) => boolean;
}

export interface Loaded {
  state: UserState;
  lang: Lang;
  isPro: boolean;
}

export interface FromLike {
  id: number;
  language_code?: string;
}

/** The one D1 read of an update. A DB failure degrades to defaults instead of silencing the bot. */
export async function loadUser(svc: Svc, from: FromLike | undefined): Promise<Loaded> {
  let state: UserState = { ...DEFAULT_STATE };
  if (from) {
    try {
      state = await getUserState(svc.db, svc.botId, from.id);
    } catch (e) {
      log("warn", "calc: user lookup failed", { botId: svc.botId, error: errInfo(e) });
    }
  }
  const lang = state.lang ?? detectLang(from?.language_code, svc.appConfig.defaultLang);
  return { state, lang, isPro: state.proUntil > svc.now() };
}

/** ComputeOptions for a loaded user; `ans` only when the caller wants chaining (private chat messages). */
export function computeOptions(svc: Svc, u: Loaded, userId: number | undefined, useAns: boolean): ComputeOptions {
  const now = svc.now();
  const ans = useAns && userId !== undefined ? getAns(svc.botId, userId) : undefined;
  return {
    lang: u.lang,
    angle: u.state.angle,
    digits: u.state.digits,
    now,
    getRates: () => getRatesCached(svc.db, now),
    ...(ans ? { ans } : {}),
  };
}

export const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

/** Sends an HTML reply; in groups it quotes the triggering message. */
export function reply(ctx: Context, text: string, extra: Record<string, unknown> = {}): Promise<unknown> {
  const m = ctx.msg;
  const inGroup = ctx.chat !== undefined && ctx.chat.type !== "private";
  return ctx.reply(text, {
    ...HTML,
    ...(inGroup && m ? { reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } } : {}),
    ...extra,
  } as never);
}

export function langKeyboard(prefix: "lg" | "ls"): InlineKeyboard {
  const kb = new InlineKeyboard();
  LANGS.forEach((l, i) => {
    kb.text(LANG_LABELS[l], `${prefix}:${l}`);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

export { isLang };

/** Telegram answers 400 "message is not modified" when an edit changes nothing; that is not an error for us. */
export function isNotModified(e: unknown): boolean {
  return e instanceof Error && /message is not modified/i.test(e.message);
}

/** First name for greetings, never empty and HTML-escaped by the caller. */
export function displayName(from: { first_name?: string } | undefined): string {
  return (from?.first_name ?? "").trim().slice(0, 64) || "🙂";
}
