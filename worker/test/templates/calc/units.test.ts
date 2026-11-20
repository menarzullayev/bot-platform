import { describe, expect, it } from "vitest";
import { CalcError, Decimal } from "../../../src/calc";
import { DICTIONARIES, LANGS } from "../../../src/i18n";
import { en } from "../../../src/i18n/en";
import { parseCalcConfig } from "../../../src/templates/calc/config";
import { computeConvertCommand, computeInput, fmt, mapCalcError, renderings, type ComputeOptions } from "../../../src/templates/calc/engine";
import { HINT_INTERVAL_S, Lru, RATES_CACHE_TTL_S, clearAns, getAns, getRatesCached, invalidateRates, resetMemory, setAns, takeHint } from "../../../src/templates/calc/memory";
import { code, dateOf, esc, fxNote, line, plainError, renderComputed, renderError, resultMessage, shortExpr } from "../../../src/templates/calc/render";
import {
  HISTORY_KEEP,
  addHistory,
  clearHistory,
  deleteUserData,
  getUserState,
  isDigits,
  listHistory,
  resetInsertCounter,
  setUserField,
} from "../../../src/templates/calc/store";
import { CalcFakeDb, NOW, seedRates, setUser } from "./util";

const baseOpts = (o: Partial<ComputeOptions> = {}): ComputeOptions => ({
  lang: "en",
  angle: "deg",
  digits: 12,
  now: NOW,
  getRates: async () => null,
  ...o,
});

describe("parseCalcConfig", () => {
  it("defaults", () => {
    expect(parseCalcConfig({})).toEqual({ proStars: 150, miniAppPath: "/app/" });
    expect(parseCalcConfig(undefined)).toEqual({ proStars: 150, miniAppPath: "/app/" });
    expect(parseCalcConfig(null)).toEqual({ proStars: 150, miniAppPath: "/app/" });
  });

  it("accepts valid values", () => {
    expect(parseCalcConfig({ proStars: 99, miniAppPath: "/calc/v2/", supportContact: "@tez_support" })).toEqual({
      proStars: 99,
      miniAppPath: "/calc/v2/",
      supportContact: "@tez_support",
    });
  });

  it.each([0, -1, 1.5, 10_001, "150", NaN])("rejects proStars %j", (v) => {
    expect(() => parseCalcConfig({ proStars: v })).toThrow(/proStars/);
  });

  it.each(["app", "//evil.test/", "/a/../b", "/a b", "/a?x=1", "/a#x", 5, "/" + "a".repeat(120)])("rejects miniAppPath %j", (v) => {
    expect(() => parseCalcConfig({ miniAppPath: v })).toThrow(/miniAppPath/);
  });

  it.each(["@tez_support", "https://t.me/tez_support", "help@tez.uz"])("accepts supportContact %s", (v) => {
    expect(parseCalcConfig({ supportContact: v }).supportContact).toBe(v);
  });

  it.each(["tez", "@a", "http://x.y", "<b>x</b>", 5, "two words@x.y"])("rejects supportContact %j", (v) => {
    expect(() => parseCalcConfig({ supportContact: v })).toThrow(/supportContact/);
  });

  it.each([[], "x", 5, true])("rejects non-object config %j", (v) => {
    expect(() => parseCalcConfig(v)).toThrow(/obyekt/);
  });
});

