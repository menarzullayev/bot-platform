import { afterEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db";
import { setLogSink } from "../src/log";
import {
  FLUSH_AGE_MS,
  FLUSH_EVENTS,
  FLUSH_RETRY_MS,
  MAX_PENDING_KEYS,
  PLATFORM_BOT,
  activeUsersSince,
  count,
  dayOf,
  dayStartSec,
  flushIfDue,
  flushMetrics,
  isDue,
  isValidBotId,
  isValidKey,
  pendingEvents,
  pendingSum,
  readRange,
  resetMetrics,
  setMetric,
} from "../src/metrics";
import { FakeCtx, SqliteDb } from "./p5-helpers";

afterEach(() => setLogSink(null));

const T0 = Date.UTC(2026, 10, 21, 12, 0, 0); // 2026-11-21 12:00 UTC
const DAY = "2026-11-21";

const VALID_KEYS = [
  "req",
  "app:open",
  "f:calc",
  "f:convert",
  "f:loan",
  "f:vat",
  "f:inline",
  "f:guest",
  "f:solve",
  "f:derive",
  "f:integrate",
  "style:tactile",
  "style:glass",
  "style:fintech",
  "style:techno",
  "style:my_new-style2",
  "lang:uz-latn",
  "lang:uz-cyrl",
  "lang:ru",
  "lang:en",
  "lang:tr",
  "lang:ar",
  "lang:es",
  "pro:view",
  "pro:buy",
  "card:create",
  "card:view",
];

const INVALID_KEYS = [
  "",
  "au", // written absolutely by the cron, never counted
  "user:4242",
  "u:123456789",
  "uid:4242",
  "lang:4242",
  "style:12345",
  "style:",
  "style:Tactile", // upper case is not a style id
  "style:a b",
  "f:calc:4242",
  "f:unknown",
  "f:",
  "req ",
  " req",
  "req\n",
  "REQ",
  "card:delete",
  "pro:refund",
  "lang:uz_latn",
  "lang:u",
  "lang:uz-latn-extra-long-subtag",
  "expr:2+2",
  "text:hello",
  "1+1",
  "tma query_id=AAH",
  "a".repeat(200),
  "style:" + "a".repeat(40),
  "req\u0000x",
  "f:calc\n",
];

describe("key whitelist", () => {
  it.each(VALID_KEYS)("accepts %s", (k) => {
    expect(isValidKey(k)).toBe(true);
  });
  it.each(INVALID_KEYS)("rejects %j", (k) => {
    expect(isValidKey(k)).toBe(false);
  });
  it("rejects non-strings", () => {
    for (const v of [undefined, null, 5, {}, [], true]) expect(isValidKey(v)).toBe(false);
  });
  it.each(["tezcalc", "b1", "a-b_c", "-", "x".repeat(32)])("accepts bot id %s", (b) => {
    expect(isValidBotId(b)).toBe(true);
  });
  it.each(["", "x".repeat(33), "a b", "a:b", "ä", "../x", "a\nb", "1234:abc"])("rejects bot id %j", (b) => {
    expect(isValidBotId(b)).toBe(false);
  });
});

describe("count()", () => {
  it("accumulates in memory and writes nothing to D1", () => {
    const db = new SqliteDb();
    for (let i = 0; i < 10; i++) expect(count(db, "b", "req", 1, { nowMs: T0 })).toBe(true);
    expect(pendingEvents(db)).toBe(10);
    expect(pendingSum(db, DAY, "req")).toBe(10);
    expect(db.reads + db.writes).toBe(0);
  });

  it.each(INVALID_KEYS)("ignores the invalid key %j", (k) => {
    const db = new SqliteDb();
    expect(count(db, "b", k, 1, { nowMs: T0 })).toBe(false);
    expect(pendingEvents(db)).toBe(0);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 1_000_001, Number.MAX_SAFE_INTEGER + 2])("ignores n = %s", (n) => {
    const db = new SqliteDb();
    expect(count(db, "b", "req", n, { nowMs: T0 })).toBe(false);
    expect(pendingEvents(db)).toBe(0);
  });

  it("ignores a bad bot id", () => {
    const db = new SqliteDb();
    expect(count(db, "a b", "req", 1, { nowMs: T0 })).toBe(false);
    expect(count(db, "", "req", 1, { nowMs: T0 })).toBe(false);
  });

  it("n > 1 counts n events", () => {
    const db = new SqliteDb();
    count(db, "b", "req", 7, { nowMs: T0 });
    expect(pendingEvents(db)).toBe(7);
    expect(pendingSum(db, DAY, "req")).toBe(7);
  });

  it("keys are per (day, bot, key)", async () => {
    const db = new SqliteDb();
    count(db, "a", "req", 1, { nowMs: T0 });
    count(db, "b", "req", 2, { nowMs: T0 });
    count(db, "a", "f:calc", 3, { nowMs: T0 });
    count(db, "a", "req", 4, { nowMs: T0 + 86_400_000 });
    expect(await flushMetrics(db, T0)).toBe(4);
    expect(db.metric(DAY, "a", "req")).toBe(1);
    expect(db.metric(DAY, "b", "req")).toBe(2);
    expect(db.metric(DAY, "a", "f:calc")).toBe(3);
    expect(db.metric("2026-11-22", "a", "req")).toBe(4);
  });

  it("the UTC day rolls over at 00:00 UTC", () => {
    expect(dayOf(Date.UTC(2026, 10, 21, 23, 59, 59))).toBe("2026-11-21");
    expect(dayOf(Date.UTC(2026, 10, 22, 0, 0, 0))).toBe("2026-11-22");
    expect(dayStartSec(Date.UTC(2026, 10, 21, 23, 59, 59))).toBe(Date.UTC(2026, 10, 21) / 1000);
  });

  it("is bounded: new keys beyond MAX_PENDING_KEYS are dropped, existing keys keep counting", () => {
    const db = new SqliteDb();
    // distinct styles are the only open-ended key dimension
    let accepted = 0;
    for (let i = 0; i < MAX_PENDING_KEYS + 50; i++) if (count(db, "b", `style:s${i}`, 1, { nowMs: T0 })) accepted++;
    expect(accepted).toBe(MAX_PENDING_KEYS);
    expect(count(db, "b", "style:s0", 1, { nowMs: T0 })).toBe(true);
  });

  it("with ctx it schedules a due flush through waitUntil", async () => {
    const db = new SqliteDb();
    const ctx = new FakeCtx();
    for (let i = 0; i < FLUSH_EVENTS; i++) count(db, "b", "req", 1, { nowMs: T0, ctx });
    expect(ctx.promises).toHaveLength(1);
    await ctx.settle();
    expect(db.metric(DAY, "b", "req")).toBe(FLUSH_EVENTS);
  });
});

describe("flush rules", () => {
  it("is not due below 25 events and under 60 s", () => {
    const db = new SqliteDb();
    for (let i = 0; i < FLUSH_EVENTS - 1; i++) count(db, "b", "req", 1, { nowMs: T0 });
    expect(isDue(db, T0)).toBe(false);
    expect(isDue(db, T0 + FLUSH_AGE_MS - 1)).toBe(false);
    expect(flushIfDue(db, T0 + 1000)).toBeNull();
  });

  it("is due at exactly 25 events", () => {
    const db = new SqliteDb();
    for (let i = 0; i < FLUSH_EVENTS; i++) count(db, "b", "req", 1, { nowMs: T0 });
    expect(isDue(db, T0)).toBe(true);
  });

  it("is due when the oldest pending event is 60 s old, even for 1 event", () => {
    const db = new SqliteDb();
    count(db, "b", "req", 1, { nowMs: T0 });
    expect(isDue(db, T0 + FLUSH_AGE_MS)).toBe(true);
  });

  it("the age counts from the OLDEST event, not the newest", () => {
    const db = new SqliteDb();
    count(db, "b", "req", 1, { nowMs: T0 });
    count(db, "b", "req", 1, { nowMs: T0 + 59_000 });
    expect(isDue(db, T0 + 60_000)).toBe(true);
  });

  it("nothing pending is never due", () => {
    const db = new SqliteDb();
    expect(isDue(db, T0 + 10 * FLUSH_AGE_MS)).toBe(false);
  });

  it("25 events of one key become ONE upsert", async () => {
    const db = new SqliteDb();
    for (let i = 0; i < 25; i++) count(db, "b", "req", 1, { nowMs: T0 });
    db.resetCounters();
    const p = flushIfDue(db, T0);
    expect(p).not.toBeNull();
    expect(await p).toBe(1);
    expect(db.writes).toBe(1);
    expect(db.metric(DAY, "b", "req")).toBe(25);
  });

  it("ON CONFLICT adds to the stored value", async () => {
    const db = new SqliteDb();
    count(db, "b", "req", 5, { nowMs: T0 });
    await flushMetrics(db, T0);
    count(db, "b", "req", 7, { nowMs: T0 });
    await flushMetrics(db, T0);
    expect(db.metric(DAY, "b", "req")).toBe(12);
  });

  it("uses D1 batch when the binding has one", async () => {
    const db = new SqliteDb({ withBatch: true });
    count(db, "b", "req", 1, { nowMs: T0 });
    count(db, "b", "f:calc", 1, { nowMs: T0 });
    count(db, "b", "app:open", 1, { nowMs: T0 });
    await flushMetrics(db, T0);
    expect(db.batches).toBe(1);
    expect(db.metric(DAY, "b", "app:open")).toBe(1);
  });

  it("chunks very large flushes into batches of at most 50 statements", async () => {
    const db = new SqliteDb({ withBatch: true });
    for (let i = 0; i < 120; i++) count(db, "b", `style:s${i}`, 1, { nowMs: T0 });
    expect(await flushMetrics(db, T0)).toBe(120);
    expect(db.batches).toBe(3);
  });

  it("falls back to sequential statements without batch", async () => {
    const db = new SqliteDb({ withBatch: false });
    count(db, "b", "req", 1, { nowMs: T0 });
    count(db, "b", "f:calc", 1, { nowMs: T0 });
    expect(await flushMetrics(db, T0)).toBe(2);
    expect(db.batches).toBe(0);
  });

  it("an empty flush writes nothing", async () => {
    const db = new SqliteDb();
    expect(await flushMetrics(db, T0)).toBe(0);
    expect(db.writes).toBe(0);
  });

  it("clears the pending state after a successful flush", async () => {
    const db = new SqliteDb();
    count(db, "b", "req", 3, { nowMs: T0 });
    await flushMetrics(db, T0);
    expect(pendingEvents(db)).toBe(0);
    expect(pendingSum(db, DAY, "req")).toBe(0);
    expect(isDue(db, T0 + 10 * FLUSH_AGE_MS)).toBe(false);
  });

  it("while a flush is running its counts are still visible to pendingSum and new events are kept", async () => {
    const db = new SqliteDb();
    count(db, "b", "req", 4, { nowMs: T0 });
    const p = flushMetrics(db, T0);
    expect(pendingSum(db, DAY, "req")).toBe(4); // in flight
    count(db, "b", "req", 2, { nowMs: T0 });
    expect(pendingSum(db, DAY, "req")).toBe(6);
    await p;
    expect(db.metric(DAY, "b", "req")).toBe(4);
    expect(pendingSum(db, DAY, "req")).toBe(2);
    await flushMetrics(db, T0);
    expect(db.metric(DAY, "b", "req")).toBe(6);
  });

  it("a second flush while one runs returns the same promise (no double write)", async () => {
    const db = new SqliteDb();
    count(db, "b", "req", 4, { nowMs: T0 });
    const a = flushMetrics(db, T0);
    const b = flushMetrics(db, T0);
    expect(a).toBe(b);
    await a;
    expect(db.metric(DAY, "b", "req")).toBe(4);
  });

  it("flushIfDue does not start a second flush while one is in flight", async () => {
    const db = new SqliteDb();
    for (let i = 0; i < 30; i++) count(db, "b", "req", 1, { nowMs: T0 });
    const p = flushIfDue(db, T0);
    for (let i = 0; i < 30; i++) count(db, "b", "req", 1, { nowMs: T0 });
    expect(flushIfDue(db, T0)).toBeNull();
    await p;
  });
});

describe("failure handling", () => {
  it("a failed flush keeps the counts, logs a warning and does not throw", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const db = new SqliteDb();
    count(db, "b", "req", 9, { nowMs: T0 });
    db.failOn = /INSERT INTO metrics_daily/;
    await expect(flushMetrics(db, T0)).resolves.toBe(0);
    expect(pendingEvents(db)).toBe(9);
    expect(pendingSum(db, DAY, "req")).toBe(9);
    expect(lines.some((l) => l.includes("metrics: flush failed"))).toBe(true);
  });

  it("retries are postponed for FLUSH_RETRY_MS, then succeed and nothing is lost or doubled", async () => {
    const db = new SqliteDb();
    for (let i = 0; i < 30; i++) count(db, "b", "req", 1, { nowMs: T0 });
    db.failOn = /INSERT INTO metrics_daily/;
    await flushMetrics(db, T0);
    expect(isDue(db, T0 + FLUSH_RETRY_MS - 1)).toBe(false);
    db.failOn = null;
    expect(isDue(db, T0 + FLUSH_RETRY_MS)).toBe(true);
    await flushMetrics(db, T0 + FLUSH_RETRY_MS);
    expect(db.metric(DAY, "b", "req")).toBe(30);
  });

  it("events that arrive while a failing flush runs are merged with the restored ones", async () => {
    const db = new SqliteDb();
    count(db, "b", "req", 3, { nowMs: T0 });
    db.failOn = /INSERT INTO metrics_daily/;
    const p = flushMetrics(db, T0);
    count(db, "b", "req", 2, { nowMs: T0 });
    await p;
    expect(pendingSum(db, DAY, "req")).toBe(5);
    db.failOn = null;
    await flushMetrics(db, T0);
    expect(db.metric(DAY, "b", "req")).toBe(5);
  });

  it("a prepare() that throws synchronously still releases the in-flight flag", async () => {
    const bad: Db = {
      prepare() {
        throw new Error("boom");
      },
    };
    count(bad, "b", "req", 1, { nowMs: T0 });
    await expect(flushMetrics(bad, T0)).resolves.toBe(0);
    // not stuck: a later attempt runs again (after the retry delay) instead of returning a stale promise
    const again = flushMetrics(bad, T0 + FLUSH_RETRY_MS);
    await expect(again).resolves.toBe(0);
    expect(pendingEvents(bad)).toBe(1);
  });

  it("a D1 outage never turns into unbounded memory: keys stay capped", async () => {
    const db = new SqliteDb();
    db.failOn = /INSERT INTO metrics_daily/;
    for (let i = 0; i < MAX_PENDING_KEYS + 30; i++) count(db, "b", `style:s${i}`, 1, { nowMs: T0 });
    await flushMetrics(db, T0);
    for (let i = 0; i < 30; i++) count(db, "b", `style:t${i}`, 1, { nowMs: T0 });
    expect(pendingEvents(db)).toBeLessThanOrEqual(MAX_PENDING_KEYS + 30);
  });

  it("resetMetrics forgets everything", () => {
    const db = new SqliteDb();
    count(db, "b", "req", 3, { nowMs: T0 });
    resetMetrics(db);
    expect(pendingEvents(db)).toBe(0);
  });
});

