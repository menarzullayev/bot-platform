import { encryptToken, randomSecret, timingSafeEqual } from "./crypto";
import { getBot, insertBot, listBots, type Db } from "./db";
import type { Deps, Env } from "./env";
import { parseForceSubConfig } from "./templates/forcesub";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;
const ALLOWED_UPDATES = ["message", "callback_query", "my_chat_member", "chat_member"];

export async function handleAdmin(req: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!env.ADMIN_TOKEN || !timingSafeEqual(auth, `Bearer ${env.ADMIN_TOKEN}`)) {
    return json({ error: "unauthorized" }, 401);
  }
  const db: Db = deps.db ?? (env.DB as unknown as Db);
  const fetchFn = deps.fetchFn ?? fetch;
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/admin/bots") {
    return json({ bots: await listBots(db) });
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
    if (template !== "forcesub") return json({ error: "noma'lum shablon" }, 400);
    let config;
    try {
      config = parseForceSubConfig(body.config);
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

  return json({ error: "not found" }, 404);
}
