import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/calc/decimal";
import { loan } from "../../src/calc/finance";
import { ApiError, createApi } from "../../../miniapp/src/lib/api";
import { MAIN_PAD, SCI_KEYS, applyKey, backspace, insertAt, runCalc, type KeyDef } from "../../../miniapp/src/lib/calc";
import { availableCurrencies, categories, convert, defaultPair, itemsOf, parseFxPayload, searchItems } from "../../../miniapp/src/lib/convert";
import { TOOLS, TOOL_IDS, computeTool, defaultsOf } from "../../../miniapp/src/lib/finance";
import { formatMoney, formatRaw, formatResult, isolateLtr, parseNumber } from "../../../miniapp/src/lib/num";
import { bounds, defaultView, fitView, formatTick, niceStep, panBy, samplePlot, tableRows, ticks, toScreen, toWorld, traceAt, zoomAt } from "../../../miniapp/src/lib/plot";
import { sampleFunction } from "../../src/calc/symbolic/numeric";

const P = { lang: "en", angle: "deg", digits: 12 } as const;

describe("parseNumber", () => {
  it.each([
    ["1000", "1000"],
    ["1 000 000", "1000000"],
    ["1 000,5", "1000.5"],
    ["1,5", "1.5"],
    ["1,234.5", "1234.5"],
    ["1.234,5", "1234.5"],
    ["1,234,567", "1234567"],
    ["-7.25", "-7.25"],
    [".5", "0.5"],
    ["-.5", "-0.5"],
    ["+3", "3"],
    ["٣٫٥", "3.5"],
    ["1e3", "1000"],
  ])("%s -> %s", (input, want) => expect(parseNumber(input)?.toString()).toBe(want));

  it.each(["", " ", "abc", "1+1", "1..2", "--1", "1e", "Infinity", "NaN", "1".repeat(80), "0x10"])("rejects %j", (s) => {
    expect(parseNumber(s)).toBeNull();
  });
});

describe("formatting", () => {
  it("uses the language's separators", () => {
    const d = Decimal.parse("1234567.891");
    expect(formatResult(d, { lang: "en", digits: 12 })).toBe("1,234,567.891");
    expect(formatResult(d, { lang: "ru", digits: 12 })).toBe("1 234 567,891");
    expect(formatResult(d, { lang: "tr", digits: 12 })).toBe("1.234.567,891");
    expect(formatResult(d, { lang: "ar", digits: 12 })).toBe("1,234,567.891");
  });
  it("honours the fraction digits setting and keeps ASCII digits", () => {
    const third = Decimal.from(1).div(Decimal.from(3));
    expect(formatResult(third, { lang: "en", digits: 4 })).toBe("0.3333");
    expect(formatResult(third, { lang: "en", digits: 0 })).toBe("0");
    expect(formatResult(third, { lang: "ar", digits: 3 })).toMatch(/^[0-9.]+$/);
  });
  it("raw form is machine readable by the evaluator", () => {
    const raw = formatRaw(Decimal.parse("1234567.5"), 12);
    expect(raw).toBe("1234567.5");
    const r = runCalc(raw + "+1", P);
    expect(r.ok && r.raw).toBe("1234568.5");
  });
  it("money rounding and LTR isolation", () => {
    expect(formatMoney(Decimal.parse("2.345"), "en")).toBe("2.35");
    expect(formatMoney(Decimal.parse("1000"), "en")).toBe("1,000");
    expect(formatMoney(Decimal.parse("63445316.7"), "ru")).toBe("63 445 316,70");
    expect(formatMoney(Decimal.parse("0.5"), "en")).toBe("0.50");
    expect(formatMoney(Decimal.parse("1234.5"), "tr")).toBe("1.234,50");
    expect(formatMoney(Decimal.parse("12"), "en", 0)).toBe("12");
    expect(isolateLtr("1+2")).toBe("…1+2⁩".replace("…", "⁦"));
    expect(isolateLtr("")).toBe("");
  });
});