describe("setMetric / au", () => {
  it("overwrites with an absolute value (idempotent)", async () => {
    const db = new SqliteDb();
    await setMetric(db, DAY, "b", "au", 5);
    await setMetric(db, DAY, "b", "au", 5);
    await setMetric(db, DAY, "b", "au", 8);
    expect(db.metric(DAY, "b", "au")).toBe(8);
  });

  it.each([
    ["bad day", "2026-1-1", "b", "au", 1],
    ["bad bot", DAY, "a b", "au", 1],
    ["bad key", DAY, "b", "user:1", 1],
    ["negative", DAY, "b", "au", -1],
    ["fraction", DAY, "b", "au", 1.5],
  ])("rejects %s", async (_n, day, bot, key, n) => {
    const db = new SqliteDb();
    await expect(setMetric(db, day as string, bot as string, key as string, n as number)).rejects.toThrow();
  });

  it("activeUsersSince counts this bot's users updated since the timestamp", async () => {
    const db = new SqliteDb();
    const ins = (bot: string, user: number, at: number | null) =>
      db.exec("INSERT INTO users (bot_id, user_id, created_at, updated_at) VALUES (?, ?, 1, ?)", bot, user, at);
    ins("b", 1, 1000);
    ins("b", 2, 999);
    ins("b", 3, 5000);
    ins("b", 4, null);
    ins("other", 5, 5000);
    expect(await activeUsersSince(db, "b", 1000)).toBe(2);
    expect(await activeUsersSince(db, "b", 10_000)).toBe(0);
    expect(await activeUsersSince(db, "none", 0)).toBe(0);
  });
});

