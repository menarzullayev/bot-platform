import { globalFetch } from "./http";
import { handleAdmin } from "./admin";
import { timingSafeEqual } from "./crypto";
import { listEnabledBotConfigs, type Db } from "./db";
import { validateEnv } from "./env";
import type { AppConfig, Env } from "./env";
import { errInfo, log, setLogLevel } from "./log";
import { API_RE, handleAppApi, serveApp } from "./miniapp";
import { serveCard } from "./miniapp/cards";
import { count, flushIfDue, flushMetrics, PLATFORM_BOT, type WaitUntil } from "./metrics";
import { refreshIfStale } from "./degrade";
import { serveSite } from "./site";
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
  await flushMetrics(db); // counters of this isolate; best effort, never throws
  log("info", "scheduled done", { ran, failed });
  return { ran, failed };
}

/** Paths the Worker answers itself; every other GET/HEAD is a static file (landing, legal pages, brand assets). */
const OWNED = /^\/(?:wh|admin|api|card|health|app)(?:\/|$)/;

/** Bot ids proven to exist in this isolate (a response that could only come after the bot lookup). */
const knownBots = new WeakMap<object, Set<string>>();
const KNOWN_MAX = 200;

async function dispatch(req: Request, env: Env, ctx: WaitUntil | undefined, config: AppConfig, deps: PlatformDeps): Promise<Response> {
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
    const r = await runScheduled(env, { appConfig: config });
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
  if (url.pathname.startsWith("/api/app/")) return handleAppApi(req, env, deps, ctx);
  if (url.pathname.startsWith("/card/")) {
    try {
      const nowMs = Date.now();
      return await serveCard({ req, db: env.DB as unknown as Db, now: Math.floor(nowMs / 1000), nowMs, ctx });
    } catch (e) {
      log("error", "card failed", { error: errInfo(e) });
      return new Response("internal", { status: 500 });
    }
  }
  if (url.pathname === "/health") return new Response("ok");
  if (!OWNED.test(url.pathname) && (req.method === "GET" || req.method === "HEAD")) return serveSite(req, env);
  return new Response("not found", { status: 404 });
}

/**
 * Counts one `req` (DEC-013/015: every Worker invocation counts against the free plan's daily limit) in memory
 * only, then flushes to D1 when due. The bot id is attributed only when the response proves the bot exists, so
 * scanners probing random ids cannot create rows; everything else lands under "-".
 */
function account(req: Request, env: Env, ctx: WaitUntil | undefined, status: number): void {
  const db = env.DB as unknown as Db;
  const path = new URL(req.url).pathname;
  let bot = PLATFORM_BOT;
  let guess: string | null = null;
  let proof = false;
  const wh = req.method === "POST" ? path.match(/^\/wh\/([A-Za-z0-9_-]{1,32})$/) : null;
  const api = API_RE.exec(path);
  if (wh) {
    guess = wh[1];
    proof = status !== 404;
  } else if (api && api[2] !== "fx") {
    guess = api[1];
    // 401 (no/invalid auth), 404 (unknown bot or action), 405 and 429 can happen before the bot lookup
    proof = ![401, 404, 405, 429].includes(status);
  }
  if (guess) {
    let known = knownBots.get(db);
    if (!known) knownBots.set(db, (known = new Set()));
    if (proof && !known.has(guess) && known.size < KNOWN_MAX) known.add(guess);
    if (known.has(guess)) bot = guess;
  }
  const nowMs = Date.now();
  count(db, bot, "req", 1, { nowMs });
  const p = flushIfDue(db, nowMs);
  if (p) ctx?.waitUntil(p);
}

export default {
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
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
    // Off-path: re-read today's request total (at most once a minute per isolate) for the degradation level.
    const stale = refreshIfStale(env.DB as unknown as Db, Math.floor(Date.now() / 1000));
    if (stale) ctx?.waitUntil(stale);
    let status = 500;
    try {
      const res = await dispatch(req, env, ctx, check.config, deps);
      status = res.status;
      return res;
    } finally {
      try {
        account(req, env, ctx, status);
      } catch (e) {
        log("warn", "metrics: accounting failed", { error: errInfo(e) });
      }
    }
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
