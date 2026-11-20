import { afterEach, describe, expect, it } from "vitest";
import worker, { runScheduled } from "../src/index";
import { setLogSink } from "../src/log";
import { CARD_TTL_S } from "../src/miniapp/cards";
import { flushMetrics, isValidKey } from "../src/metrics";
import { calcTemplate, housekeeping } from "../src/templates/calc";
import { parseCalcConfig } from "../src/templates/calc/config";
import type { AppConfig } from "../src/env";
import { ADMIN_TOKEN, BOT_ID, BOT_TOKEN, FakeCtx, MapCache, SqliteDb, dayOfSec, initDataFor, makePng } from "./p5-helpers";
import { TEST_KEY } from "./helpers";

afterEach(() => setLogSink(null));

const NOW = 1_763_726_400; // 2025-11-21 12:00 UTC
const DAY = dayOfSec(NOW);
const DAY_START = NOW - (NOW % 86_400);
const APP: AppConfig = { appEnv: "local", publicBaseUrl: "https://example.test", logLevel: "info", initDataMaxAgeS: 3600, defaultLang: "en" };

const failingFetch = (async () => {
  throw new Error("network down");
}) as unknown as typeof fetch;

const deps = (db: SqliteDb, botId = "tezcalc", now = NOW) => ({
  botId,
  config: parseCalcConfig({}),
  db,
  appConfig: APP,
  now: () => now,
  fetchFn: failingFetch,
});

const env = (db: SqliteDb) => ({ DB: db as unknown as D1Database, TOKEN_KEY: TEST_KEY, ADMIN_TOKEN, PUBLIC_BASE_URL: "https://example.test" }) as never;

const user = (db: SqliteDb, bot: string, id: number, updated: number | null) =>
  db.exec("INSERT OR REPLACE INTO users (bot_id, user_id, created_at, updated_at) VALUES (?, ?, 1, ?)", bot, id, updated);
const card = (db: SqliteDb, id: string, at: number) =>
  db.exec("INSERT INTO cards (id, bot_id, user_id, png, created_at) VALUES (?, 'tezcalc', 1, x'00', ?)", id, at);
const cardIds = (db: SqliteDb) => db.rows<{ id: string }>("SELECT id FROM cards ORDER BY id").map((r) => r.id);

describe("scheduled(): card purge", () => {
  it("removes cards older than 72 hours and keeps newer ones", async () => {
    const db = new SqliteDb();
    card(db, "old", NOW - CARD_TTL_S - 60);
    card(db, "fresh", NOW - 3600);
    await calcTemplate.scheduled!(env(db), deps(db));
    expect(cardIds(db)).toEqual(["fresh"]);
  });

  it("runs even though the FX refresh failed (a dead network does not stop housekeeping)", async () => {
    const db = new SqliteDb();
    card(db, "old", NOW - 10 * CARD_TTL_S);
    await expect(calcTemplate.scheduled!(env(db), deps(db))).resolves.toBeUndefined();
    expect(cardIds(db)).toEqual([]);
  });

  it("is safe to run every hour", async () => {
    const db = new SqliteDb();
    card(db, "x", NOW);
    for (let i = 0; i < 3; i++) await calcTemplate.scheduled!(env(db), deps(db, "tezcalc", NOW + i * 3600));
    expect(cardIds(db)).toEqual(["x"]);
  });

  it("deletes the card once it has aged out, on a later run", async () => {
    const db = new SqliteDb();
    card(db, "x", NOW);
    await calcTemplate.scheduled!(env(db), deps(db, "tezcalc", NOW + CARD_TTL_S));
    expect(cardIds(db)).toEqual(["x"]); // exactly 72 h: still valid
    await calcTemplate.scheduled!(env(db), deps(db, "tezcalc", NOW + CARD_TTL_S + 3600));
    expect(cardIds(db)).toEqual([]);
  });
});

describe("scheduled(): daily active users (`au`)", () => {
  it("counts the bot's users touched since 00:00 UTC and stores it under today's `au`", async () => {
    const db = new SqliteDb();
    user(db, "tezcalc", 1, DAY_START);
    user(db, "tezcalc", 2, NOW - 100);
    user(db, "tezcalc", 3, DAY_START - 1);
    user(db, "tezcalc", 4, null);
    user(db, "other", 5, NOW - 100);
    await housekeeping(deps(db));
    expect(db.metric(DAY, "tezcalc", "au")).toBe(2);
    expect(db.metric(DAY, "other", "au")).toBeNull();
  });

  it("the hourly repeat is idempotent (SET, not ADD)", async () => {
    const db = new SqliteDb();
    user(db, "tezcalc", 1, NOW - 100);
    await housekeeping(deps(db));
    await housekeeping(deps(db));
    await housekeeping(deps(db));
    expect(db.metric(DAY, "tezcalc", "au")).toBe(1);
    user(db, "tezcalc", 2, NOW - 50);
    await housekeeping(deps(db));
    expect(db.metric(DAY, "tezcalc", "au")).toBe(2);
  });

  it("each calc bot gets its own row", async () => {
    const db = new SqliteDb();
    user(db, "a", 1, NOW - 10);
    user(db, "b", 1, NOW - 10);
    user(db, "b", 2, NOW - 10);
    await housekeeping(deps(db, "a"));
    await housekeeping(deps(db, "b"));
    expect(db.metric(DAY, "a", "au")).toBe(1);
    expect(db.metric(DAY, "b", "au")).toBe(2);
  });

  it("a new UTC day starts a new row and leaves yesterday's final value alone", async () => {
    const db = new SqliteDb();
    user(db, "tezcalc", 1, NOW - 10);
    await housekeeping(deps(db));
    const next = DAY_START + 86_400 + 3600;
    await housekeeping(deps(db, "tezcalc", next));
    expect(db.metric(DAY, "tezcalc", "au")).toBe(1);
    expect(db.metric(dayOfSec(next), "tezcalc", "au")).toBe(0);
  });

  it("a bot with no users writes 0 (the day is recorded)", async () => {
    const db = new SqliteDb();
    await housekeeping(deps(db));
    expect(db.metric(DAY, "tezcalc", "au")).toBe(0);
  });

  it("stores only a count: no user id in the table", async () => {
    const db = new SqliteDb();
    user(db, "tezcalc", 987654, NOW - 10);
    await housekeeping(deps(db));
    expect(JSON.stringify(db.rows("SELECT * FROM metrics_daily"))).not.toContain("987654");
  });
});

