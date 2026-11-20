import { afterEach, describe, expect, it } from "vitest";
import {
  CACHE_MS,
  getDegradation,
  levelFor,
  peekDegradation,
  refreshIfStale,
  resetDegradation,
  secondsUntilReset,
  thresholdsOf,
} from "../src/degrade";
import { DEFAULT_DEGRADE_L1, DEFAULT_DEGRADE_L2, validateEnv, type Env } from "../src/env";
import { setLogSink } from "../src/log";
import { count } from "../src/metrics";
import { addHistory } from "../src/templates/calc/store";
import { SqliteDb, dayOfSec } from "./p5-helpers";
import { TEST_KEY } from "./helpers";

afterEach(() => setLogSink(null));

const NOW = 1_763_726_400; // 2025-11-21 12:00:00 UTC
const DAY = dayOfSec(NOW);
const TH = { l1: 70_000, l2: 90_000 };

describe("levelFor", () => {
  it.each([
    [0, 0],
    [1, 0],
    [69_999, 0],
    [70_000, 1],
    [70_001, 1],
    [89_999, 1],
    [90_000, 2],
    [90_001, 2],
    [1_000_000, 2],
  ])("%i requests -> level %i with the defaults", (n, lvl) => {
    expect(levelFor(n, TH)).toBe(lvl);
  });

  it("uses the given thresholds", () => {
    expect(levelFor(9, { l1: 10, l2: 20 })).toBe(0);
    expect(levelFor(10, { l1: 10, l2: 20 })).toBe(1);
    expect(levelFor(20, { l1: 10, l2: 20 })).toBe(2);
  });

  it("thresholdsOf falls back to the documented defaults", () => {
    expect(DEFAULT_DEGRADE_L1).toBe(70_000);
    expect(DEFAULT_DEGRADE_L2).toBe(90_000);
    expect(thresholdsOf()).toEqual(TH);
    expect(thresholdsOf({})).toEqual(TH);
    expect(thresholdsOf({ degradeL1: 5 })).toEqual({ l1: 5, l2: 90_000 });
    expect(thresholdsOf({ degradeL1: 5, degradeL2: 8 })).toEqual({ l1: 5, l2: 8 });
  });
});

describe("getDegradation (D1 total + unflushed part)", () => {
  it.each([
    [0, 0],
    [69_999, 0],
    [70_000, 1],
    [89_999, 1],
    [90_000, 2],
  ])("D1 says %i requests today -> level %i", async (n, lvl) => {
    const db = new SqliteDb();
    db.setReq(DAY, n);
    expect(await getDegradation(db, NOW)).toBe(lvl);
  });

  it("sums req over every bot (and the platform bot)", async () => {
    const db = new SqliteDb();
    db.setReq(DAY, 40_000, "a");
    db.setReq(DAY, 20_000, "b");
    db.setReq(DAY, 10_000, "-");
    expect(await getDegradation(db, NOW)).toBe(1);
  });

  it("other keys and other days do not count", async () => {
    const db = new SqliteDb();
    db.exec("INSERT INTO metrics_daily (day, bot_id, key, n) VALUES (?, 'a', 'f:calc', 95000)", DAY);
    db.setReq(dayOfSec(NOW - 86_400), 95_000);
    expect(await getDegradation(db, NOW)).toBe(0);
  });

  it("adds the not-yet-flushed part of this isolate", async () => {
    const db = new SqliteDb();
    db.setReq(DAY, 69_990);
    expect(await getDegradation(db, NOW)).toBe(0);
    count(db, "tezcalc", "req", 10, { nowMs: NOW * 1000 });
    expect(peekDegradation(db, NOW)).toBe(1);
  });

  it("counts an in-flight flush so the level does not dip while it is being written", async () => {
    const db = new SqliteDb();
    count(db, "x", "req", 90_000, { nowMs: NOW * 1000 });
    expect(peekDegradation(db, NOW)).toBe(2);
  });

  it("honours custom thresholds", async () => {
    const db = new SqliteDb();
    db.setReq(DAY, 15);
    expect(await getDegradation(db, NOW, { degradeL1: 10, degradeL2: 20 })).toBe(1);
    db.setReq(DAY, 25);
    resetDegradation(db);
    expect(await getDegradation(db, NOW, { degradeL1: 10, degradeL2: 20 })).toBe(2);
  });

  it("an empty metrics table is level 0", async () => {
    expect(await getDegradation(new SqliteDb(), NOW)).toBe(0);
  });
});

