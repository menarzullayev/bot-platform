import { afterEach, describe, expect, it } from "vitest";
import { handleAdmin } from "../src/admin";
import type { AppConfig } from "../src/env";
import { setLogSink } from "../src/log";
import { count } from "../src/metrics";
import { ADMIN, makeEnv } from "./helpers";
import { SqliteDb, dayOfSec } from "./p5-helpers";

afterEach(() => setLogSink(null));

const NOW = 1_763_726_400; // 2025-11-21 12:00 UTC
const DAY = dayOfSec(NOW);
const dayMinus = (n: number) => dayOfSec(NOW - n * 86_400);

const call = (db: SqliteDb, path: string, o: { auth?: string | null; method?: string; appConfig?: AppConfig } = {}) =>
  handleAdmin(
    new Request("https://example.test" + path, {
      method: o.method ?? "GET",
      headers: o.auth === null ? {} : { authorization: o.auth ?? `Bearer ${ADMIN}` },
    }),
    makeEnv(),
    { db, now: () => NOW, appConfig: o.appConfig },
  );

const put = (db: SqliteDb, day: string, bot: string, key: string, n: number) =>
  db.exec("INSERT OR REPLACE INTO metrics_daily (day, bot_id, key, n) VALUES (?, ?, ?, ?)", day, bot, key, n);

async function bots(db: SqliteDb) {
  await db.addBot("a");
  await db.addBot("b", {}, 0);
}

describe("GET /admin/stats", () => {
  it("requires the admin token", async () => {
    const db = new SqliteDb();
    expect((await call(db, "/admin/stats", { auth: null })).status).toBe(401);
    expect((await call(db, "/admin/stats", { auth: "Bearer nope" })).status).toBe(401);
  });

  it("keeps the old fields and adds today's counters", async () => {
    const db = new SqliteDb();
    await bots(db);
    db.exec("INSERT INTO bot_users (bot_id, user_id, first_seen) VALUES ('a', 1, 1), ('a', 2, 1)");
    put(db, DAY, "a", "req", 120);
    put(db, DAY, "a", "f:calc", 30);
    put(db, DAY, "b", "req", 5);
    const j = (await (await call(db, "/admin/stats")).json()) as Record<string, unknown>;
    expect(j).toMatchObject({ bots: 2, enabled: 1, users: { a: 2, b: 0 } });
    expect(j.today).toEqual({
      day: DAY,
      degraded: 0,
      counters: { req: 125, "f:calc": 30 },
      bots: { a: { req: 120, "f:calc": 30 }, b: { req: 5 } },
    });
  });

  it("includes what this isolate has counted but not yet flushed", async () => {
    const db = new SqliteDb();
    put(db, DAY, "a", "req", 10);
    count(db, "a", "req", 7, { nowMs: NOW * 1000 });
    count(db, "a", "app:open", 2, { nowMs: NOW * 1000 });
    const j = (await (await call(db, "/admin/stats")).json()) as { today: { counters: Record<string, number> } };
    expect(j.today.counters).toEqual({ req: 17, "app:open": 2 });
  });

  it("only today: yesterday and tomorrow rows are excluded", async () => {
    const db = new SqliteDb();
    put(db, dayMinus(1), "a", "req", 999);
    put(db, dayMinus(-1), "a", "req", 888);
    put(db, DAY, "a", "req", 1);
    const j = (await (await call(db, "/admin/stats")).json()) as { today: { counters: Record<string, number> } };
    expect(j.today.counters).toEqual({ req: 1 });
  });

  it("an empty day is an empty object, not an error", async () => {
    const db = new SqliteDb();
    const j = (await (await call(db, "/admin/stats")).json()) as { today: unknown };
    expect(j.today).toEqual({ day: DAY, degraded: 0, counters: {}, bots: {} });
  });

  it.each([
    [69_999, 0],
    [70_000, 1],
    [90_000, 2],
  ])("reports the degradation level (%i -> %i)", async (n, lvl) => {
    const db = new SqliteDb();
    put(db, DAY, "a", "req", n);
    const j = (await (await call(db, "/admin/stats")).json()) as { today: { degraded: number } };
    expect(j.today.degraded).toBe(lvl);
  });

  it("uses the configured thresholds", async () => {
    const db = new SqliteDb();
    put(db, DAY, "a", "req", 12);
    const appConfig = { appEnv: "local", publicBaseUrl: null, logLevel: "info", initDataMaxAgeS: 3600, defaultLang: "en", degradeL1: 10, degradeL2: 20 } as AppConfig;
    const j = (await (await call(db, "/admin/stats", { appConfig })).json()) as { today: { degraded: number } };
    expect(j.today.degraded).toBe(1);
  });

  it("a metrics outage does not break the stats call: `today` is simply absent", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const db = new SqliteDb();
    await bots(db);
    db.failOn = /metrics_daily/;
    const r = await call(db, "/admin/stats");
    expect(r.status).toBe(200);
    const j = (await r.json()) as Record<string, unknown>;
    expect(j).toMatchObject({ bots: 2 });
    expect(j).not.toHaveProperty("today");
    expect(lines.some((l) => l.includes("today's counters unavailable"))).toBe(true);
  });

  it("contains no user-level data", async () => {
    const db = new SqliteDb();
    put(db, DAY, "a", "req", 3);
    const t = await (await call(db, "/admin/stats")).text();
    expect(t).not.toMatch(/user_id|first_name|username/);
  });
});

