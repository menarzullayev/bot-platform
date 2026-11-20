// Inline mode: @tezcalc_bot <expression>. Always answers (an error becomes a single "error" result).

import type { Bot } from "grammy";
import type { InlineQueryResult } from "grammy/types";
import { detectLang, t, wrapForRtl, type Lang } from "../../i18n";
import { errInfo, log } from "../../log";
import { computeInput, type ErrOut } from "./engine";
import { plainError, renderError, resultMessage, shortExpr } from "./render";
import { computeOptions, loadUser, type Svc } from "./shared";
import { miniAppUrl } from "./commands";

/** Two independent 32-bit FNV-1a hashes as 16 hex chars: a stable result id (<= 64 bytes) without async crypto. */
export function stableId(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c ^ (i & 0xff), 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

const content = (html: string) => ({
  message_text: html,
  parse_mode: "HTML" as const,
  link_preview_options: { is_disabled: true },
});

function helpResult(lang: Lang): InlineQueryResult {
  return {
    type: "article",
    id: "help",
    title: t(lang, "inline_help_title"),
    description: t(lang, "inline_help_desc"),
    input_message_content: { message_text: t(lang, "guest_hint") },
  };
}

function errorResult(lang: Lang, query: string, e: ErrOut): InlineQueryResult {
  return {
    type: "article",
    id: `err-${stableId(query + lang + e.key)}`,
    title: plainError(lang, e).slice(0, 100),
    description: t(lang, "inline_help_desc"),
    input_message_content: content(renderError(lang, e)),
  };
}

async function answer(
  ctx: { answerInlineQuery: (r: InlineQueryResult[], o?: Record<string, unknown>) => Promise<unknown> },
  results: InlineQueryResult[],
  extra: Record<string, unknown> = {},
): Promise<void> {
  await ctx.answerInlineQuery(results.slice(0, 50), { cache_time: 60, is_personal: true, ...extra });
}

export function installInline(bot: Bot, svc: Svc): void {
  bot.on("inline_query", async (ctx) => {
    const q = ctx.inlineQuery;
    const reply = (results: InlineQueryResult[], extra?: Record<string, unknown>) =>
      answer(ctx as unknown as Parameters<typeof answer>[0], results, extra);
    try {
      if (svc.rateLimited(q.from.id)) {
        const lang = detectLang(q.from.language_code, svc.appConfig.defaultLang);
        await reply([
          {
            type: "article",
            id: "rate",
            title: t(lang, "rate_limited").slice(0, 100),
            input_message_content: { message_text: t(lang, "rate_limited") },
          },
        ], { cache_time: 5 });
        return;
      }
      const u = await loadUser(svc, q.from);
      const lang = u.lang;
      const text = q.query.trim();
      if (text === "") {
        const url = miniAppUrl(svc);
        await reply([helpResult(lang)], url ? { button: { text: t(lang, "mini_open").slice(0, 64), web_app: { url } } } : {});
        return;
      }
      const c = await computeInput(text, computeOptions(svc, u, q.from.id, false));
      if (c.kind === "not_math") {
        await reply([helpResult(lang)]);
        return;
      }
      if (c.kind === "error") {
        await reply([errorResult(lang, text, c)]);
        return;
      }
      const left = c.kind === "calc" ? c.expr : c.fromText;
      const desc = `${shortExpr(left, 120)} · ${t(lang, "inline_result_desc")}`;
      const renderings = [c.result, ...c.variants].slice(0, 3);
      const results: InlineQueryResult[] = renderings.map((r, i) => ({
        type: "article",
        id: `${i}-${stableId(`${text}|${lang}|${u.state.angle}|${u.state.digits}|${i}`)}`,
        title: wrapForRtl(lang, r).slice(0, 200),
        description: desc,
        input_message_content: content(resultMessage(lang, c, r)),
      }));
      await reply(results);
    } catch (e) {
      log("error", "calc: inline query failed", { botId: svc.botId, error: errInfo(e) });
      try {
        const lang = detectLang(q.from.language_code, svc.appConfig.defaultLang);
        await reply([errorResult(lang, q.query, { kind: "error", key: "err_generic", params: {} })], { cache_time: 0 });
      } catch (e2) {
        log("error", "calc: inline fallback failed", { botId: svc.botId, error: errInfo(e2) });
      }
    }
  });
}
