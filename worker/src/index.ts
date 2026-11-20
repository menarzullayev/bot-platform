import { globalFetch } from "./http";
import { handleAdmin } from "./admin";
import { timingSafeEqual } from "./crypto";
import { listEnabledBotConfigs, type Db } from "./db";
import { validateEnv } from "./env";
import type { Env } from "./env";
import { errInfo, log, setLogLevel } from "./log";
import { handleAppApi, serveApp } from "./miniapp";
import { getTemplate, resolveAppConfig, type PlatformDeps } from "./templates";
import { handleWebhook } from "./webhook";

let reported = false;

/** Calls scheduled() of every enabled bot's template; a failing bot never blocks the others. */
export async function runScheduled(env: Env, deps: PlatformDeps = {}): Promise<{ ran: number; failed: number }> {
  const db: Db = deps.db ?? (env.DB as unknown as Db);
  const appConfig = resolveAppConfig(env, deps);
  let ran = 0;
  let failed = 0;
  const bots = await listEnabledBotConfigs(db);
  for (const b of bots) {
    const tpl = getTemplate(b.template);
    if (!tpl?.scheduled) continue;
    try {
      await tpl.scheduled(env, {
        botId: b.id,
        config: tpl.parseConfig(JSON.parse(b.config)),
        db,
        appConfig,
        now: deps.now ?? (() => Math.floor(Date.now() / 1000)),
        fetchFn: deps.fetchFn ?? globalFetch,
      });
      ran++;
    } catch (e) {
      failed++;
      log("error", "scheduled failed", { botId: b.id, template: b.template, error: errInfo(e) });
    }
  }
  log("info", "scheduled done", { ran, failed });
  return { ran, failed };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const check = validateEnv(env);
    if (!check.ok) {
      // Qiymatlar emas, faqat qoida buzilgani haqida; bir izolyatda bir marta log.
      if (!reported) {
        reported = true;
        console.error("env noto'g'ri: " + check.errors.join("; "));
      }
      return new Response("misconfigured", { status: 503 });
    }
    setLogLevel(check.config.logLevel);
    const deps: PlatformDeps = { appConfig: check.config };
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/wh\/([A-Za-z0-9_-]{1,32})$/);
    if (req.method === "POST" && m) return handleWebhook(req, env, m[1], deps);
    if (req.method === "POST" && url.pathname === "/admin/run-scheduled") {
      // Manual trigger of the hourly job (e.g. first FX rates fill); same Bearer auth as the admin API.
      const auth = req.headers.get("authorization") ?? "";
      if (!auth.startsWith("Bearer ") || !timingSafeEqual(auth.slice(7), env.ADMIN_TOKEN)) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      const r = await runScheduled(env, { appConfig: check.config });
      return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
    }
    if (url.pathname.startsWith("/admin/")) {
      try {
        return await handleAdmin(req, env, deps);
      } catch (e) {
        log("error", "admin failed", { error: errInfo(e) });
        return new Response(JSON.stringify({ error: "internal" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    }
    if (url.pathname === "/app" || url.pathname.startsWith("/app/")) return serveApp(req, env);
    if (url.pathname.startsWith("/api/app/")) return handleAppApi(req, env, deps);
    if (url.pathname === "/health") return new Response("ok");
    return new Response("not found", { status: 404 });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const check = validateEnv(env);
    if (!check.ok) {
      console.error("env noto'g'ri: " + check.errors.join("; "));
      return;
    }
    setLogLevel(check.config.logLevel);
    ctx.waitUntil(
      runScheduled(env, { appConfig: check.config }).catch((e) =>
        log("error", "scheduled crashed", { error: errInfo(e) }),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