describe("caching: at most one D1 read a minute per isolate", () => {
  it("answers from memory within 60 s", async () => {
    const db = new SqliteDb();
    db.setReq(DAY, 100);
    await getDegradation(db, NOW);
    db.resetCounters();
    for (let i = 0; i < 50; i++) await getDegradation(db, NOW + 30);
    expect(db.reads).toBe(0);
  });

  it("re-reads after CACHE_MS and sees the new total", async () => {
    const db = new SqliteDb();
    db.setReq(DAY, 100);
    expect(await getDegradation(db, NOW)).toBe(0);
    db.setReq(DAY, 80_000);
    expect(await getDegradation(db, NOW + CACHE_MS / 1000 - 1)).toBe(0); // still cached
    db.resetCounters();
    expect(await getDegradation(db, NOW + CACHE_MS / 1000)).toBe(1);
    expect(db.reads).toBe(1);
  });

  it("a new UTC day resets the level to 0 (counter back to zero at 00:00 UTC)", async () => {
    const db = new SqliteDb();
    const lastSecond = NOW - (NOW % 86_400) + 86_399;
    db.setReq(dayOfSec(lastSecond), 95_000);
    expect(await getDegradation(db, lastSecond)).toBe(2);
    expect(await getDegradation(db, lastSecond + 1)).toBe(0);
  });

  it("refreshIfStale is null when fresh and shared while loading (no stampede)", async () => {
    const db = new SqliteDb();
    const a = refreshIfStale(db, NOW);
    const b = refreshIfStale(db, NOW);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    await a;
    expect(refreshIfStale(db, NOW + 1)).toBeNull();
    expect(db.reads).toBe(1);
  });

  it("peekDegradation never reads D1", () => {
    const db = new SqliteDb();
    db.setReq(DAY, 99_000);
    expect(peekDegradation(db, NOW)).toBe(0); // unknown until a refresh happened: fail open
    expect(db.reads).toBe(0);
  });

  it("a clock that goes backwards triggers a refresh instead of trusting the cache", async () => {
    const db = new SqliteDb();
    await getDegradation(db, NOW);
    db.resetCounters();
    await getDegradation(db, NOW - 5);
    expect(db.reads).toBe(1);
  });
});

describe("D1 failure", () => {
  it("never throws and fails open on a cold isolate", async () => {
    const db = new SqliteDb();
    db.failOn = /metrics_daily/;
    await expect(getDegradation(db, NOW)).resolves.toBe(0);
  });

  it("keeps the last known total when a later refresh fails", async () => {
    const db = new SqliteDb();
    db.setReq(DAY, 95_000);
    expect(await getDegradation(db, NOW)).toBe(2);
    db.failOn = /metrics_daily/;
    expect(await getDegradation(db, NOW + 120)).toBe(2);
  });

  it("a failed read is not retried on every call (throttled like a success)", async () => {
    const db = new SqliteDb();
    db.failOn = /metrics_daily/;
    await getDegradation(db, NOW);
    db.resetCounters();
    for (let i = 0; i < 20; i++) await getDegradation(db, NOW + 1);
    expect(db.sqls).toHaveLength(0);
  });

  it("a failure on a new day does not carry yesterday's total over", async () => {
    const db = new SqliteDb();
    const lastSecond = NOW - (NOW % 86_400) + 86_399;
    db.setReq(dayOfSec(lastSecond), 95_000);
    expect(await getDegradation(db, lastSecond)).toBe(2);
    db.failOn = /metrics_daily/;
    expect(await getDegradation(db, lastSecond + 1)).toBe(0);
  });
});

describe("secondsUntilReset", () => {
  it("is the time to the next 00:00 UTC", () => {
    expect(secondsUntilReset(NOW - (NOW % 86_400))).toBe(86_400);
    expect(secondsUntilReset(NOW - (NOW % 86_400) + 86_399)).toBe(1);
    expect(secondsUntilReset(NOW)).toBe(86_400 - (NOW % 86_400));
  });
});