describe("computeInput", () => {
  it("arithmetic", async () => {
    const c = await computeInput("2+3*4", baseOpts());
    expect(c).toMatchObject({ kind: "calc", expr: "2+3*4", result: "14" });
  });

  it("trims and normalizes no-break spaces", async () => {
    const c = await computeInput("  2 + 2  ", baseOpts());
    expect(c).toMatchObject({ kind: "calc", result: "4" });
  });

  it("empty input is not math", async () => {
    expect(await computeInput("   ", baseOpts())).toEqual({ kind: "not_math" });
  });

  it("ans is used as a variable", async () => {
    const c = await computeInput("ans*2", baseOpts({ ans: Decimal.from(21) }));
    expect(c).toMatchObject({ kind: "calc", result: "42" });
  });

  it("angle mode", async () => {
    expect(await computeInput("sin(90)", baseOpts({ angle: "deg" }))).toMatchObject({ result: "1" });
    const rad = await computeInput("sin(90)", baseOpts({ angle: "rad" }));
    expect(rad).toMatchObject({ kind: "calc" });
    expect((rad as { result: string }).result).not.toBe("1");
  });

  it.each([
    ["1/0", "err_div0"],
    ["sqrt(-4)", "err_domain"],
    ["2+", "err_syntax"],
    ["3 + foo", "err_unknown"],
    ["9^9^9^9", "err_overflow"],
  ] as const)("error %s -> %s", async (input, key) => {
    const c = await computeInput(input, baseOpts());
    expect(c).toMatchObject({ kind: "error", key });
  });

  it("syntax position is 1-based", async () => {
    const c = await computeInput("2 + * 3", baseOpts());
    expect(c).toMatchObject({ kind: "error", key: "err_syntax" });
    expect((c as unknown as { params: { pos: number } }).params.pos).toBeGreaterThanOrEqual(1);
  });

  it("over the length limit", async () => {
    expect(await computeInput("1".repeat(1001), baseOpts())).toMatchObject({ kind: "error", key: "err_too_long" });
  });

  it.each(["salom", "hello world", "qalaysiz"])("chit-chat %j is not math", async (s) => {
    expect(await computeInput(s, baseOpts())).toEqual({ kind: "not_math" });
  });

  it("an unknown name next to a number is an error, not chit-chat", async () => {
    expect(await computeInput("2 apples", baseOpts())).toMatchObject({ kind: "error", key: "err_unknown" });
  });

  it("`ans` without a stored value is an error, not chit-chat", async () => {
    expect(await computeInput("ans", baseOpts())).toMatchObject({ kind: "error", key: "err_unknown" });
  });

  it("unit conversion", async () => {
    const c = await computeInput("5 km to m", baseOpts());
    expect(c).toMatchObject({ kind: "convert", fromText: "5 km", result: "5,000 m" });
  });

  it("unit mismatch", async () => {
    expect(await computeInput("5 kg to km", baseOpts())).toMatchObject({ kind: "error", key: "err_units_mismatch" });
  });

  it("currency conversion asks for rates lazily (only for currencies)", async () => {
    let asked = 0;
    const o = baseOpts({ getRates: async () => (asked++, null) });
    await computeInput("5 km to m", o);
    await computeInput("2+2", o);
    expect(asked).toBe(0);
    const c = await computeInput("5 USD to EUR", o);
    expect(asked).toBe(1);
    expect(c).toMatchObject({ kind: "error", key: "err_no_rate", params: { pair: "USD/EUR" } });
  });

  it("currency conversion fresh and stale", async () => {
    const db = new CalcFakeDb();
    seedRates(db, NOW - 3600);
    const rates = await getRatesCached(db, NOW);
    const fresh = await computeInput("100 USD to UZS", baseOpts({ getRates: async () => rates }));
    expect(fresh).toMatchObject({ kind: "convert", result: "1,200,000 UZS", fx: { stale: false } });
    const stale = await computeInput("100 USD to UZS", baseOpts({ now: NOW + 5 * 86_400, getRates: async () => rates }));
    expect(stale).toMatchObject({ kind: "convert", fx: { stale: true } });
    invalidateRates(db);
  });

  it("computeConvertCommand returns null for non-conversions", async () => {
    expect(await computeConvertCommand("hello world", baseOpts())).toBeNull();
    expect(await computeConvertCommand("100 km mi", baseOpts())).toMatchObject({ kind: "convert" });
  });

  it("never throws on hostile input", async () => {
    for (const s of ["(".repeat(500), "\u0000", "1e999999", "((((((((((", "/".repeat(50), "💥", "5 km to ".repeat(10)]) {
      const c = await computeInput(s, baseOpts());
      expect(["calc", "convert", "error", "not_math"]).toContain(c.kind);
    }
  });
});