describe("scheduled(): failure isolation", () => {
  it("a failing card purge does not stop `au`, and logs a warning", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const db = new SqliteDb();
    user(db, "tezcalc", 1, NOW - 10);
    db.failOn = /DELETE FROM cards/;
    await expect(housekeeping(deps(db))).resolves.toBeUndefined();
    expect(db.metric(DAY, "tezcalc", "au")).toBe(1);
    expect(lines.some((l) => l.includes("card purge failed"))).toBe(true);
  });

  it("a failing `au` does not stop the purge", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const db = new SqliteDb();
    card(db, "old", NOW - 10 * CARD_TTL_S);
    db.failOn = /FROM users/;
    await expect(housekeeping(deps(db))).resolves.toBeUndefined();
    expect(cardIds(db)).toEqual([]);
    expect(lines.some((l) => l.includes("active-user counter failed"))).toBe(true);
  });

  it("with the whole D1 down, scheduled() still resolves", async () => {
    const db = new SqliteDb();
    db.failOn = /./;
    await expect(calcTemplate.scheduled!(env(db), deps(db))).resolves.toBeUndefined();
  });
});

describe("runScheduled(): the hourly job end to end", () => {
  it("runs housekeeping for every enabled calc bot and flushes this isolate's counters", async () => {
    const db = new SqliteDb();
    await db.addBot("tezcalc");
    await db.addBot("second");
    await db.addBot("off", {}, 0);
    user(db, "tezcalc", 1, NOW - 10);
    user(db, "second", 1, NOW - 10);
    user(db, "off", 1, NOW - 10);
    card(db, "old", NOW - 10 * CARD_TTL_S);
    const r = await runScheduled(env(db), { db, appConfig: APP, now: () => NOW, fetchFn: failingFetch });
    expect(r).toEqual({ ran: 2, failed: 0 });
    expect(db.metric(DAY, "tezcalc", "au")).toBe(1);
    expect(db.metric(DAY, "second", "au")).toBe(1);
    expect(db.metric(DAY, "off", "au")).toBeNull();
    expect(cardIds(db)).toEqual([]);
  });
});

describe("end to end: nothing identifying ever reaches metrics_daily", () => {
  it("after real API traffic by several users, cards and views, the table holds whitelisted keys and counts only", async () => {
    const db = new SqliteDb();
    await db.addBot();
    const e = env(db);
    const ctx = new FakeCtx() as unknown as ExecutionContext;
    const cache = new MapCache();
    (globalThis as unknown as { caches: unknown }).caches = { default: cache };
    const realNow = Date.now;
    Date.now = () => NOW * 1000;
    try {
      const ids = [4242, 777, 99001];
      for (const id of ids) {
        const initData = initDataFor(BOT_TOKEN, { id, first_name: "Aziz" + id, username: "u" + id }, NOW);
        const h = { authorization: `tma ${initData}` };
        await worker.fetch(
          new Request(`https://example.test/api/app/${BOT_ID}/settings`, {
            method: "POST",
            headers: { ...h, "content-type": "application/json" },
            body: JSON.stringify({ style: "glass", lang: "ru" }),
          }),
          e,
          ctx,
        );
        await worker.fetch(new Request(`https://example.test/api/app/${BOT_ID}/me`, { headers: h }), e, ctx);
        const c = await worker.fetch(
          new Request(`https://example.test/api/app/${BOT_ID}/card`, { method: "POST", headers: { ...h, "content-type": "image/png" }, body: makePng() }),
          e,
          ctx,
        );
        const j = (await c.json()) as { id: string };
        await worker.fetch(new Request(`https://example.test/card/${j.id}.png`), e, ctx);
      }
      await flushMetrics(db);
      await housekeeping(deps(db));
    } finally {
      Date.now = realNow;
      delete (globalThis as unknown as { caches?: unknown }).caches;
    }
    const rows = db.rows<{ day: string; bot_id: string; key: string; n: number }>("SELECT * FROM metrics_daily");
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) {
      expect(r.key === "au" || isValidKey(r.key), r.key).toBe(true);
      expect(Number.isInteger(r.n) && r.n >= 0).toBe(true);
      expect(r.bot_id).toMatch(/^(?:-|tezcalc)$/);
      expect(r.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const dump = JSON.stringify(rows);
    for (const secret of ["4242", "777", "99001", "Aziz", "username", BOT_TOKEN, "hash", "AAH"]) {
      expect(dump, secret).not.toContain(secret);
    }
    const keys = new Set(rows.map((r) => r.key));
    for (const k of ["req", "app:open", "card:create", "card:view", "lang:ru", "style:glass", "au"]) expect(keys.has(k), k).toBe(true);
    expect(db.metric(DAY, "tezcalc", "card:create") ?? db.metric(DAY, "-", "card:create")).toBe(3);
  });
});