describe("level 2 turns the history write off (calc template)", () => {
  const add = (db: SqliteDb) => addHistory(db, "tezcalc", 7, "2+2", "4", NOW);
  const rows = (db: SqliteDb) => db.rows("SELECT * FROM history");

  it("level 0 and 1 write the history row", async () => {
    for (const n of [0, 70_000]) {
      const db = new SqliteDb();
      db.setReq(DAY, n);
      await getDegradation(db, NOW);
      await add(db);
      expect(rows(db)).toHaveLength(1);
    }
  });

  it("level 2 skips the write: no INSERT is even attempted", async () => {
    const db = new SqliteDb();
    db.setReq(DAY, 90_000);
    await getDegradation(db, NOW);
    db.resetCounters();
    await add(db);
    expect(rows(db)).toHaveLength(0);
    expect(db.writes).toBe(0);
  });

  it("the unflushed part alone can switch it off", async () => {
    const db = new SqliteDb();
    count(db, "tezcalc", "req", 90_000, { nowMs: NOW * 1000 });
    await add(db);
    expect(rows(db)).toHaveLength(0);
  });

  it("and it comes back when the level drops (new day)", async () => {
    const db = new SqliteDb();
    const lastSecond = NOW - (NOW % 86_400) + 86_399;
    db.setReq(dayOfSec(lastSecond), 95_000);
    await getDegradation(db, lastSecond);
    await addHistory(db, "tezcalc", 7, "1+1", "2", lastSecond);
    expect(rows(db)).toHaveLength(0);
    await addHistory(db, "tezcalc", 7, "1+1", "2", lastSecond + 1);
    expect(rows(db)).toHaveLength(1);
  });
});

describe("validateEnv: DEGRADE_L1 / DEGRADE_L2", () => {
  const base = (extra: Partial<Env> = {}): Partial<Env> => ({
    DB: {} as D1Database,
    TOKEN_KEY: TEST_KEY,
    ADMIN_TOKEN: "x".repeat(40),
    PUBLIC_BASE_URL: "https://example.test",
    ...extra,
  });

  it("defaults to 70000 / 90000 when absent", () => {
    const r = validateEnv(base());
    expect(r.ok && [r.config.degradeL1, r.config.degradeL2]).toEqual([70_000, 90_000]);
  });

  it("empty strings count as absent", () => {
    const r = validateEnv(base({ DEGRADE_L1: "", DEGRADE_L2: "" }));
    expect(r.ok && r.config.degradeL1).toBe(70_000);
  });

  it("accepts both set", () => {
    const r = validateEnv(base({ DEGRADE_L1: "50000", DEGRADE_L2: "80000" }));
    expect(r.ok && [r.config.degradeL1, r.config.degradeL2]).toEqual([50_000, 80_000]);
  });

  it("accepts one set when the order still holds", () => {
    const a = validateEnv(base({ DEGRADE_L1: "1000" }));
    expect(a.ok && a.config.degradeL2).toBe(90_000);
    const b = validateEnv(base({ DEGRADE_L2: "80000" }));
    expect(b.ok && b.config.degradeL1).toBe(70_000);
  });

  it.each(["0", "-5", "1.5", "abc", "1e5", " 5", "5 ", "0x10", "100000001", "99999999999999999999", "١٢٣"])("rejects DEGRADE_L1=%j", (v) => {
    const r = validateEnv(base({ DEGRADE_L1: v }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.startsWith("DEGRADE_L1"))).toBe(true);
  });

  it.each(["0", "-1", "x", "2.0"])("rejects DEGRADE_L2=%j", (v) => {
    const r = validateEnv(base({ DEGRADE_L2: v }));
    expect(r.ok).toBe(false);
  });

  it("requires L1 < L2", () => {
    expect(validateEnv(base({ DEGRADE_L1: "90000", DEGRADE_L2: "90000" })).ok).toBe(false);
    expect(validateEnv(base({ DEGRADE_L1: "95000" })).ok).toBe(false); // vs default L2
    expect(validateEnv(base({ DEGRADE_L2: "60000" })).ok).toBe(false); // vs default L1
  });

  it("an error names the variable but never echoes its value", () => {
    const r = validateEnv(base({ DEGRADE_L1: "secret-looking-value" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).not.toContain("secret-looking-value");
  });
});
