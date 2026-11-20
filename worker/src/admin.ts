import { globalFetch } from "./http";
import { decryptToken, encryptToken, randomSecret, timingSafeEqual } from "./crypto";
import { countUsersPerBot, getBot, insertBot, listBots, setBotEnabled, setBotTemplate, type BotRow, type Db } from "./db";
import type { Env } from "./env";
import { errInfo, log } from "./log";
import { handleRefund } from "./pro/refund";
import { getTemplate, type BotProfile, type PlatformDeps } from "./templates";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;
const BOT_PATH_RE = /^\/admin\/bots\/([A-Za-z0-9_-]{1,32})(\/webhook|\/setup|\/refund|\/sync-webhook)?$/;
/**
 * Explicit list (an empty list would skip chat_member and message_reaction*, and guest_message must be asked for
 * by name once any list is given: docs/FACTS.md section 2). Names are the official Update fields of Bot API 10.4;
 * guest_message is typed in grammY, widget_query is not (Bot API 10.4, docs/FACTS.md section 3).
 */
export const ALLOWED_UPDATES = [
  "message",
  "callback_query",
  "my_chat_member",
  "chat_member",
  "pre_checkout_query",
  "inline_query",
  "chosen_inline_result",
  "guest_message",
  "widget_query",
];

interface TgResult {
  ok: boolean;
  result?: unknown;
}

async function tgCall(fetchFn: typeof fetch, token: string, method: string, payload?: unknown): Promise<TgResult> {
  const res = await fetchFn(
    `https://api.telegram.org/bot${token}/${method}`,
    payload === undefined
      ? undefined
      : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
  );
  return (await res.json()) as TgResult;
}

/** Flattens a profile into the Telegram calls to make. language "default" means no language_code. */
function profileCalls(p: BotProfile): { method: string; language: string; payload: Record<string, unknown> }[] {
  const calls: { method: string; language: string; payload: Record<string, unknown> }[] = [];
  const lang = (l: string) => (l === "default" ? {} : { language_code: l });
  for (const [l, commands] of Object.entries(p.commands)) {
    calls.push({ method: "setMyCommands", language: l, payload: { commands, ...lang(l) } });
  }
  for (const [l, name] of Object.entries(p.names)) {
    calls.push({ method: "setMyName", language: l, payload: { name, ...lang(l) } });
  }
  for (const [l, short_description] of Object.entries(p.shortDescriptions)) {
    calls.push({ method: "setMyShortDescription", language: l, payload: { short_description, ...lang(l) } });
  }
  for (const [l, description] of Object.entries(p.descriptions)) {
    calls.push({ method: "setMyDescription", language: l, payload: { description, ...lang(l) } });
  }
  return calls;
}

