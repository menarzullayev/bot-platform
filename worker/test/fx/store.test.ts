import { describe, expect, it } from "vitest";
import { convertCurrency, Decimal, type FxRates } from "../../src/calc";
import { isStale, loadRates, saveRates } from "../../src/fx/store";
import { FxBatchDb, FxFakeDb } from "./fakedb";

const NOW = 1_800_000_000;

function table(n: number, base = "USD", updatedAt = NOW): FxRates {
  const rates: Record<string, string> = { [base]: "1" };
  for (let i = 0; i < n; i++) rates[String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + (Math.floor(i / 26) % 26)) + "X"] = `${i + 1}.5`;
  return { base, rates, updatedAt };
}

describe("saveRates / loadRates", () => {
  it("round trip", async () => {
    const db = new FxFakeDb();
    const t: FxRates = { base: "UZS", rates: { UZS: "1", USD: "0.0000835", EUR: "0.0000760" }, updatedAt: NOW };
    await saveRates(db, t, "cbu", NOW);
    const back = await loadRates(db);
    expect(back).toEqual({ ...t, source: "cbu" });
  });
  it("empty store gives null", async () => {
    expect(await loadRates(new FxFakeDb())).toBeNull();
  });
  it("chunks multi-row inserts under the 100 parameter limit", async () => {
    const db = new FxFakeDb();
    const t = table(120);
    await saveRates(db, t, "x", NOW);
    expect(db.maxParams).toBeLessThanOrEqual(100);
    expect(db.statements).toBeGreaterThan(3);
    const back = await loadRates(db);
    expect(Object.keys(back!.rates)).toHaveLength(Object.keys(t.rates).length);
  });
  it("uses D1 batch when available", async () => {
    const db = new FxBatchDb();
    await saveRates(db, table(40), "x", NOW);
    expect(db.batches).toBe(1);
    expect((await loadRates(db))?.base).toBe("USD");
  });
  it("overwrites old values and drops rows of another base", async () => {
    const db = new FxFakeDb();
    await saveRates(db, { base: "USD", rates: { USD: "1", UZS: "12000", EUR: "0.9" }, updatedAt: NOW }, "er", NOW);
    await saveRates(db, { base: "UZS", rates: { UZS: "1", USD: "0.0001" }, updatedAt: NOW + 10 }, "cbu", NOW + 10);
    const back = await loadRates(db);
    expect(back?.base).toBe("UZS");
    expect(back?.rates).toEqual({ UZS: "1", USD: "0.0001" });
    expect(back?.updatedAt).toBe(NOW + 10);
    await saveRates(db, { base: "UZS", rates: { UZS: "1", USD: "0.0002" }, updatedAt: NOW + 20 }, "cbu", NOW + 20);
    expect((await loadRates(db))?.rates.USD).toBe("0.0002");
  });
  it("loadRates picks the newest base when bases are mixed and skips bad rows", async () => {
    const db = new FxFakeDb();
    db.rows.set("USD/UZS", { base: "USD", quote: "UZS", rate: "12000", updated_at: 100, source: "er" });
    db.rows.set("UZS/USD", { base: "UZS", quote: "USD", rate: "0.0001", updated_at: 200, source: "cbu" });
    db.rows.set("UZS/EUR", { base: "UZS", quote: "EUR", rate: "garbage", updated_at: 200, source: "cbu" });
    db.rows.set("UZS/RUB", { base: "UZS", quote: "RUB", rate: "-1", updated_at: 200, source: "cbu" });
    const back = await loadRates(db);
    expect(back).toEqual({ base: "UZS", rates: { USD: "0.0001" }, updatedAt: 200, source: "cbu" });
  });
  it("a DB failure surfaces to the caller (not swallowed silently)", async () => {
    const db = new FxFakeDb();
    db.failNext = true;
    await expect(saveRates(db, table(3), "x", NOW)).rejects.toThrow("db down");
  });
  it("stored table converts like the original", async () => {
    const db = new FxFakeDb();
    await saveRates(db, { base: "USD", rates: { USD: "1", UZS: "12000" }, updatedAt: NOW }, "er", NOW);
    const back = (await loadRates(db)) as FxRates;
    expect(convertCurrency(Decimal.from(2), "USD", "UZS", back)?.toString()).toBe("24000");
  });
});

describe("isStale", () => {
  const t: FxRates = { base: "USD", rates: {}, updatedAt: NOW };
  it("fresh within 36 hours", () => {
    expect(isStale(t, NOW)).toBe(false);
    expect(isStale(t, NOW + 36 * 3600)).toBe(false);
  });
  it("stale after 36 hours", () => {
    expect(isStale(t, NOW + 36 * 3600 + 1)).toBe(true);
    expect(isStale(t, NOW + 3 * 86400)).toBe(true);
  });
  it("custom max age", () => {
    expect(isStale(t, NOW + 61, 60)).toBe(true);
    expect(isStale(t, NOW + 59, 60)).toBe(false);
  });
  it("clock skew (updatedAt in the future) is not stale; invalid values are", () => {
    expect(isStale({ ...t, updatedAt: NOW + 500 }, NOW)).toBe(false);
    expect(isStale({ ...t, updatedAt: Number.NaN }, NOW)).toBe(true);
    expect(isStale(t, Number.NaN)).toBe(true);
  });
});
