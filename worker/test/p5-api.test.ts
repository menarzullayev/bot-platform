import { afterEach, describe, expect, it } from "vitest";
import { getDegradation } from "../src/degrade";
import { setLogLevel, setLogSink } from "../src/log";
import { count, flushMetrics, pendingSum } from "../src/metrics";
import { NOW, apiCtx, dayOfSec, type ApiCtx } from "./p5-helpers";

afterEach(() => {
  setLogSink(null);
  setLogLevel("info");
});

const DAY = dayOfSec(NOW);

/** Seeds today's total and primes the isolate's level cache (production does this off-path from index.ts). */
async function atLevel(c: ApiCtx, total: number): Promise<void> {
  c.db.setReq(DAY, total);
  await getDegradation(c.db, Math.floor(c.clock.ms / 1000));
}

const setUser = (c: ApiCtx, fields: Record<string, unknown>, user = 4242) => {
  const cols = Object.keys(fields);
  c.db.exec(
    `INSERT OR REPLACE INTO users (bot_id, user_id, ${cols.join(", ")}, created_at, updated_at) VALUES ('tezcalc', ?, ${cols.map(() => "?").join(", ")}, 1, 1)`,
    user,
    ...Object.values(fields),
  );
};

describe("GET /me: degraded field", () => {
  it("adds degraded without changing any existing key", async () => {
    const c = await apiCtx();
    const j = (await (await c.call("me")).json()) as Record<string, unknown>;
    expect(Object.keys(j).sort()).toEqual(["degraded", "lang", "limits", "pro", "pro_stars", "settings", "user"]);
    expect(Object.keys(j.settings as object).sort()).toEqual(["angle", "contrast", "density", "digits", "fs", "keep_history", "lite", "style"]);
    expect(Object.keys(j.pro as object).sort()).toEqual(["is_pro", "pro_until"]);
    expect(Object.keys(j.limits as object)).toEqual(["history"]);
  });

  it.each([
    [0, 0],
    [69_999, 0],
    [70_000, 1],
    [89_999, 1],
    [90_000, 2],
    [250_000, 2],
  ])("D1 total %i -> degraded %i", async (n, lvl) => {
    const c = await apiCtx();
    await atLevel(c, n);
    const j = (await (await c.call("me")).json()) as { degraded: number };
    expect(j.degraded).toBe(lvl);
  });

  it("is a number 0|1|2, never a boolean or string", async () => {
    const c = await apiCtx();
    for (const n of [0, 80_000, 95_000]) {
      await atLevel(c, n);
      c.clock.ms += 61_000;
      const j = (await (await c.call("me")).json()) as { degraded: unknown };
      expect([0, 1, 2]).toContain(j.degraded);
      expect(typeof j.degraded).toBe("number");
    }
  });

  it("uses the unflushed local counter (no D1 round trip needed)", async () => {
    const c = await apiCtx();
    count(c.db, "tezcalc", "req", 90_000, { nowMs: c.clock.ms });
    expect(((await (await c.call("me")).json()) as { degraded: number }).degraded).toBe(2);
  });

  it("a cold isolate fails open (level 0) instead of blocking users", async () => {
    const c = await apiCtx();
    c.db.setReq(DAY, 99_999); // in D1 but never loaded into this isolate
    expect(((await (await c.call("me")).json()) as { degraded: number }).degraded).toBe(0);
  });

  it("/me adds no D1 read for the level (budget: bot + user only)", async () => {
    const c = await apiCtx();
    c.db.resetCounters();
    await c.call("me");
    expect(c.db.reads).toBe(2);
    expect(c.db.writes).toBe(0);
  });

  it("custom thresholds are honoured", async () => {
    const c = await apiCtx({ DEGRADE_L1: "100", DEGRADE_L2: "200" });
    await atLevel(c, 150);
    expect(((await (await c.call("me")).json()) as { degraded: number }).degraded).toBe(1);
  });
});

describe("GET /me: anonymous counters", () => {
  it("counts app:open and the language, plus the style when one is saved", async () => {
    const c = await apiCtx();
    setUser(c, { lang: "ru", style: "glass" });
    await c.call("me");
    expect(pendingSum(c.db, DAY, "app:open")).toBe(1);
    expect(pendingSum(c.db, DAY, "lang:ru")).toBe(1);
    expect(pendingSum(c.db, DAY, "style:glass")).toBe(1);
  });

  it("no style counter when the user never chose one; the language comes from the Telegram locale", async () => {
    const c = await apiCtx();
    await c.call("me");
    expect(pendingSum(c.db, DAY, "app:open")).toBe(1);
    expect(pendingSum(c.db, DAY, "lang:en")).toBe(1);
    for (const s of ["tactile", "glass", "fintech", "techno"]) expect(pendingSum(c.db, DAY, `style:${s}`)).toBe(0);
  });

  it("after a flush the stored rows contain no user id", async () => {
    const c = await apiCtx();
    setUser(c, { lang: "uz-latn", style: "tactile" });
    await c.call("me");
    await c.call("me", { user: 99 });
    await flushMetrics(c.db, c.clock.ms);
    const dump = JSON.stringify(c.db.rows("SELECT * FROM metrics_daily"));
    expect(dump).not.toContain("4242");
    expect(dump).not.toContain('"99"');
    expect(c.db.metric(DAY, "tezcalc", "app:open")).toBe(2);
  });

  it("a rejected request counts nothing", async () => {
    const c = await apiCtx();
    await c.call("me", { noAuth: true });
    expect(pendingSum(c.db, DAY, "app:open")).toBe(0);
  });
});