describe("runCalc", () => {
  it("evaluates with the same engine as the bot", () => {
    const r = runCalc("2+2*3", P);
    expect(r.ok && r.text).toBe("8");
    expect(runCalc("0.1+0.2", P)).toMatchObject({ ok: true, text: "0.3" });
    expect(runCalc("5!", P)).toMatchObject({ ok: true, text: "120" });
    expect(runCalc("10+10%", P)).toMatchObject({ ok: true, text: "11" });
  });
  it("respects the angle unit", () => {
    expect(runCalc("sin(30)", { ...P, angle: "deg" })).toMatchObject({ ok: true, text: "0.5" });
    const rad = runCalc("sin(30)", { ...P, angle: "rad" });
    expect(rad.ok && rad.text).toBe("-0.988031624093");
  });
  it("feeds the previous answer as ans", () => {
    const r = runCalc("ans*2", P, Decimal.from(21));
    expect(r.ok && r.text).toBe("42");
    expect(runCalc("ans*2", P).ok).toBe(false);
  });
  it("maps failures to catalog error keys", () => {
    expect(runCalc("1/0", P)).toMatchObject({ ok: false, error: { key: "err_div0" } });
    expect(runCalc("sqrt(-1)", P)).toMatchObject({ ok: false, error: { key: "err_domain" } });
    const syn = runCalc("2+*", P);
    expect(syn).toMatchObject({ ok: false, error: { key: "err_syntax" } });
    expect(runCalc("foo+1", P)).toMatchObject({ ok: false, error: { key: "err_unknown", params: { name: "foo" } } });
    expect(runCalc("9".repeat(600), P)).toMatchObject({ ok: false });
  });
  it("never throws on garbage", () => {
    for (const s of ["", "(((((", ")", "1 2 3", "∞", "\u0000", "1e999999", "((((((((((((((((((((((((1))))))))))))))))))))))))"]) {
      expect(() => runCalc(s, P)).not.toThrow();
    }
  });
  it("every keypad insertion is accepted by the evaluator inside a valid expression", () => {
    const keys: KeyDef[] = [...MAIN_PAD, ...SCI_KEYS].filter((k) => k.insert !== undefined);
    for (const k of keys) {
      if (k.kind === "fn") {
        expect(runCalc(k.insert + "0.5)", P, Decimal.ONE).ok, `${k.id}`).toBe(true);
      } else if (k.kind === "const") {
        expect(runCalc(`2*${k.insert}`, P, Decimal.ONE).ok, `${k.id}`).toBe(true);
      }
    }
    expect(runCalc("2^2", P)).toMatchObject({ ok: true, text: "4" });
    expect(runCalc("3^2", P)).toMatchObject({ ok: true, text: "9" });
  });
  it("keypad has unique ids and a 4 column main pad", () => {
    const ids = [...MAIN_PAD, ...SCI_KEYS].map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MAIN_PAD).toHaveLength(20);
  });
});

describe("keypad editing", () => {
  const st = (text: string, start = text.length, end = start) => ({ text, start, end });
  it("inserts at the caret and moves it", () => {
    expect(insertAt(st("12", 1), "+")).toEqual(st("1+2", 2));
  });
  it("replaces a selection", () => {
    expect(insertAt(st("12345", 1, 4), "0")).toEqual(st("105", 2));
  });
  it("wraps a selection with a function", () => {
    expect(insertAt(st("2+3", 2, 3), "sin(")).toEqual(st("2+sin(3)", 8));
  });
  it("backspace removes one char, a selection or a whole 'name('", () => {
    expect(backspace(st("123"))).toEqual(st("12"));
    expect(backspace(st("1234", 1, 3))).toEqual(st("14", 1));
    expect(backspace(st("2+sin("))).toEqual(st("2+"));
    expect(backspace(st("√("))).toEqual(st(""));
    expect(backspace(st("", 0))).toEqual(st("", 0));
    expect(backspace(st("a😀"))).toEqual(st("a"));
  });
  it("AC clears, control keys without insert do nothing else", () => {
    const ac = MAIN_PAD.find((k) => k.id === "ac") as KeyDef;
    const eq = MAIN_PAD.find((k) => k.id === "eq") as KeyDef;
    expect(applyKey(st("123"), ac)).toEqual(st(""));
    expect(applyKey(st("123"), eq)).toEqual(st("123"));
  });
});

