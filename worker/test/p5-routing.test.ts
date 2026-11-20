import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { runScheduled } from "../src/index";
import { getDegradation } from "../src/degrade";
import type { Env } from "../src/env";
import { setLogLevel, setLogSink } from "../src/log";
import { FLUSH_AGE_MS, FLUSH_EVENTS, flushMetrics, pendingSum } from "../src/metrics";
import { CSP } from "../src/miniapp";
import { SITE_CSP, siteCandidates } from "../src/site";
import { ADMIN_TOKEN, BOT_ID, BOT_TOKEN, FakeCtx, SqliteDb, dayOfSec, initDataFor, makePng } from "./p5-helpers";
import { TEST_KEY } from "./helpers";

const T0 = Date.UTC(2026, 10, 21, 12, 0, 0);
const NOW_S = T0 / 1000;
const DAY = dayOfSec(NOW_S);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  setLogSink(null);
  setLogLevel("info");
});

interface Asset {
  type: string;
  body: string;
  headers?: Record<string, string>;
  status?: number;
}

function makeAssets(files: Record<string, Asset>) {
  const requested: string[] = [];
  const fetcher = {
    async fetch(input: Request | string | URL): Promise<Response> {
      const req = input instanceof Request ? input : new Request(String(input));
      const path = new URL(req.url).pathname;
      requested.push(path);
      const f = files[path];
      if (!f) return new Response("nope", { status: 404 });
      return new Response(req.method === "HEAD" || f.status === 304 ? null : f.body, {
        status: f.status ?? 200,
        headers: { "content-type": f.type, ...(f.headers ?? {}) },
      });
    },
  };
  return { fetcher: fetcher as unknown as Fetcher, requested };
}

const FILES: Record<string, Asset> = {
  "/index.html": { type: "text/html; charset=utf-8", body: "<h1>home</h1>" },
  "/privacy.html": { type: "text/html; charset=utf-8", body: "<h1>privacy</h1>" },
  "/terms.html": { type: "text/html; charset=utf-8", body: "<h1>terms</h1>" },
  "/support/index.html": { type: "text/html; charset=utf-8", body: "<h1>support</h1>" },
  "/privacy/index.html": { type: "text/html; charset=utf-8", body: "<h1>privacy dir</h1>" },
  "/site/index.html": { type: "text/html; charset=utf-8", body: "<h1>site dir</h1>" },
  "/site/app.css": { type: "text/css", body: "body{}" },
  "/site/app.js": { type: "text/javascript", body: "1" },
  "/site/cached.css": { type: "text/css", body: "a{}", headers: { "cache-control": "public, max-age=31536000, immutable" } },
  "/brand/logo.svg": { type: "image/svg+xml", body: "<svg/>" },
  "/robots.txt": { type: "text/plain", body: "User-agent: *" },
  "/etag.png": { type: "image/png", body: "", status: 304 },
  "/app/index.html": { type: "text/html; charset=utf-8", body: "<div id=app></div>" },
  "/app/assets/index-ABCDEFGH.js": { type: "text/javascript", body: "1" },
};

async function boot(files: Record<string, Asset> | null = FILES, extra: Partial<Env> = {}) {
  const db = new SqliteDb();
  const assets = files ? makeAssets(files) : null;
  const env = {
    DB: db as unknown as D1Database,
    TOKEN_KEY: TEST_KEY,
    ADMIN_TOKEN,
    PUBLIC_BASE_URL: "https://example.test",
    APP_ENV: "production",
    INITDATA_MAX_AGE_S: "3600",
    ...(assets ? { ASSETS: assets.fetcher } : {}),
    ...extra,
  } as Env;
  const ctx = new FakeCtx();
  const get = (path: string, init?: RequestInit) => worker.fetch(new Request("https://example.test" + path, init), env, ctx as unknown as ExecutionContext);
  return { db, env, ctx, get, assets };
}