describe("mapCalcError", () => {
  it.each([
    ["syntax", "err_syntax"],
    ["arg_count", "err_syntax"],
    ["div0", "err_div0"],
    ["domain", "err_domain"],
    ["overflow", "err_overflow"],
    ["unknown_ident", "err_unknown"],
    ["too_long", "err_too_long"],
    ["too_deep", "err_too_long"],
  ] as const)("%s -> %s", (code, key) => {
    expect(mapCalcError(new CalcError(code, "x", { pos: 2, ident: "foo" })).key).toBe(key);
  });
});

describe("renderings", () => {
  it("integer -> one rendering", () => {
    expect(renderings(Decimal.from(42), "en", 12)).toEqual(["42"]);
  });
  it("zero", () => {
    expect(renderings(Decimal.ZERO, "en", 12)).toEqual(["0"]);
  });
  it("fraction -> main + 2 decimals", () => {
    expect(renderings(Decimal.parse("2.71828"), "en", 12)).toEqual(["2.71828", "2.72"]);
  });
  it("tiny values never round to a misleading 0", () => {
    const r = renderings(Decimal.parse("0.0000123"), "en", 12);
    expect(r).not.toContain("0");
    expect(r.at(-1)).toContain("×10^-5");
  });
  it("uses the language's separators", () => {
    expect(renderings(Decimal.parse("1234.5678"), "ru", 12)[0]).toBe("1 234,5678");
  });
  it("fmt honours significant digits", () => {
    expect(fmt(Decimal.parse("3.14159265"), "en", 6)).toBe("3.14159");
  });
});