describe("plot geometry", () => {
  const W = 400;
  const H = 300;
  it("toScreen and toWorld are inverses", () => {
    const v = { cx: 3, cy: -2, sx: 25, sy: 40 };
    const [px, py] = toScreen(v, W, H, 1.5, 7);
    const [x, y] = toWorld(v, W, H, px, py);
    expect(x).toBeCloseTo(1.5, 9);
    expect(y).toBeCloseTo(7, 9);
  });
  it("origin is centred in the default view and bounds are symmetric", () => {
    const v = defaultView(W, H);
    expect(toScreen(v, W, H, 0, 0)).toEqual([200, 150]);
    const b = bounds(v, W, H);
    expect(b.xmin).toBeCloseTo(-10);
    expect(b.xmax).toBeCloseTo(10);
  });
  it("zoomAt keeps the world point under the cursor fixed", () => {
    const v = { cx: 1, cy: 1, sx: 20, sy: 20 };
    const before = toWorld(v, W, H, 120, 80);
    const z = zoomAt(v, 2.5, 120, 80, W, H);
    const after = toWorld(z, W, H, 120, 80);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
    expect(z.sx).toBeCloseTo(50);
  });
  it("zoomAt clamps the scale and ignores bad factors", () => {
    const v = { cx: 0, cy: 0, sx: 20, sy: 20 };
    expect(zoomAt(v, 1e30, 0, 0, W, H).sx).toBeLessThanOrEqual(1e8);
    expect(zoomAt(v, 1e-30, 0, 0, W, H).sx).toBeGreaterThanOrEqual(1e-6);
    expect(zoomAt(v, NaN, 0, 0, W, H)).toBe(v);
    expect(zoomAt(v, -1, 0, 0, W, H)).toBe(v);
  });
  it("panBy moves the world with the finger", () => {
    const v = panBy({ cx: 0, cy: 0, sx: 10, sy: 10 }, 50, 20);
    expect(v.cx).toBeCloseTo(-5);
    expect(v.cy).toBeCloseTo(2);
  });
  it("niceStep returns 1/2/5 x 10^k", () => {
    for (const [span, target] of [[20, 8], [1, 5], [0.037, 6], [12345, 7], [1e-7, 5]] as const) {
      const s = niceStep(span, target);
      const m = s / Math.pow(10, Math.floor(Math.log10(s)));
      expect([1, 2, 5]).toContain(Math.round(m * 1e6) / 1e6);
    }
    expect(niceStep(0)).toBe(1);
    expect(niceStep(NaN)).toBe(1);
  });
  it("ticks are multiples of the step inside the range, without float noise", () => {
    expect(ticks(-1, 1, 0.5)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(ticks(0.05, 0.35, 0.1)).toEqual([0.1, 0.2, 0.3]);
    expect(ticks(5, 1, 1)).toEqual([]);
    expect(ticks(0, 1, 0)).toEqual([]);
    expect(ticks(0, 1e9, 1)).toEqual([]);
  });
  it("formatTick avoids noise", () => {
    expect(formatTick(0.30000000000000004, 0.1)).toBe("0.3");
    expect(formatTick(5, 1)).toBe("5");
    expect(formatTick(0, 1)).toBe("0");
    expect(formatTick(2_500_000, 500_000)).toBe("2.5e6");
  });
  it("samplePlot draws sin(x) as one polyline and splits 1/x at the pole", () => {
    const v = defaultView(W, H);
    const sin = samplePlot((x) => Math.sin(x), v, W, H);
    expect(sin.lines).toHaveLength(1);
    expect(sin.lines[0].length).toBeGreaterThan(100);
    const inv = samplePlot((x) => 1 / x, v, W, H);
    expect(inv.lines.length).toBeGreaterThanOrEqual(2);
    for (const line of inv.lines) {
      const xs = line.map((p) => p[0]);
      // no polyline crosses the pole at x = 0 (screen x = 200)
      expect(Math.max(...xs) < 200.5 || Math.min(...xs) > 199.5).toBe(true);
    }
  });
  it("samplePlot copes with functions that are undefined or infinite", () => {
    const v = defaultView(W, H);
    expect(samplePlot(() => NaN, v, W, H).lines).toEqual([]);
    expect(samplePlot(() => Infinity, v, W, H).lines).toEqual([]);
    expect(() => samplePlot((x) => Math.log(x), v, W, H)).not.toThrow();
    expect(samplePlot((x) => Math.sqrt(x), v, W, H).lines.length).toBeGreaterThan(0);
  });
  it("fitView centres a shifted curve vertically", () => {
    const v = fitView([(x) => x * x * 0 + 50 + Math.sin(x)], W, H);
    expect(v.cy).toBeGreaterThan(48);
    expect(v.cy).toBeLessThan(52);
    expect(fitView([], W, H)).toEqual(defaultView(W, H));
    expect(fitView([() => NaN], W, H)).toEqual(defaultView(W, H));
  });
  it("tableRows marks undefined values", () => {
    const rows = tableRows((x) => 1 / x, -1, 1, 3);
    expect(rows).toEqual([
      { x: -1, y: -1 },
      { x: 0, y: null },
      { x: 1, y: 1 },
    ]);
    expect(tableRows((x) => x, 0, 0.1, 4).map((r) => r.x)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(tableRows((x) => x, 0, 1, 5000)).toHaveLength(200);
    expect(tableRows(() => { throw new Error("x"); }, 0, 1, 2).every((r) => r.y === null)).toBe(true);
  });
  it("traceAt finds the nearest sample", () => {
    const s = sampleFunction((x) => x * 2, 0, 10, 100);
    const p = traceAt(s, 4.97);
    expect(p).not.toBeNull();
    expect(Math.abs((p as [number, number])[0] - 4.97)).toBeLessThan(0.06);
    expect(traceAt({ points: [], breaks: [] }, 1)).toBeNull();
  });
});

describe("converter logic", () => {
  it("lists categories with currency last and a sane default pair for each", () => {
    const cats = categories();
    expect(cats.at(-1)).toBe("currency");
    expect(cats).toContain("length");
    for (const c of cats) {
      const [a, b] = defaultPair(c);
      expect(itemsOf(c)).toContain(a);
      expect(itemsOf(c)).toContain(b);
      expect(a).not.toBe(b);
    }
  });
  it("converts units exactly", () => {
    const km = convert("length", Decimal.from(1), "km", "mi", null);
    expect(km.ok && km.value.toString().startsWith("0.62137119")).toBe(true);
    const f = convert("temperature", Decimal.from(100), "c", "f", null);
    expect(f.ok && f.value.toString()).toBe("212");
    const kib = convert("data", Decimal.from(1), "KiB", "B", null);
    expect(kib.ok && kib.value.toString()).toBe("1024");
  });
  it("converts currencies through the table base and handles missing rates", () => {
    const rates = { base: "USD", rates: { UZS: "12000", EUR: "0.5" }, updatedAt: 1 };
    const a = convert("currency", Decimal.from(10), "USD", "UZS", rates);
    expect(a.ok && a.value.toString()).toBe("120000");
    const b = convert("currency", Decimal.from(1), "EUR", "UZS", rates);
    expect(b.ok && b.value.toString()).toBe("24000");
    expect(convert("currency", Decimal.from(1), "USD", "UZS", null)).toEqual({ ok: false, error: "no_rate" });
    expect(convert("currency", Decimal.from(1), "USD", "JPY", rates)).toEqual({ ok: false, error: "no_rate" });
  });
  it("rejects unknown units", () => {
    expect(convert("length", Decimal.from(1), "zzz", "km", null)).toEqual({ ok: false, error: "unknown_unit" });
  });
  it("searches by code and by alias in any language", () => {
    expect(searchItems("currency", "dollar")).toContain("USD");
    expect(searchItems("currency", "сум")).toContain("UZS");
    expect(searchItems("currency", "eu")).toContain("EUR");
    expect(searchItems("length", "kilometr")).toContain("km");
    expect(searchItems("length", "км")).toContain("km");
    expect(searchItems("length", "")).toEqual(itemsOf("length"));
    expect(searchItems("length", "qqqqq")).toEqual([]);
  });
  it("validates the /fx payload shape", () => {
    expect(parseFxPayload({ base: "USD", rates: { UZS: "12000", BAD: 5 }, updated_at: 10, source: "cbu", stale: true })).toEqual({
      base: "USD",
      rates: { UZS: "12000" },
      updatedAt: 10,
      source: "cbu",
      stale: true,
    });
    for (const bad of [null, 1, {}, { base: 1, rates: {}, updated_at: 1 }, { base: "USD", rates: null, updated_at: 1 }, { base: "USD", rates: {}, updated_at: "x" }]) {
      expect(parseFxPayload(bad)).toBeNull();
    }
  });
  it("lists only convertible currencies when a table is known", () => {
    const list = availableCurrencies({ base: "USD", rates: { UZS: "1", EUR: "1" }, updatedAt: 1 });
    expect(list.sort()).toEqual(["EUR", "USD", "UZS"]);
    expect(availableCurrencies(null).length).toBeGreaterThan(10);
  });
});

describe("finance tools", () => {
  it("annuity loan matches the engine", () => {
    const want = loan({ principal: 50_000_000, annualRatePct: 24, months: 24, type: "annuity" });
    const r = computeTool("loan", defaultsOf("loan"), "en");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0]).toMatchObject({ label: "loan_label_monthly", value: formatMoney(want.monthly as Decimal, "en") });
    expect(r.schedule).toHaveLength(12);
    expect(r.schedule?.[0].month).toBe("1");
    expect(r.rows.map((x) => x.label)).toEqual(["loan_label_monthly", "loan_label_total", "loan_label_interest", "r_overpayment"]);
  });
  it("differentiated loan shows first and last payments", () => {
    const r = computeTool("loan", { ...defaultsOf("loan"), type: "diff" }, "ru");
    expect(r.ok && r.rows[0].label).toBe("r_first_payment");
  });
  it("VAT adds and extracts", () => {
    const add = computeTool("vat", { amount: "1000", rate: "12", mode: "add" }, "en");
    expect(add.ok && add.rows.map((x) => x.value)).toEqual(["1,000", "120", "1,120"]);
    const rem = computeTool("vat", { amount: "1120", rate: "12", mode: "remove" }, "en");
    expect(rem.ok && rem.rows.map((x) => x.value)).toEqual(["1,000", "120", "1,120"]);
  });
  it("discount, percent change, compound, simple interest, markup", () => {
    expect(computeTool("discount", { price: "200", pct: "25" }, "en")).toMatchObject({ ok: true, rows: [{ value: "150" }, { value: "50" }] });
    expect(computeTool("percent", { from: "80", to: "100" }, "en")).toMatchObject({ ok: true, rows: [{ value: "25%" }, { value: "20" }] });
    expect(computeTool("simple", { principal: "1000", rate: "10", years: "2" }, "en")).toMatchObject({ ok: true, rows: [{ value: "1,200" }, { value: "200" }] });
    const comp = computeTool("compound", { principal: "1000", rate: "12", years: "1", perYear: "12" }, "en");
    expect(comp.ok && comp.rows.map((x) => x.value)).toEqual(["1,126.83", "126.83", "12.6825%"]);
    expect(computeTool("markup", { cost: "80", price: "100" }, "en")).toMatchObject({ ok: true, rows: [{ value: "20" }, { value: "25%" }, { value: "20%" }] });
  });
  it("reports bad input instead of throwing", () => {
    expect(computeTool("loan", { ...defaultsOf("loan"), principal: "abc" }, "en")).toEqual({ ok: false, error: "bad_input" });
    expect(computeTool("loan", { ...defaultsOf("loan"), months: "0" }, "en")).toEqual({ ok: false, error: "bad_term" });
    expect(computeTool("loan", { ...defaultsOf("loan"), months: "12.5" }, "en")).toEqual({ ok: false, error: "bad_input" });
    expect(computeTool("loan", { ...defaultsOf("loan"), principal: "-5" }, "en")).toEqual({ ok: false, error: "bad_principal" });
    expect(computeTool("loan", { ...defaultsOf("loan"), rate: "5000" }, "en")).toEqual({ ok: false, error: "bad_rate" });
    expect(computeTool("percent", { from: "0", to: "5" }, "en")).toEqual({ ok: false, error: "div0" });
    expect(computeTool("compound", { principal: "1", rate: "1", years: "1", perYear: "x" }, "en")).toEqual({ ok: false, error: "bad_input" });
  });
  it("every tool computes with its own defaults", () => {
    for (const id of TOOL_IDS) {
      expect(computeTool(id, defaultsOf(id), "uz-latn").ok, id).toBe(true);
      expect(TOOLS[id].fields.length).toBeGreaterThan(0);
    }
  });
});