describe("static site fallback", () => {
  it.each([
    ["/", "home"],
    ["/privacy", "privacy"],
    ["/terms", "terms"],
    ["/support", "support"],
    ["/privacy/", "privacy dir"],
    ["/site/", "site dir"],
    ["/privacy.html", "privacy"],
  ])("GET %s is served from the assets", async (path, text) => {
    const { get } = await boot();
    const r = await get(path);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain(text);
  });

  it.each([
    ["/site/app.css", "text/css"],
    ["/site/app.js", "text/javascript"],
    ["/brand/logo.svg", "image/svg+xml"],
    ["/robots.txt", "text/plain"],
  ])("static file %s keeps its content type", async (path, type) => {
    const { get } = await boot();
    const r = await get(path);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe(type);
  });

  it("security headers on every static response", async () => {
    const { get } = await boot();
    for (const p of ["/", "/privacy", "/site/app.css", "/brand/logo.svg", "/robots.txt"]) {
      const r = await get(p);
      expect(r.headers.get("content-security-policy"), p).toBe(SITE_CSP);
      expect(r.headers.get("x-content-type-options"), p).toBe("nosniff");
      expect(r.headers.get("referrer-policy"), p).toBe("no-referrer");
      expect(r.headers.get("permissions-policy"), p).toContain("camera=()");
    }
  });

  it("the landing CSP is exactly what DEC-012 asks for plus object/base/frame hardening", () => {
    const parts = SITE_CSP.split("; ");
    expect(parts).toEqual(
      expect.arrayContaining(["default-src 'self'", "img-src 'self' data:", "style-src 'self'", "script-src 'self'"]),
    );
    expect(SITE_CSP).not.toContain("unsafe-inline");
    expect(SITE_CSP).not.toContain("unsafe-eval");
    expect(SITE_CSP).not.toContain("telegram.org");
    expect(SITE_CSP).not.toContain("*");
    expect(parts).toContain("frame-ancestors 'none'");
  });

  it("html is revalidated (no-cache); other files get a default cache and keep their own when set", async () => {
    const { get } = await boot();
    expect((await get("/")).headers.get("cache-control")).toBe("no-cache");
    expect((await get("/site/app.css")).headers.get("cache-control")).toBe("public, max-age=3600");
    expect((await get("/site/cached.css")).headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("HEAD works and carries no body", async () => {
    const { get } = await boot();
    const r = await get("/privacy", { method: "HEAD" });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("");
  });

  it("non-404 statuses of the asset layer pass through (e.g. 304)", async () => {
    const { get } = await boot();
    expect((await get("/etag.png")).status).toBe(304);
  });

  it("an unknown path is 404 and still carries the CSP", async () => {
    const { get } = await boot();
    const r = await get("/nothing-here");
    expect(r.status).toBe(404);
    expect(r.headers.get("content-security-policy")).toBe(SITE_CSP);
  });

  it("without an ASSETS binding every static path is 404", async () => {
    const { get } = await boot(null);
    for (const p of ["/", "/privacy", "/site/app.css"]) expect((await get(p)).status).toBe(404);
  });

  it.each(["POST", "PUT", "DELETE", "PATCH"])("%s on a static path is 404 (assets are read-only)", async (method) => {
    const { get, assets } = await boot();
    const r = await get("/privacy", { method, body: "x" });
    expect(r.status).toBe(404);
    expect(assets!.requested).toHaveLength(0);
  });

  it("tries /x, /x.html and /x/index.html in that order and stops at the first hit", async () => {
    const { get, assets } = await boot();
    await get("/terms");
    expect(assets!.requested).toEqual(["/terms", "/terms.html"]);
    assets!.requested.length = 0;
    await get("/support");
    expect(assets!.requested).toEqual(["/support", "/support.html", "/support/index.html"]);
  });

  it.each(["/a%2fb", "/a%2Fb", "/a%5cb", "/a%00b"])("encoded separator / NUL in %s never reaches the assets", async (p) => {
    const { get, assets } = await boot();
    expect((await get(p)).status).toBe(404);
    expect(assets!.requested).toHaveLength(0);
  });

  it.each(["/%2e%2e/secret", "/a/../../b", "/a\\b"])("%s is normalised by the URL parser, so no dot segment or backslash is ever forwarded", async (p) => {
    const { get, assets } = await boot();
    expect((await get(p)).status).toBe(404);
    for (const r of assets!.requested) expect(r).not.toMatch(/\.\.|\\|%/);
  });

  it("siteCandidates", () => {
    expect(siteCandidates("/")).toEqual(["/index.html"]);
    expect(siteCandidates("/privacy")).toEqual(["/privacy", "/privacy.html", "/privacy/index.html"]);
    expect(siteCandidates("/privacy/")).toEqual(["/privacy/index.html"]);
    expect(siteCandidates("/site/a.css")).toEqual(["/site/a.css"]);
    expect(siteCandidates("/brand/logo.svg")).toEqual(["/brand/logo.svg"]);
    expect(siteCandidates("/a.b/c")).toEqual(["/a.b/c", "/a.b/c.html", "/a.b/c/index.html"]);
  });
});

describe("routes the Worker owns never fall through to the assets", () => {
  it.each(["/wh/tezcalc", "/wh", "/admin/bots", "/admin", "/api/app/x/me", "/api/other", "/card/zzz", "/card", "/health"])(
    "GET %s",
    async (p) => {
      const { get, assets } = await boot();
      await get(p);
      expect(assets!.requested).toEqual([]);
    },
  );

  it("/health is ok and /admin without a token is 401", async () => {
    const { get } = await boot();
    expect(await (await get("/health")).text()).toBe("ok");
    expect((await get("/admin/stats")).status).toBe(401);
  });

  it("prefix lookalikes are static paths, not owned routes", async () => {
    const { get, assets } = await boot();
    await get("/application");
    await get("/admin-panel");
    await get("/cardigan.png");
    expect(assets!.requested).toEqual(
      expect.arrayContaining(["/application", "/admin-panel", "/cardigan.png"]),
    );
  });
});

describe("/app keeps its own handler and CSP", () => {
  it("serves the app shell with the app CSP, not the landing CSP", async () => {
    const { get } = await boot();
    const r = await get("/app");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-security-policy")).toBe(CSP);
    expect(r.headers.get("content-security-policy")).not.toBe(SITE_CSP);
    expect(CSP).toContain("https://telegram.org");
  });

  it("SPA fallback and hashed assets still work", async () => {
    const { get } = await boot();
    const spa = await get("/app/settings");
    expect(spa.status).toBe(200);
    expect(await spa.text()).toContain("app");
    const js = await get("/app/assets/index-ABCDEFGH.js");
    expect(js.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(js.headers.get("content-security-policy")).toBe(CSP);
  });

  it("a missing /app file with an extension is 404", async () => {
    const { get } = await boot();
    expect((await get("/app/missing.js")).status).toBe(404);
  });
});

describe("misconfigured environment", () => {
  it("503, and the request is not counted (no usable config)", async () => {
    const { get, db } = await boot(FILES, { ADMIN_TOKEN: "short" });
    expect((await get("/")).status).toBe(503);
    expect(pendingSum(db, DAY, "req")).toBe(0);
  });
});

// ---- request accounting (item 7) -------------------------------------------------------------------------------------

const wh = (id: string, secret: string, n = 1) =>
  new Request(`https://example.test/wh/${id}`, {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": secret, "content-type": "application/json" },
    body: JSON.stringify({ update_id: n }),
  });

describe("req counting: memory only on the hot path", () => {
  it("counts every kind of Worker invocation once", async () => {
    const { get, db } = await boot();
    await get("/health");
    await get("/");
    await get("/app");
    await get("/card/" + "a".repeat(22) + ".png");
    await get("/admin/stats");
    await get("/api/app/tezcalc/me");
    await get("/nothing");
    expect(pendingSum(db, DAY, "req")).toBe(7);
  });

  it("webhook and api requests are counted even when rejected", async () => {
    const { db, env, ctx } = await boot();
    await db.addBot("tezcalc", {}, 0);
    await worker.fetch(wh("tezcalc", "wrong"), env, ctx as unknown as ExecutionContext);
    await worker.fetch(wh("nobot", "x"), env, ctx as unknown as ExecutionContext);
    expect(pendingSum(db, DAY, "req")).toBe(2);
  });

  it("24 requests write nothing to D1; the 25th triggers ONE upsert through waitUntil", async () => {
    const { get, db, ctx } = await boot();
    await get("/health"); // primes the degradation refresh (a read, not a write)
    await ctx.settle();
    db.resetCounters();
    for (let i = 0; i < FLUSH_EVENTS - 2; i++) await get("/health");
    await ctx.settle();
    expect(db.writes).toBe(0);
    await get("/health"); // 25th event
    await ctx.settle();
    expect(db.writes).toBe(1);
    expect(db.metric(DAY, "-", "req")).toBe(FLUSH_EVENTS);
  });

  it("an old pending event is flushed by the next request (60 s rule)", async () => {
    const { get, db, ctx } = await boot();
    await get("/health");
    await get("/health");
    await get("/health");
    await ctx.settle();
    expect(db.metric(DAY, "-", "req")).toBeNull();
    vi.setSystemTime(T0 + FLUSH_AGE_MS + 1);
    await get("/health");
    await ctx.settle();
    expect(db.metric(DAY, "-", "req")).toBe(4);
  });

  it("works without an ExecutionContext (the flush is still started)", async () => {
    const { db, env } = await boot();
    for (let i = 0; i < FLUSH_EVENTS; i++) await worker.fetch(new Request("https://example.test/health"), env);
    await flushMetrics(db); // joins the running flush
    expect(db.metric(DAY, "-", "req")).toBe(FLUSH_EVENTS);
  });

  it("1000 requests cost at most 40 D1 writes (25x fewer) and lose nothing", async () => {
    const { get, db, ctx } = await boot();
    await get("/health");
    await ctx.settle();
    db.resetCounters();
    for (let i = 0; i < 999; i++) {
      await get("/health");
      if (i % 50 === 0) await ctx.settle();
    }
    await ctx.settle();
    await flushMetrics(db);
    expect(db.writes).toBeLessThanOrEqual(41);
    expect(db.metric(DAY, "-", "req")).toBe(1000);
  });

  it("a failing D1 never breaks the response", async () => {
    const { get, db, ctx } = await boot();
    db.failOn = /metrics_daily/;
    for (let i = 0; i < 30; i++) expect((await get("/health")).status).toBe(200);
    await ctx.settle();
  });

  it("the cron flushes what this isolate holds", async () => {
    const { get, db, env } = await boot();
    await get("/health");
    await get("/health");
    await runScheduled(env);
    expect(db.metric(DAY, "-", "req")).toBe(2);
  });

  it("POST /admin/run-scheduled flushes too", async () => {
    const { get, db } = await boot();
    await get("/health");
    const r = await get("/admin/run-scheduled", { method: "POST", headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
    expect(r.status).toBe(200);
    expect(db.metric(DAY, "-", "req")).toBeGreaterThanOrEqual(1);
  });
});

describe("req counting: bot attribution cannot be forged", () => {
  const settle = async (ctx: FakeCtx, db: SqliteDb) => {
    await ctx.settle();
    await flushMetrics(db);
  };

  it("an existing bot is attributed (a 401 from the secret check proves it exists)", async () => {
    const { db, env, ctx } = await boot();
    await db.addBot("tezcalc", {}, 0);
    await worker.fetch(wh("tezcalc", "wrong"), env, ctx as unknown as ExecutionContext);
    await worker.fetch(wh("tezcalc", "s"), env, ctx as unknown as ExecutionContext); // disabled bot: 200
    await settle(ctx, db);
    expect(db.metric(DAY, "tezcalc", "req")).toBe(2);
  });

  it("random bot ids create no rows of their own: they all land on the platform bot", async () => {
    const { db, env, ctx } = await boot();
    for (let i = 0; i < 60; i++) await worker.fetch(wh(`fake${i}`, "x"), env, ctx as unknown as ExecutionContext);
    await settle(ctx, db);
    const rows = db.rows<{ bot_id: string; n: number }>("SELECT bot_id, n FROM metrics_daily WHERE key = 'req'");
    expect(rows).toEqual([{ bot_id: "-", n: 60 }]);
  });

  it("api: unauthenticated probes of fake bots are not attributed, not even /fx which answers for any id", async () => {
    const { db, env, ctx } = await boot();
    for (const id of ["ghost1", "ghost2"]) {
      await worker.fetch(new Request(`https://example.test/api/app/${id}/me`), env, ctx as unknown as ExecutionContext);
      await worker.fetch(new Request(`https://example.test/api/app/${id}/fx`), env, ctx as unknown as ExecutionContext);
    }
    await settle(ctx, db);
    expect(db.rows("SELECT bot_id FROM metrics_daily WHERE key = 'req'")).toEqual([{ bot_id: "-" }]);
  });

  it("api: an authenticated call proves the bot; later rejected calls for it are attributed too", async () => {
    const { db, env, ctx } = await boot();
    await db.addBot();
    const initData = initDataFor(BOT_TOKEN, { id: 4242 }, NOW_S);
    const call = (auth?: string) =>
      worker.fetch(
        new Request(`https://example.test/api/app/${BOT_ID}/me`, { headers: auth ? { authorization: `tma ${auth}` } : {} }),
        env,
        ctx as unknown as ExecutionContext,
      );
    await call(); // 401, bot unknown to this isolate yet -> "-"
    expect((await call(initData)).status).toBe(200);
    await call(); // 401 again, now attributed
    await settle(ctx, db);
    expect(db.metric(DAY, "-", "req")).toBe(1);
    expect(db.metric(DAY, BOT_ID, "req")).toBe(2);
  });

  it("api responses 404/405/429 never prove a bot", async () => {
    const { db, env, ctx } = await boot();
    await worker.fetch(new Request("https://example.test/api/app/ghost/nope"), env, ctx as unknown as ExecutionContext); // 404
    await worker.fetch(new Request("https://example.test/api/app/ghost/me", { method: "DELETE" }), env, ctx as unknown as ExecutionContext); // 405
    await settle(ctx, db);
    expect(db.rows("SELECT bot_id FROM metrics_daily WHERE key = 'req'")).toEqual([{ bot_id: "-" }]);
  });
});

describe("the degradation level end to end through worker.fetch", () => {
  async function prime(db: SqliteDb, ctx: FakeCtx, get: (p: string, i?: RequestInit) => Promise<Response>, total: number) {
    db.setReq(DAY, total);
    await get("/health"); // schedules the off-path refresh
    await ctx.settle();
  }

  it("the first request of an isolate refreshes the total off the request path (one read, then none for 60 s)", async () => {
    const { get, db, ctx } = await boot();
    db.setReq(DAY, 5);
    db.resetCounters();
    await get("/health");
    await ctx.settle();
    expect(db.sqls.filter((s) => /FROM metrics_daily/.test(s))).toHaveLength(1);
    db.resetCounters();
    for (let i = 0; i < 20; i++) await get("/health");
    await ctx.settle();
    expect(db.sqls.filter((s) => /FROM metrics_daily/.test(s))).toHaveLength(0);
    vi.setSystemTime(T0 + 61_000);
    await get("/health");
    await ctx.settle();
    expect(db.sqls.filter((s) => /FROM metrics_daily/.test(s))).toHaveLength(1);
  });

  it("at 90000+ settings and card creation answer 503 and /me reports degraded 2", async () => {
    const { get, db, ctx } = await boot();
    await db.addBot();
    await prime(db, ctx, get, 95_000);
    const initData = initDataFor(BOT_TOKEN, { id: 4242 }, Math.floor(Date.now() / 1000));
    const h = { authorization: `tma ${initData}` };
    const me = await get(`/api/app/${BOT_ID}/me`, { headers: h });
    expect(((await me.json()) as { degraded: number }).degraded).toBe(2);
    expect(
      (await get(`/api/app/${BOT_ID}/settings`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: '{"digits":8}' })).status,
    ).toBe(503);
    expect((await get(`/api/app/${BOT_ID}/card`, { method: "POST", headers: { ...h, "content-type": "image/png" }, body: makePng() })).status).toBe(503);
  });

  it("a disabled-bot webhook (plain bot traffic) is untouched by degradation", async () => {
    const { db, env, ctx, get } = await boot();
    await db.addBot("tezcalc", {}, 0);
    await prime(db, ctx, get, 99_999);
    expect((await worker.fetch(wh("tezcalc", "s"), env, ctx as unknown as ExecutionContext)).status).toBe(200);
  });

  it("static pages, health and card downloads keep working at level 2", async () => {
    const { get, db, ctx } = await boot();
    await prime(db, ctx, get, 99_999);
    expect((await get("/")).status).toBe(200);
    expect((await get("/health")).status).toBe(200);
    const id = "b".repeat(22);
    db.exec("INSERT INTO cards (id, bot_id, user_id, png, created_at) VALUES (?, 'tezcalc', 1, ?, ?)", id, makePng(), Math.floor(Date.now() / 1000));
    expect((await get(`/card/${id}.png`)).status).toBe(200);
  });

  it("the counter itself pushes the level up: crossing 70000 during the day degrades without a refresh", async () => {
    const { get, db, ctx } = await boot();
    await db.addBot();
    await prime(db, ctx, get, 69_990);
    const h = { authorization: `tma ${initDataFor(BOT_TOKEN, { id: 4242 }, Math.floor(Date.now() / 1000))}` };
    const level = async () => ((await (await get(`/api/app/${BOT_ID}/me`, { headers: h })).json()) as { degraded: number }).degraded;
    expect(await level()).toBe(0);
    for (let i = 0; i < 12; i++) await get("/health");
    expect(await level()).toBe(1);
  });

  it("GET /card/:id.png through the Worker is counted as req and card:view", async () => {
    const { get, db } = await boot();
    const id = "c".repeat(22);
    db.exec("INSERT INTO cards (id, bot_id, user_id, png, created_at) VALUES (?, 'tezcalc', 1, ?, ?)", id, makePng(), Math.floor(Date.now() / 1000));
    const r = await get(`/card/${id}.png`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=86400, immutable");
    expect(pendingSum(db, DAY, "req")).toBe(1);
    expect(pendingSum(db, DAY, "card:view")).toBe(1);
  });

  it("the thresholds come from DEGRADE_L1/L2 in the environment", async () => {
    const { get, db, ctx } = await boot(FILES, { DEGRADE_L1: "10", DEGRADE_L2: "20" });
    await db.addBot();
    await prime(db, ctx, get, 15);
    const h = { authorization: `tma ${initDataFor(BOT_TOKEN, { id: 4242 }, Math.floor(Date.now() / 1000))}` };
    const me = await get(`/api/app/${BOT_ID}/me`, { headers: h });
    expect(((await me.json()) as { degraded: number }).degraded).toBe(1);
  });

  it("getDegradation agrees with what the Worker computed", async () => {
    const { get, db, ctx } = await boot();
    await prime(db, ctx, get, 71_000);
    expect(await getDegradation(db, NOW_S)).toBe(1);
  });
});
