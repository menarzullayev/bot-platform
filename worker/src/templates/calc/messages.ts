// Plain messages: private chats are always answered; groups only on an @bot mention (privacy mode assumed on).

import type { Bot } from "grammy";
import { detectLang, t } from "../../i18n";
import { errInfo, log } from "../../log";
import { computeInput } from "./engine";
import { setAns, takeHint } from "./memory";
import { esc, renderComputed } from "./render";
import { addHistory } from "./store";
import { computeOptions, loadUser, reply, type Svc } from "./shared";

/** Removes every `@username` mention (case-insensitive); returns null when there was none. */
export function stripMention(text: string, username: string | undefined): string | null {
  if (!username || !/^[A-Za-z0-9_]+$/.test(username)) return null;
  const re = new RegExp(`@${username}(?![A-Za-z0-9_])`, "gi");
  if (!re.test(text)) return null;
  return text.replace(re, " ").replace(/\s+/g, " ").trim();
}

export function installMessages(bot: Bot, svc: Svc): void {
  bot.on("message:text", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const priv = ctx.chat.type === "private";
    const username = ctx.me.username;
    let text = ctx.message.text;

    if (text.startsWith("/")) {
      if (!priv) return; // groups: commands of other bots and unknown commands stay silent
      const m = /^\/[A-Za-z0-9_]+@([A-Za-z0-9_]+)/.exec(text);
      if (m && m[1].toLowerCase() !== username?.toLowerCase()) return;
      const u = await loadUser(svc, from);
      await reply(ctx, t(u.lang, "unknown_command"));
      return;
    }

    if (priv) {
      text = stripMention(text, username) ?? text;
    } else {
      const stripped = stripMention(text, username);
      if (stripped === null || stripped === "") return;
      text = stripped;
    }

    if (svc.rateLimited(from.id)) {
      if (priv) await reply(ctx, t(detectLang(from.language_code, svc.appConfig.defaultLang), "rate_limited"));
      return;
    }

    const u = await loadUser(svc, from);
    const c = await computeInput(text, computeOptions(svc, u, from.id, true));

    if (c.kind === "not_math") {
      if (takeHint(svc.botId, from.id, svc.now())) await reply(ctx, t(u.lang, "not_math_hint"));
      return;
    }
    await reply(ctx, renderComputed(u.lang, c) ?? esc(""));

    if (c.kind === "calc") setAns(svc.botId, from.id, c.value);
    if (priv && u.state.keepHistory && (c.kind === "calc" || c.kind === "convert")) {
      try {
        await addHistory(svc.db, svc.botId, from.id, c.expr, c.result, svc.now());
      } catch (e) {
        log("warn", "calc: history write failed", { botId: svc.botId, error: errInfo(e) });
      }
    }
  });
}