describe("level 2: settings and history writes are off", () => {
  it("POST /settings: 503 degraded with Retry-After, nothing written", async () => {
    const c = await apiCtx();
    await atLevel(c, 90_000);
    c.db.resetCounters();
    const r = await c.call("settings", { method: "POST", body: { style: "glass" } });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: "degraded" });
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(c.db.writes).toBe(0);
    expect(c.db.rows("SELECT * FROM users")).toHaveLength(0);
  });

  it("is refused before authentication (no bot lookup)", async () => {
    const c = await apiCtx();
    await atLevel(c, 95_000);
    c.db.resetCounters();
    const r = await c.call("settings", { method: "POST", body: { style: "glass" }, noAuth: true });
    expect(r.status).toBe(503);
    expect(c.db.sqls.some((s) => /FROM bots/.test(s))).toBe(false);
  });

  it("applies to Pro users too", async () => {
    const c = await apiCtx();
    setUser(c, { pro_until: NOW + 1_000_000 });
    await atLevel(c, 95_000);
    expect((await c.call("settings", { method: "POST", body: { digits: 8 } })).status).toBe(503);
  });

  it("POST /history: 503 and no row", async () => {
    const c = await apiCtx();
    setUser(c, { keep_history: 1 });
    await atLevel(c, 91_000);
    const r = await c.call("history", { method: "POST", body: { expr: "2+2", result: "4" } });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: "degraded" });
    expect(c.db.rows("SELECT * FROM history")).toHaveLength(0);
  });

  it("GET /settings-like reads keep working: /me, GET /history", async () => {
    const c = await apiCtx();
    setUser(c, { keep_history: 1 });
    c.db.exec("INSERT INTO history (bot_id, user_id, expr, result, ts) VALUES ('tezcalc', 4242, '1+1', '2', 5)");
    await atLevel(c, 99_000);
    expect((await c.call("me")).status).toBe(200);
    const h = await c.call("history");
    expect(h.status).toBe(200);
    expect(((await h.json()) as { items: unknown[] }).items).toHaveLength(1);
  });

  it("DELETE /history stays available (a privacy right, and it only frees space)", async () => {
    const c = await apiCtx();
    setUser(c, { keep_history: 1 });
    c.db.exec("INSERT INTO history (bot_id, user_id, expr, result, ts) VALUES ('tezcalc', 4242, '1+1', '2', 5)");
    await atLevel(c, 99_000);
    expect((await c.call("history", { method: "DELETE" })).status).toBe(200);
    expect(c.db.rows("SELECT * FROM history")).toHaveLength(0);
  });

  it("the invoice (payments) is never degraded", async () => {
    const c = await apiCtx();
    await atLevel(c, 99_000);
    const r = await c.call("invoice", { method: "POST" });
    expect(r.status).toBe(200);
    expect(c.fetches).toHaveLength(1);
  });

  it("fx (conversion rates) is never degraded", async () => {
    const c = await apiCtx();
    c.db.exec("INSERT INTO fx_rates (base, quote, rate, updated_at, source) VALUES ('UZS','USD','0.00008', ?, 'cbu')", NOW);
    await atLevel(c, 99_000);
    expect((await c.call("fx")).status).toBe(200);
  });

  it("is back to normal on the next UTC day", async () => {
    const c = await apiCtx({ INITDATA_MAX_AGE_S: "86400" });
    const lastSecond = NOW - (NOW % 86_400) + 86_399;
    c.db.setReq(dayOfSec(lastSecond), 95_000);
    c.clock.ms = lastSecond * 1000 - 5000;
    await getDegradation(c.db, lastSecond - 5);
    expect((await c.call("settings", { method: "POST", body: { digits: 8 } })).status).toBe(503);
    c.clock.ms = (lastSecond + 2) * 1000;
    await getDegradation(c.db, lastSecond + 2);
    expect((await c.call("settings", { method: "POST", body: { digits: 8 } })).status).toBe(200);
  });
});

describe("level 1: only cards are off", () => {
  it("settings and history writes still work", async () => {
    const c = await apiCtx();
    setUser(c, { keep_history: 1 });
    await atLevel(c, 80_000);
    expect((await c.call("settings", { method: "POST", body: { style: "fintech" } })).status).toBe(200);
    expect((await c.call("history", { method: "POST", body: { expr: "2+2", result: "4" } })).status).toBe(201);
    expect(c.db.rows("SELECT * FROM history")).toHaveLength(1);
  });

  it("card creation is refused", async () => {
    const c = await apiCtx();
    await atLevel(c, 80_000);
    const r = await c.call("card", { method: "POST" });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: "degraded" });
  });
});

describe("level 0: nothing changes", () => {
  it("settings and history writes work and the user budget is unchanged (bot + user reads + 1 write)", async () => {
    const c = await apiCtx();
    c.db.resetCounters();
    const r = await c.call("settings", { method: "POST", body: { style: "glass" } });
    expect(r.status).toBe(200);
    expect(c.db.reads).toBe(2);
    expect(c.db.writes).toBe(1);
  });
});
