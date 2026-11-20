import { Bot, webhookCallback } from "grammy";
import { decryptToken, timingSafeEqual } from "./crypto";
import { getBot, type Db } from "./db";
import type { Env } from "./env";
import { errInfo, log } from "./log";
import { platformStateFor } from "./ratelimit";
import { getTemplate, resolveAppConfig, type PlatformDeps } from "./templates";

const MAX_BODY = 1_000_000;

const ok = () => new Response("ok", { status: 200 });

/** First `from.id` found in the update (message, callback_query, my_chat_member, ...). */
function extractUserId(update: Record<string, unknown>): number | undefined {
  for (const [k, v] of Object.entries(update)) {
    if (k === "update_id" || typeof v !== "object" || v === null) continue;
    const from = (v as { from?: { id?: unknown } }).from;
    if (from && typeof from.id === "number") return from.id;
  }
  return undefined;
}

/**
 * Always answers 200 once the request is authenticated: any non-2xx makes Telegram redeliver
 * the same update forever. Exceptions: 413 (oversized), 404 (unknown bot), 401 (bad secret).
 */
export async function handleWebhook(
  req: Request,
  env: Env,
  botId: string,
  deps: PlatformDeps = {},
): Promise<Response> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY) return new Response("too large", { status: 413 });

  let token: string | undefined;
  let tplName: string | undefined;
  try {
    const db: Db = deps.db ?? (env.DB as unknown as Db);
    const row = await getBot(db, botId);
    if (!row) return new Response("not found", { status: 404 });

    const given = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!timingSafeEqual(given, row.secret)) return new Response("unauthorized", { status: 401 });

    // Disabled bot (kill-switch): 200 so Telegram does not retry.
    if (row.enabled !== 1) return ok();

    tplName = row.template;
    const template = getTemplate(row.template);
    if (!template) {
      log("error", "webhook: unknown template", { botId, template: row.template });
      return ok();
    }

    let update: Record<string, unknown>;
    try {
      const parsed: unknown = await req.clone().json();
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      update = parsed as Record<string, unknown>;
    } catch {
      log("warn", "webhook: unparseable body", { botId });
      return ok();
    }

    const state = deps.platform ?? platformStateFor(db as unknown as object);
    const nowMs = (deps.nowMs ?? Date.now)();
    if (typeof update.update_id === "number" && state.dedup.isDuplicate(botId, update.update_id, nowMs)) {
      log("debug", "webhook: duplicate update skipped", { botId, update_id: update.update_id });
      return ok();
    }
    const userId = extractUserId(update);
    if (template.rateLimit !== false && userId !== undefined && state.limiter.limited(`${botId}:${userId}`, nowMs)) {
      log("debug", "webhook: rate limited", { botId, userId });
      return ok();
    }

    const config = template.parseConfig(JSON.parse(row.config));
    token = await decryptToken(env.TOKEN_KEY, row.token_enc);
    const bot = new Bot(token, { botInfo: JSON.parse(row.bot_info) });
    deps.configureBot?.(bot);

    template.install(bot, {
      botId,
      db,
      env,
      config,
      appConfig: resolveAppConfig(env, deps),
      now: deps.now ?? (() => Math.floor(Date.now() / 1000)),
      fetchFn: deps.fetchFn ?? fetch,
      rateLimited: (uid) => state.limiter.limited(`${botId}:${uid}`, (deps.nowMs ?? Date.now)()),
    });

    const res = await webhookCallback(bot, "cloudflare-mod", { secretToken: row.secret })(req);
    return res.status === 200 ? res : ok();
  } catch (e) {
    log("error", "webhook failed", { botId, template: tplName, error: errInfo(e, token) });
    return ok();
  }
}