describe("GET /admin/metrics", () => {
  it("requires the admin token", async () => {
    expect((await call(new SqliteDb(), "/admin/metrics", { auth: null })).status).toBe(401);
  });

  it("defaults to 7 days, oldest first, zero-filled", async () => {
    const db = new SqliteDb();
    put(db, DAY, "a", "req", 4);
    put(db, dayMinus(3), "a", "req", 2);
    const j = (await (await call(db, "/admin/metrics")).json()) as {
      from: string;
      to: string;
      bot: unknown;
      days: { day: string; counters: Record<string, number> }[];
    };
    expect(j.bot).toBeNull();
    expect(j.from).toBe(dayMinus(6));
    expect(j.to).toBe(DAY);
    expect(j.days.map((d) => d.day)).toEqual([6, 5, 4, 3, 2, 1, 0].map(dayMinus));
    expect(j.days.map((d) => d.counters)).toEqual([{}, {}, {}, { req: 2 }, {}, {}, { req: 4 }]);
  });

  it.each([1, 2, 7, 30, 90])("days=%i returns exactly that many entries", async (n) => {
    const db = new SqliteDb();
    const j = (await (await call(db, `/admin/metrics?days=${n}`)).json()) as { days: unknown[]; from: string };
    expect(j.days).toHaveLength(n);
    expect(j.from).toBe(dayMinus(n - 1));
  });

  it.each(["0", "91", "100", "999", "abc", "-1", "1.5", "", " 7", "7 ", "1e1", "0x5", "١٢"])("400 for days=%j", async (v) => {
    const r = await call(new SqliteDb(), `/admin/metrics?days=${encodeURIComponent(v)}`);
    expect(r.status).toBe(400);
    expect(await r.json()).toHaveProperty("error");
  });

  it("the window is inclusive of today and excludes older rows", async () => {
    const db = new SqliteDb();
    put(db, dayMinus(2), "a", "req", 100);
    put(db, dayMinus(1), "a", "req", 10);
    put(db, DAY, "a", "req", 1);
    const j = (await (await call(db, "/admin/metrics?days=2")).json()) as { days: { day: string; counters: Record<string, number> }[] };
    expect(j.days).toEqual([
      { day: dayMinus(1), counters: { req: 10 } },
      { day: DAY, counters: { req: 1 } },
    ]);
  });

  it("sums over bots by default and filters with bot=", async () => {
    const db = new SqliteDb();
    put(db, DAY, "a", "req", 4);
    put(db, DAY, "b", "req", 6);
    put(db, DAY, "b", "f:calc", 2);
    const all = (await (await call(db, "/admin/metrics?days=1")).json()) as { days: { counters: Record<string, number> }[] };
    expect(all.days[0].counters).toEqual({ req: 10, "f:calc": 2 });
    const onlyB = (await (await call(db, "/admin/metrics?days=1&bot=b")).json()) as { bot: string; days: { counters: Record<string, number> }[] };
    expect(onlyB.bot).toBe("b");
    expect(onlyB.days[0].counters).toEqual({ req: 6, "f:calc": 2 });
  });

  it("an unknown bot gives an all-zero table", async () => {
    const db = new SqliteDb();
    put(db, DAY, "a", "req", 4);
    const j = (await (await call(db, "/admin/metrics?days=3&bot=ghost")).json()) as { days: { counters: object }[] };
    expect(j.days.every((d) => Object.keys(d.counters).length === 0)).toBe(true);
  });

  it.each(["a b", "x".repeat(33), "../x", "a:b", ""])("400 for bot=%j", async (b) => {
    const r = await call(new SqliteDb(), `/admin/metrics?bot=${encodeURIComponent(b)}`);
    expect(r.status).toBe(400);
  });

  it("includes today's not-yet-flushed counters", async () => {
    const db = new SqliteDb();
    count(db, "a", "req", 3, { nowMs: NOW * 1000 });
    const j = (await (await call(db, "/admin/metrics?days=1")).json()) as { days: { counters: Record<string, number> }[] };
    expect(j.days[0].counters).toEqual({ req: 3 });
  });

  it("shows the cron's `au` value", async () => {
    const db = new SqliteDb();
    put(db, DAY, "a", "au", 17);
    const j = (await (await call(db, "/admin/metrics?days=1")).json()) as { days: { counters: Record<string, number> }[] };
    expect(j.days[0].counters.au).toBe(17);
  });

  it("a read failure is a 500 with a plain message", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const db = new SqliteDb();
    db.failOn = /SELECT day, bot_id/;
    const r = await call(db, "/admin/metrics");
    expect(r.status).toBe(500);
    expect(lines.some((l) => l.includes("metrics read failed"))).toBe(true);
  });

  it("is GET only", async () => {
    expect((await call(new SqliteDb(), "/admin/metrics", { method: "POST" })).status).toBe(404);
    expect((await call(new SqliteDb(), "/admin/metrics", { method: "DELETE" })).status).toBe(404);
  });

  it("returns JSON", async () => {
    const r = await call(new SqliteDb(), "/admin/metrics");
    expect(r.headers.get("content-type")).toBe("application/json");
  });

  it("is a single query (one D1 read for the whole table)", async () => {
    const db = new SqliteDb();
    db.resetCounters();
    await call(db, "/admin/metrics?days=30");
    expect(db.sqls.filter((s) => /FROM metrics_daily/.test(s))).toHaveLength(1);
  });
});
