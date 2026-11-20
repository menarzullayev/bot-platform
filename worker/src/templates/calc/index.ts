// The `calc` template: @tezcalc_bot. Wires the calculator, FX, Pro/Stars and the widget into one bot.

import type { Bot } from "grammy";
import { fetchRates, type FetchFn } from "../../fx/fetch";
import { isStale, saveRates } from "../../fx/store";
import { commandsFor, LANGS, profileFor, t, telegramLanguageCode } from "../../i18n";
import { errInfo, log } from "../../log";
import { purgeExpiredCards } from "../../miniapp/cards";
import { activeUsersSince, dayOf, dayStartSec, setMetric } from "../../metrics";
import type { BotProfile, ScheduledDeps, Template, TemplateCtx } from "../index";
import { installCommands } from "./commands";
import { parseCalcConfig, type CalcConfig } from "./config";
import { installGuest } from "./guest";
import { installInline } from "./inline";
import { invalidateRates, getRatesCached } from "./memory";
import { installMessages } from "./messages";
import { installPro } from "./pro";
import type { Svc } from "./shared";
import { installWidgetQuery } from "./widgetq";

export { parseCalcConfig, type CalcConfig } from "./config";

/** A profile with the optional chat menu button; admin.ts turns `path` into `<base><path>?b=<botId>`. */
export interface CalcProfile extends BotProfile {
  menuButton: { text: string; path: string };
}

/** Rates younger than this are not refreshed by the hourly cron (seconds). */
export const FX_REFRESH_AFTER_S = 12 * 3600;

export function buildProfile(config: CalcConfig): CalcProfile {
  const commands: BotProfile["commands"] = { default: commandsFor("en") };
  const names: BotProfile["names"] = { default: profileFor("en").name };
  const shortDescriptions: BotProfile["shortDescriptions"] = { default: profileFor("en").shortDescription };
  const descriptions: BotProfile["descriptions"] = { default: profileFor("en").description };
  for (const lang of LANGS) {
    const code = telegramLanguageCode(lang);
    if (code === null) continue; // uz-cyrl: Telegram only knows "uz" (served by uz-latn)
    const p = profileFor(lang);
    commands[code] = commandsFor(lang);
    names[code] = p.name;
    shortDescriptions[code] = p.shortDescription;
    descriptions[code] = p.description;
  }
  return { commands, names, shortDescriptions, descriptions, menuButton: { text: t("en", "mini_open"), path: config.miniAppPath } };
}

export function installCalc(bot: Bot, ctx: TemplateCtx<CalcConfig>): void {
  const svc: Svc = {
    botId: ctx.botId,
    db: ctx.db,
    config: ctx.config,
    appConfig: ctx.appConfig,
    now: ctx.now,
    fetchFn: ctx.fetchFn,
    rateLimited: ctx.rateLimited,
  };
  // Payments first: pre_checkout_query and successful_payment must never meet a rate limit or a text handler.
  installPro(bot, {
    botId: ctx.botId,
    db: ctx.db,
    now: ctx.now,
    proStars: ctx.config.proStars,
    defaultLang: ctx.appConfig.defaultLang,
    supportContact: ctx.config.supportContact,
    publicBaseUrl: ctx.appConfig.publicBaseUrl,
  });
  installWidgetQuery(bot, svc);
  installCommands(bot, svc);
  installInline(bot, svc);
  installGuest(bot, svc);
  installMessages(bot, svc); // last: catches what no command handled
}

/** Hourly: refresh FX rates unless the stored table is younger than FX_REFRESH_AFTER_S. Never throws. */
export async function refreshRates(deps: ScheduledDeps<CalcConfig>): Promise<"fresh" | "updated" | "failed"> {
  const now = deps.now();
  try {
    invalidateRates(deps.db);
    const current = await getRatesCached(deps.db, now);
    if (current && !isStale(current, now, FX_REFRESH_AFTER_S)) return "fresh";
  } catch (e) {
    log("warn", "calc: reading stored rates failed, fetching anyway", { botId: deps.botId, error: errInfo(e) });
  }
  const fresh = await fetchRates(deps.fetchFn as unknown as FetchFn, { now: deps.now });
  if (!fresh) {
    log("warn", "calc: FX refresh failed, keeping the previous rates", { botId: deps.botId });
    return "failed";
  }
  try {
    await saveRates(deps.db, fresh, fresh.source ?? "unknown", now);
    invalidateRates(deps.db);
  } catch (e) {
    log("warn", "calc: saving rates failed, keeping the previous rates", { botId: deps.botId, error: errInfo(e) });
    return "failed";
  }
  return "updated";
}

/**
 * Hourly housekeeping (P5): purge share cards older than 72 h and (re)write today's `au` (active users) counter
 * as an absolute value, so the hourly repeat is idempotent. Each step is isolated; never throws.
 */
export async function housekeeping(deps: ScheduledDeps<CalcConfig>): Promise<void> {
  const now = deps.now();
  try {
    await purgeExpiredCards(deps.db, now);
  } catch (e) {
    log("warn", "calc: card purge failed", { botId: deps.botId, error: errInfo(e) });
  }
  try {
    const n = await activeUsersSince(deps.db, deps.botId, dayStartSec(now * 1000));
    await setMetric(deps.db, dayOf(now * 1000), deps.botId, "au", n);
  } catch (e) {
    log("warn", "calc: active-user counter failed", { botId: deps.botId, error: errInfo(e) });
  }
}

export const calcTemplate: Template<CalcConfig> = {
  name: "calc",
  parseConfig: parseCalcConfig,
  install: installCalc,
  profile: buildProfile,
  async scheduled(_env, deps) {
    await refreshRates(deps);
    await housekeeping(deps);
  },
  // Rate limiting is applied by the handlers (messages, inline, guest, widget) so payments are never throttled.
  rateLimit: false,
};