describe("API client", () => {
  function fakeFetch(status: number, body: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  it("sends the tma header and JSON bodies to the bot's endpoints", async () => {
    const f = fakeFetch(200, { ok: true });
    const api = createApi({ botId: "tezcalc", initData: "a=1&hash=x", fetchFn: f.fn });
    await api.saveSettings({ angle: "rad", keep_history: true });
    await api.addHistory("1+1", "2");
    await api.clearHistory();
    expect(f.calls[0].url).toBe("/api/app/tezcalc/settings");
    expect(f.calls[0].init.method).toBe("POST");
    expect((f.calls[0].init.headers as Record<string, string>).authorization).toBe("tma a=1&hash=x");
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ angle: "rad", keep_history: true });
    expect(f.calls[1].init.method).toBe("POST");
    expect(f.calls[2].init.method).toBe("DELETE");
  });

  it("does not send credentials to the public fx endpoint", async () => {
    const f = fakeFetch(200, { base: "USD", rates: {}, updated_at: 1, source: null, stale: false });
    const api = createApi({ botId: "tezcalc", initData: "secret-init-data", fetchFn: f.fn });
    await api.fx();
    expect((f.calls[0].init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("turns error responses into ApiError with the server's code", async () => {
    const api = createApi({ botId: "tezcalc", initData: "x", fetchFn: fakeFetch(401, { error: "auth_expired" }).fn });
    await expect(api.me()).rejects.toMatchObject({ name: "ApiError", status: 401, code: "auth_expired" });
    const html = createApi({ botId: "tezcalc", initData: "x", fetchFn: (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch });
    await expect(html.me()).rejects.toBeInstanceOf(ApiError);
    await expect(html.me()).rejects.toMatchObject({ code: "http_502" });
  });

  it("rejects an invalid bot id before any request", () => {
    for (const id of ["", "a b", "../x", "x".repeat(33), "a/b"]) expect(() => createApi({ botId: id, initData: "" })).toThrow();
  });
});