export async function handleAdmin(req: Request, env: Env, deps: PlatformDeps = {}): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!env.ADMIN_TOKEN || !timingSafeEqual(auth, `Bearer ${env.ADMIN_TOKEN}`)) {
    return json({ error: "unauthorized" }, 401);
  }
  const db: Db = deps.db ?? (env.DB as unknown as Db);
  const fetchFn = deps.fetchFn ?? globalFetch;
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/admin/bots") {
    return json({ bots: await listBots(db) });
  }

  if (req.method === "GET" && url.pathname === "/admin/stats") {
    const [bots, users] = await Promise.all([listBots(db), countUsersPerBot(db)]);
    return json({
      bots: bots.length,
      enabled: bots.filter((b) => b.enabled === 1).length,
      users: Object.fromEntries(bots.map((b) => [b.id, users[b.id] ?? 0])),
    });
  }

  if (req.method === "POST" && url.pathname === "/admin/bots") {
    let body: { id?: string; token?: string; template?: string; config?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "JSON kerak" }, 400);
    }
    const { id, token, template } = body;
    if (!id || !ID_RE.test(id)) return json({ error: "id: 1-32 belgi, harf/raqam/_/-" }, 400);
    if (!token || !TOKEN_RE.test(token)) return json({ error: "token formati noto'g'ri" }, 400);
    const tpl = typeof template === "string" ? getTemplate(template) : undefined;
    if (!template || !tpl) return json({ error: "noma'lum shablon" }, 400);
    let config: unknown;
    try {
      config = tpl.parseConfig(body.config);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
    if (await getBot(db, id)) return json({ error: "bunday id mavjud" }, 409);

    const me = (await (await fetchFn(`https://api.telegram.org/bot${token}/getMe`)).json()) as {
      ok: boolean;
      result?: { id: number; username?: string; is_bot: boolean };
    };
    if (!me.ok || !me.result?.is_bot) return json({ error: "Telegram tokenni qabul qilmadi" }, 400);

    const secret = randomSecret(32);
    const webhookUrl = `${url.origin}/wh/${id}`;
    const hook = (await (
      await fetchFn(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: secret,
          allowed_updates: ALLOWED_UPDATES,
          drop_pending_updates: true,
        }),
      })
    ).json()) as { ok: boolean };
    if (!hook.ok) return json({ error: "setWebhook muvaffaqiyatsiz" }, 502);

    await insertBot(db, {
      id,
      token_enc: await encryptToken(env.TOKEN_KEY, token),
      secret,
      bot_info: JSON.stringify(me.result),
      template,
      config: JSON.stringify(config),
      enabled: 1,
      created_at: (deps.now ?? (() => Math.floor(Date.now() / 1000)))(),
    });
    return json({ id, username: me.result?.username, webhook: webhookUrl }, 201);
  }

  const m = url.pathname.match(BOT_PATH_RE);
  if (m) {
    const [, botId, sub] = m;

    // PATCH /admin/bots/:id {enabled?, template?, config?}: kill-switch and template switch (token is never touched).
    if (req.method === "PATCH" && !sub) {
      let body: { enabled?: unknown; template?: unknown; config?: unknown };
      try {
        body = await req.json();
      } catch {
        return json({ error: "JSON kerak" }, 400);
      }
      const hasEnabled = body.enabled !== undefined;
      const hasTemplate = body.template !== undefined;
      if (!hasEnabled && !hasTemplate) return json({ error: "enabled yoki template kerak" }, 400);
      if (hasEnabled && typeof body.enabled !== "boolean") return json({ error: "enabled: boolean kerak" }, 400);
      const row = await getBot(db, botId);
      if (!row) return json({ error: "bot topilmadi" }, 404);
      const out: Record<string, unknown> = { id: botId };
      if (hasTemplate) {
        const tpl = typeof body.template === "string" ? getTemplate(body.template) : undefined;
        if (!tpl) return json({ error: "noma'lum shablon" }, 400);
        let cfg: unknown;
        try {
          cfg = tpl.parseConfig(body.config ?? {});
        } catch (e) {
          return json({ error: "config: " + (e instanceof Error ? e.message : "xato") }, 400);
        }
        await setBotTemplate(db, botId, tpl.name, JSON.stringify(cfg));
        log("info", "admin: bot template switched", { botId, template: tpl.name });
        out.template = tpl.name;
      }
      if (hasEnabled) {
        await setBotEnabled(db, botId, body.enabled as boolean);
        log("info", "admin: bot toggled", { botId, enabled: body.enabled });
        out.enabled = body.enabled;
      }
      return json(out);
    }

    // Stars refund: POST /admin/bots/:id/refund {user_id, charge_id}
    if (req.method === "POST" && sub === "/refund") {
      return handleRefund(req, env, botId, {
        db,
        fetchFn,
        now: deps.now ?? (() => Math.floor(Date.now() / 1000)),
      });
    }

    // Re-applies setWebhook with the current ALLOWED_UPDATES: same url, same stored secret, pending updates kept.
    if (req.method === "POST" && sub === "/sync-webhook") {
      const row = await getBot(db, botId);
      if (!row) return json({ error: "bot topilmadi" }, 404);
      const token = await decryptToken(env.TOKEN_KEY, row.token_enc);
      const webhookUrl = `${url.origin}/wh/${botId}`;
      let res: TgResult;
      try {
        res = await tgCall(fetchFn, token, "setWebhook", {
          url: webhookUrl,
          secret_token: row.secret,
          allowed_updates: ALLOWED_UPDATES,
        });
      } catch (e) {
        log("error", "admin: sync-webhook failed", { botId, error: errInfo(e, token) });
        return json({ error: "Telegram'ga ulanib bo'lmadi" }, 502);
      }
      if (!res.ok) return json({ error: "setWebhook muvaffaqiyatsiz" }, 502);
      log("info", "admin: webhook synced", { botId });
      return json({ ok: true, webhook: webhookUrl, allowed_updates: ALLOWED_UPDATES });
    }

    if ((req.method === "GET" && sub === "/webhook") || (req.method === "POST" && sub === "/setup")) {
      const row: BotRow | null = await getBot(db, botId);
      if (!row) return json({ error: "bot topilmadi" }, 404);

      if (sub === "/webhook") {
        const token = await decryptToken(env.TOKEN_KEY, row.token_enc);
        let info: TgResult;
        try {
          info = await tgCall(fetchFn, token, "getWebhookInfo");
        } catch (e) {
          log("error", "admin: getWebhookInfo failed", { botId, error: errInfo(e, token) });
          return json({ error: "Telegram'ga ulanib bo'lmadi" }, 502);
        }
        if (!info.ok) return json({ error: "getWebhookInfo muvaffaqiyatsiz" }, 502);
        const r = (info.result ?? {}) as Record<string, unknown>;
        return json({
          url: r.url ?? "",
          pending_update_count: r.pending_update_count ?? 0,
          last_error_date: r.last_error_date ?? null,
          last_error_message: r.last_error_message ?? null,
          allowed_updates: r.allowed_updates ?? null,
        });
      }

      const tpl = getTemplate(row.template);
      if (!tpl) return json({ error: "noma'lum shablon" }, 500);
      if (!tpl.profile) return json({ error: "shablonda profil yo'q" }, 409);
      let profile: BotProfile;
      try {
        profile = tpl.profile(tpl.parseConfig(JSON.parse(row.config)));
      } catch (e) {
        log("error", "admin: profile build failed", { botId, error: errInfo(e) });
        return json({ error: "profilni qurib bo'lmadi" }, 500);
      }
      const token = await decryptToken(env.TOKEN_KEY, row.token_enc);
      const results: { method: string; language: string; ok: boolean }[] = [];
      for (const c of profileCalls(profile)) {
        let good = false;
        try {
          good = (await tgCall(fetchFn, token, c.method, c.payload)).ok === true;
        } catch (e) {
          log("warn", "admin: setup call failed", { botId, method: c.method, error: errInfo(e, token) });
        }
        results.push({ method: c.method, language: c.language, ok: good });
      }
      // Optional chat menu button (Mini App): the profile gives a path, the URL is built here from the public base.
      const mb = (profile as BotProfile & { menuButton?: { text?: unknown; path?: unknown } }).menuButton;
      if (mb && typeof mb.text === "string" && typeof mb.path === "string" && mb.path.startsWith("/")) {
        const base = deps.appConfig?.publicBaseUrl ?? url.origin;
        let good = false;
        try {
          good = (
            await tgCall(fetchFn, token, "setChatMenuButton", {
              menu_button: {
                type: "web_app",
                text: mb.text.slice(0, 64),
                web_app: { url: `${base}${mb.path}?b=${encodeURIComponent(botId)}` },
              },
            })
          ).ok === true;
        } catch (e) {
          log("warn", "admin: setup call failed", { botId, method: "setChatMenuButton", error: errInfo(e, token) });
        }
        results.push({ method: "setChatMenuButton", language: "default", ok: good });
      }
      return json({ ok: results.every((r) => r.ok), results });
    }
  }

  return json({ error: "not found" }, 404);
}