describe("readRange", () => {
  it("returns inclusive days, optionally one bot, ordered", async () => {
    const db = new SqliteDb();
    for (const [d, b, k, n] of [
      ["2026-11-19", "a", "req", 1],
      ["2026-11-20", "a", "req", 2],
      ["2026-11-20", "b", "req", 3],
      ["2026-11-21", "a", "f:calc", 4],
      ["2026-11-22", "a", "req", 5],
    ] as const) {
      db.exec("INSERT INTO metrics_daily (day, bot_id, key, n) VALUES (?, ?, ?, ?)", d, b, k, n);
    }
    const all = await readRange(db, "2026-11-20", "2026-11-21");
    expect(all.map((r) => `${r.day}/${r.bot_id}/${r.key}/${r.n}`)).toEqual([
      "2026-11-20/a/req/2",
      "2026-11-20/b/req/3",
      "2026-11-21/a/f:calc/4",
    ]);
    const onlyB = await readRange(db, "2026-11-19", "2026-11-22", "b");
    expect(onlyB).toEqual([{ day: "2026-11-20", bot_id: "b", key: "req", n: 3 }]);
  });
});

describe("anonymity", () => {
  it("whatever is thrown at count(), the table only ever holds whitelisted keys and plain counts", async () => {
    const db = new SqliteDb();
    const hostile = [...INVALID_KEYS, "user:4242", "4242", "id=4242", "first_name=Test", "987654321:AAFakeToken"];
    for (const k of hostile) for (const bot of ["tezcalc", "-", "4242"]) count(db, bot, k, 1, { nowMs: T0 });
    for (const k of VALID_KEYS) count(db, "tezcalc", k, 1, { nowMs: T0 });
    await flushMetrics(db, T0);
    const rows = db.rows<{ day: string; bot_id: string; key: string; n: number }>("SELECT * FROM metrics_daily");
    expect(rows).toHaveLength(VALID_KEYS.length);
    for (const r of rows) {
      expect(isValidKey(r.key)).toBe(true);
      expect(Object.keys(r).sort()).toEqual(["bot_id", "day", "key", "n"]);
      expect(r.n).toBe(1);
    }
  });

  it("the platform bot placeholder is a legal bot id", () => {
    expect(isValidBotId(PLATFORM_BOT)).toBe(true);
  });
});
