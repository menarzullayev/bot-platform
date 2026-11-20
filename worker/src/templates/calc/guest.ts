// Guest mode (Bot API 10.0): "@tezcalc_bot 12*3+4" in any chat. The bot may answer exactly once per guest_query_id,
// so everything is computed first and answerGuestQuery is called a single time (no retry, nothing is stored).

import type { Bot } from "grammy";
import type { InlineQueryResult } from "grammy/types";
import { detectLang, t } from "../../i18n";
import { errInfo, log } from "../../log";
import { count } from "../../metrics";
import { computeInput } from "./engine";
import { stableId } from "./inline";
import { renderError, resultMessage, code } from "./render";
import { stripMention } from "./messages";
import { computeOptions, loadUser, type Svc } from "./shared";

interface Built {
  text: string;
  html: boolean;
  title: string;
}

export function installGuest(bot: Bot, svc: Svc): void {
  bot.on("guest_message", async (ctx) => {
    const m = ctx.guestMessage;
    if (!m) return;
    const queryId = m.guest_query_id;
    if (!queryId) {
      log("warn", "calc: guest_message without guest_query_id", { botId: svc.botId });
      return;
    }
    const from = m.from;
    const raw = m.text ?? m.caption ?? "";
    const query = stripMention(raw, ctx.me.username) ?? raw.trim();

    let built: Built;
    try {
      if (svc.rateLimited(from.id)) {
        const lang = detectLang(from.language_code, svc.appConfig.defaultLang);
        built = { text: t(lang, "rate_limited"), html: true, title: "TezCalc" };
      } else {
        const u = await loadUser(svc, from);
        const lang = u.lang;
        const c = await computeInput(query, computeOptions(svc, u, from.id, false));
        if (c.kind === "not_math") built = { text: t(lang, "guest_hint"), html: false, title: "TezCalc" };
        else if (c.kind === "error") built = { text: renderError(lang, c), html: true, title: "TezCalc" };
        else {
          count(svc.db, svc.botId, "f:guest");
          const extra = c.variants.map((v) => `≈ ${code(lang, v)}`);
          built = { text: [resultMessage(lang, c, c.result), ...extra].join("\n"), html: true, title: c.result.slice(0, 100) };
        }
      }
    } catch (e) {
      log("error", "calc: guest compute failed", { botId: svc.botId, error: errInfo(e) });
      const lang = detectLang(from.language_code, svc.appConfig.defaultLang);
      built = { text: t(lang, "err_generic"), html: true, title: "TezCalc" };
    }

    const result: InlineQueryResult = {
      type: "article",
      id: stableId(`${queryId}|${query}`),
      title: built.title,
      input_message_content: built.html
        ? { message_text: built.text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }
        : { message_text: built.text },
    };
    try {
      await ctx.api.answerGuestQuery(queryId, result);
    } catch (e) {
      log("warn", "calc: answerGuestQuery failed", { botId: svc.botId, error: errInfo(e) });
    }
  });
}
