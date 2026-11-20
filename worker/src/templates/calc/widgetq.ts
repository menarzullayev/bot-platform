// widget_query (Bot API 10.4): the calculator widget's "send to bot" button sends `s:<result>`.
// Not in grammY's typings yet, so the update and answerWidgetQuery are handled through raw access.
// answerWidgetQuery must arrive within 15 s (docs/FACTS.md section 3); we always answer exactly once.

import type { Bot } from "grammy";
import { Decimal } from "../../calc";
import { errInfo, log } from "../../log";
import { parseWidgetSendData } from "../../widget/send";
import { fmt } from "./engine";
import { code } from "./render";
import { loadUser, type Svc } from "./shared";

interface WidgetQueryUpdate {
  /** Assumed field names: not confirmed by the typings, see report. */
  id?: unknown;
  widget_query_id?: unknown;
  data?: unknown;
  from?: { id?: unknown; language_code?: unknown };
}

export function installWidgetQuery(bot: Bot, svc: Svc): void {
  bot.use(async (ctx, next) => {
    const wq = (ctx.update as unknown as { widget_query?: WidgetQueryUpdate }).widget_query;
    if (!wq) return next();

    const queryId = typeof wq.id === "string" ? wq.id : typeof wq.widget_query_id === "string" ? wq.widget_query_id : null;
    const raw = ctx.api.raw as unknown as Record<string, (payload: Record<string, unknown>) => Promise<unknown>>;
    if (!queryId) {
      log("warn", "calc: widget_query without id", { botId: svc.botId });
      return;
    }
    const userId = typeof wq.from?.id === "number" ? wq.from.id : null;
    const n = typeof wq.data === "string" ? parseWidgetSendData(wq.data) : null;
    let status = "err";
    try {
      if (userId !== null && n !== null) {
        if (svc.rateLimited(userId)) {
          status = "busy";
        } else {
          const u = await loadUser(svc, {
            id: userId,
            ...(typeof wq.from?.language_code === "string" ? { language_code: wq.from.language_code } : {}),
          });
          let value: Decimal | null = null;
          try {
            value = Decimal.parse(String(n));
          } catch {
            value = null;
          }
          const shown = value ? fmt(value, u.lang, u.state.digits) : String(n);
          await ctx.api.sendMessage(userId, code(u.lang, shown), { parse_mode: "HTML" });
          status = "ok";
        }
      }
    } catch (e) {
      log("warn", "calc: widget_query handling failed", { botId: svc.botId, error: errInfo(e) });
    }
    try {
      await raw.answerWidgetQuery({ widget_query_id: queryId, data: status });
    } catch (e) {
      log("warn", "calc: answerWidgetQuery failed", { botId: svc.botId, error: errInfo(e) });
    }
  });
}
