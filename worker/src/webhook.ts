import { Bot, webhookCallback } from "grammy";
import { decryptToken, timingSafeEqual } from "./crypto";
import { getBot, type Db } from "./db";
import type { Deps, Env } from "./env";
import { installForceSub, parseForceSubConfig } from "./templates/forcesub";

const MAX_BODY = 1_000_000;

export async function handleWebhook(
  req: Request,
  env: Env,
  botId: string,
  deps: Deps = {},
): Promise<Response> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY) return new Response("too large", { status: 413 });

  const db: Db = deps.db ?? (env.DB as unknown as Db);
  const row = await getBot(db, botId);
  if (!row) return new Response("not found", { status: 404 });

  const given = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!timingSafeEqual(given, row.secret)) return new Response("unauthorized", { status: 401 });

  // O'chirilgan botga 200 qaytaramiz: Telegram qayta urinishlar to'fonini yaratmasin.
  if (row.enabled !== 1) return new Response("ok", { status: 200 });

  const token = await decryptToken(env.TOKEN_KEY, row.token_enc);
  const bot = new Bot(token, { botInfo: JSON.parse(row.bot_info) });
  deps.configureBot?.(bot);

  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  switch (row.template) {
    case "forcesub":
      installForceSub(bot, botId, parseForceSubConfig(JSON.parse(row.config)), db, now);
      break;
    default:
      return new Response("unknown template", { status: 500 });
  }

  return webhookCallback(bot, "cloudflare-mod", { secretToken: row.secret })(req);
}