describe("render helpers", () => {
  it("esc escapes & < > and quotes", () => {
    expect(esc(`<script>&"x"`)).toBe("&lt;script&gt;&amp;&quot;x&quot;");
  });

  it("line escapes both sides and isolates RTL", () => {
    expect(line("en", "1 < 2 & ```", "x<y")).toBe("<code>1 &lt; 2 &amp; ```</code> = <code>x&lt;y</code>");
    expect(line("ar", "2+3", "5")).toBe("<code>⁦2+3⁩</code> = <code>⁦5⁩</code>");
  });

  it("code() wraps only for Arabic", () => {
    for (const l of LANGS) expect(code(l, "1+1").includes("⁦")).toBe(l === "ar");
  });

  it("shortExpr collapses whitespace and truncates", () => {
    expect(shortExpr("1 +\n  2")).toBe("1 + 2");
    const long = shortExpr("1+".repeat(500));
    expect(long.length).toBe(400);
    expect(long.endsWith("…")).toBe(true);
  });

  it("renderError escapes parameters and substitutes them", () => {
    const t = renderError("en", { kind: "error", key: "err_unknown", params: { name: "<script>&" } });
    expect(t).toContain("“&lt;script&gt;&amp;”");
    expect(t).not.toContain("<script>");
  });

  it("plainError has no emoji prefix and keeps raw parameters", () => {
    expect(plainError("en", { kind: "error", key: "err_unknown", params: { name: "a&b" } })).toContain("“a&b”");
    expect(plainError("en", { kind: "error", key: "err_div0", params: {} }).startsWith("⚠️")).toBe(false);
  });

  it("renderComputed: not_math is null", () => {
    expect(renderComputed("en", { kind: "not_math" })).toBeNull();
  });

  it("fxNote: fresh vs stale vs none", () => {
    const base = { kind: "convert" as const, expr: "", fromText: "", result: "", value: Decimal.ONE, variants: [] };
    expect(fxNote("en", base)).toBe("");
    expect(fxNote("en", { ...base, fx: { updatedAt: NOW, stale: false } })).toContain(en.fx_updated.split("{")[0]);
    expect(fxNote("en", { ...base, fx: { updatedAt: NOW, stale: true } })).toContain("out of date");
    expect(dateOf(NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("resultMessage keeps the fx note for conversions only", () => {
    const calc = { kind: "calc" as const, expr: "1+1", result: "2", value: Decimal.from(2), variants: [] };
    expect(resultMessage("en", calc, "2")).toBe("<code>1+1</code> = <code>2</code>");
  });

  it("every language renders every error key without leftover placeholders", () => {
    for (const l of LANGS) {
      for (const key of ["err_syntax", "err_div0", "err_domain", "err_overflow", "err_unknown", "err_too_long", "err_units_mismatch", "err_no_rate", "err_generic"] as const) {
        const t = renderError(l, { kind: "error", key, params: { pos: 3, name: "foo", pair: "USD/EUR" } });
        expect(t, `${l}.${key}`).not.toMatch(/\{[a-z]+\}/);
      }
    }
    expect(DICTIONARIES.ar.err_div0.length).toBeGreaterThan(0);
  });
});

describe("memory", () => {
  it("Lru evicts the least recently used", () => {
    const l = new Lru<number>(2);
    l.set("a", 1);
    l.set("b", 2);
    l.get("a");
    l.set("c", 3);
    expect(l.get("b")).toBeUndefined();
    expect(l.get("a")).toBe(1);
    expect(l.size).toBe(2);
    l.delete("a");
    l.clear();
    expect(l.size).toBe(0);
  });

  it("ans is isolated per bot and user", () => {
    resetMemory();
    setAns("b1", 5, Decimal.from(7));
    expect(getAns("b1", 5)?.toString()).toBe("7");
    expect(getAns("b1", 6)).toBeUndefined();
    expect(getAns("b2", 5)).toBeUndefined();
    clearAns("b1", 5);
    expect(getAns("b1", 5)).toBeUndefined();
  });

  it("ans keeps full precision", () => {
    resetMemory();
    setAns("b", 1, Decimal.parse("0.1234567890123456789012345678901234"));
    expect(getAns("b", 1)?.toString()).toBe("0.1234567890123456789012345678901234");
  });

  it("takeHint throttles per user", () => {
    resetMemory();
    expect(takeHint("b", 1, 1000)).toBe(true);
    expect(takeHint("b", 1, 1000 + HINT_INTERVAL_S - 1)).toBe(false);
    expect(takeHint("b", 1, 1000 + HINT_INTERVAL_S)).toBe(true);
    expect(takeHint("b", 2, 1000)).toBe(true);
  });

  it("the rate table is cached for RATES_CACHE_TTL_S and refreshed after", async () => {
    const db = new CalcFakeDb();
    seedRates(db);
    invalidateRates(db);
    db.resetCounters();
    await getRatesCached(db, NOW);
    await getRatesCached(db, NOW + 10);
    expect(db.reads).toBe(1);
    await getRatesCached(db, NOW + RATES_CACHE_TTL_S + 1);
    expect(db.reads).toBe(2);
    invalidateRates(db);
    await getRatesCached(db, NOW + 20);
    expect(db.reads).toBe(3);
  });

  it("an empty table is not cached", async () => {
    const db = new CalcFakeDb();
    invalidateRates(db);
    expect(await getRatesCached(db, NOW)).toBeNull();
    seedRates(db);
    expect(await getRatesCached(db, NOW)).not.toBeNull();
  });
});

describe("store", () => {
  it("defaults for an unknown user", async () => {
    const s = await getUserState(new CalcFakeDb(), "b1", 5);
    expect(s).toEqual({ exists: false, lang: null, angle: "deg", digits: 12, keepHistory: false, proUntil: 0, style: null });
  });

  it("reads and validates a stored row", async () => {
    const db = new CalcFakeDb();
    setUser(db, 5, { lang: "tr", angle: "rad", digits: 20, keep_history: 1, pro_until: 99 });
    expect(await getUserState(db, "b1", 5)).toEqual({ exists: true, lang: "tr", angle: "rad", digits: 20, keepHistory: true, proUntil: 99, style: null });
    setUser(db, 7, { style: "glass" });
    expect(await getUserState(db, "b1", 7)).toMatchObject({ style: "glass" });
    setUser(db, 8, { style: "bogus" });
    expect(await getUserState(db, "b1", 8)).toMatchObject({ style: null });
    setUser(db, 6, { lang: "xx", angle: "zzz", digits: 7 });
    expect(await getUserState(db, "b1", 6)).toMatchObject({ lang: null, angle: "deg", digits: 12 });
  });

  it("setUserField upserts one column and leaves pro_until alone", async () => {
    const db = new CalcFakeDb();
    setUser(db, 5, { pro_until: 500 });
    await setUserField(db, "b1", 5, "angle", "rad", NOW);
    await setUserField(db, "b1", 7, "lang", "ru", NOW);
    expect(db.userRows.get("b1:5")).toMatchObject({ angle: "rad", pro_until: 500, updated_at: NOW });
    expect(db.userRows.get("b1:7")).toMatchObject({ lang: "ru", pro_until: 0, created_at: NOW });
  });

  it("setUserField rejects a column outside the whitelist", async () => {
    await expect(setUserField(new CalcFakeDb(), "b1", 5, "pro_until" as never, 1, NOW)).rejects.toThrow("bad field");
  });

  it("isDigits", () => {
    expect([6, 12, 20].every(isDigits)).toBe(true);
    expect([5, 13, "12", null].some(isDigits)).toBe(false);
  });

  it("history round trip, newest first, bounded by limit", async () => {
    const db = new CalcFakeDb();
    for (let i = 0; i < 5; i++) await addHistory(db, "b1", 5, `${i}+1`, String(i + 1), NOW + i);
    const rows = await listHistory(db, "b1", 5, 3);
    expect(rows.map((r) => r.expr)).toEqual(["4+1", "3+1", "2+1"]);
  });

  it("history text is truncated", async () => {
    const db = new CalcFakeDb();
    await addHistory(db, "b1", 5, "x".repeat(900), "y".repeat(900), NOW);
    expect(db.history[0].expr).toHaveLength(500);
    expect(db.history[0].result).toHaveLength(200);
  });

  it("pruning keeps the newest HISTORY_KEEP rows (every 25th insert)", async () => {
    resetInsertCounter();
    const db = new CalcFakeDb();
    for (let i = 0; i < HISTORY_KEEP + 5; i++) db.history.push({ id: i + 1, bot_id: "b1", user_id: 5, expr: "e", result: "r", ts: NOW });
    for (let i = 0; i < 25; i++) await addHistory(db, "b1", 5, "n", "n", NOW);
    expect(db.history.filter((h) => h.user_id === 5)).toHaveLength(HISTORY_KEEP);
  });

  it("clearHistory touches only one user", async () => {
    const db = new CalcFakeDb();
    await addHistory(db, "b1", 5, "a", "1", NOW);
    await addHistory(db, "b1", 6, "b", "2", NOW);
    await clearHistory(db, "b1", 5);
    expect(db.history.map((h) => h.user_id)).toEqual([6]);
  });

  it("deleteUserData resets settings, history and bot_users but keeps pro_until", async () => {
    const db = new CalcFakeDb();
    setUser(db, 5, { lang: "ru", digits: 6, keep_history: 1, pro_until: 777 });
    db.users.add("b1:5");
    await addHistory(db, "b1", 5, "a", "1", NOW);
    await deleteUserData(db, "b1", 5, NOW);
    expect(db.userRows.get("b1:5")).toMatchObject({ lang: null, digits: 12, keep_history: 0, pro_until: 777 });
    expect(db.history).toHaveLength(0);
    expect(db.users.has("b1:5")).toBe(false);
  });
});
