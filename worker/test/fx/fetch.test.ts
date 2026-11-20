import { describe, expect, it } from "vitest";
import { convertCurrency, Decimal } from "../../src/calc";
import { CBU_URL, ER_API_URL, fetchRates, MAX_BODY_BYTES, parseCbu, parseErApi, type FetchFn, type FetchResponseLike } from "../../src/fx/fetch";

const NOW = 1_800_000_000;
const now = () => NOW;

// Shape taken from a real https://cbu.uz/oz/arkhiv-kursov-valyut/json/ response (values trimmed).
const cbuRow = (ccy: string, rate: string, nominal = "1") => ({
  id: 1,
  Code: "000",
  Ccy: ccy,
  CcyNm_RU: "x",
  CcyNm_UZ: "x",
  CcyNm_UZC: "x",
  CcyNm_EN: "x",
  Nominal: nominal,
  Rate: rate,
  Diff: "-8.72",
  Date: "20.11.2026",
});
const CBU = [cbuRow("USD", "11971.64"), cbuRow("EUR", "13160.42"), cbuRow("RUB", "150.10"), cbuRow("JPY", "78.2", "10"), cbuRow("KZT", "23.5")];

// Shape taken from a real https://open.er-api.com/v6/latest/USD response.
const ER = {
  result: "success",
  provider: "https://www.exchangerate-api.com",
  time_last_update_unix: 1795132952,
  base_code: "USD",
  rates: { USD: 1, UZS: 11970, EUR: 0.9, RUB: 80.5, KZT: 510.25, AED: 3.6725, TNY: 1e-7 },
};

function resp(body: unknown, init: { ok?: boolean; status?: number; len?: string } = {}): FetchResponseLike {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: { get: (n) => (n.toLowerCase() === "content-length" ? (init.len ?? null) : null) },
    text: async () => text,
  };
}

function router(map: Record<string, () => FetchResponseLike | Promise<FetchResponseLike>>): { fn: FetchFn; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fn: async (url) => {
      calls.push(url);
      const h = map[url];
      if (!h) throw new Error("no route");
      return h();
    },
  };
}

describe("parseCbu", () => {
  it("builds a UZS-based table from Rate/Nominal", () => {
    const t = parseCbu(CBU, NOW)!;
    expect(t.base).toBe("UZS");
    expect(t.source).toBe("cbu");
    expect(t.updatedAt).toBe(NOW);
    expect(t.rates.UZS).toBe("1");
    // 1 UZS buys 1/11971.64 USD
    expect(Decimal.parse(t.rates.USD).mul(Decimal.parse("11971.64")).toFixed(12)).toBe("1.000000000000");
    // Nominal 10: 78.2 UZS buys 10 JPY
    expect(convertCurrency(Decimal.from(10), "JPY", "UZS", t)?.toFixed(6)).toBe("78.200000");
  });
  it("cross rate USD to UZS equals the published rate", () => {
    const t = parseCbu(CBU, NOW)!;
    expect(convertCurrency(Decimal.from(100), "USD", "UZS", t)?.toFixed(4)).toBe("1197164.0000");
    expect(convertCurrency(Decimal.from(1), "EUR", "USD", t)?.toFixed(4)).toBe("1.0993");
  });
  it("skips invalid rows but needs USD and enough rows", () => {
    const rows = [...CBU, cbuRow("BA1", "1"), cbuRow("ZZZ", "-5"), cbuRow("YYY", "abc"), cbuRow("XXX", "0"), cbuRow("WWW", "1", "0"), null, 5, { Ccy: 1 }];
    const t = parseCbu(rows, NOW)!;
    expect(Object.keys(t.rates).sort()).toEqual(["EUR", "JPY", "KZT", "RUB", "USD", "UZS"]);
    expect(parseCbu(CBU.filter((r) => r.Ccy !== "USD").concat(cbuRow("GBP", "1"), cbuRow("CHF", "1")), NOW)).toBeNull();
    expect(parseCbu(CBU.slice(0, 3), NOW)).toBeNull();
  });
  it("rejects wrong shapes", () => {
    for (const bad of [null, undefined, 5, "x", {}, [], { a: 1 }, [1, 2, 3, 4, 5, 6]]) expect(parseCbu(bad, NOW), String(bad)).toBeNull();
  });
});

describe("parseErApi", () => {
  it("keeps the USD base and stringifies numbers (also exponent notation)", () => {
    const t = parseErApi(ER, NOW)!;
    expect(t.base).toBe("USD");
    expect(t.source).toBe("er-api");
    expect(t.rates.UZS).toBe("11970");
    expect(t.rates.AED).toBe("3.6725");
    expect(t.rates.TNY).toBe("0.0000001");
  });
  it("drops non-positive and non-numeric values", () => {
    const t = parseErApi({ ...ER, rates: { ...ER.rates, NEG: -1, ZER: 0, STR: "5", NAN: null, lower: 3 } }, NOW)!;
    expect(t.rates.NEG).toBeUndefined();
    expect(t.rates.ZER).toBeUndefined();
    expect(t.rates.STR).toBeUndefined();
    expect(t.rates.NAN).toBeUndefined();
  });
  it("rejects failure payloads", () => {
    expect(parseErApi({ result: "error", "error-type": "quota-reached" }, NOW)).toBeNull();
    expect(parseErApi({ ...ER, base_code: "EUR" }, NOW)).toBeNull();
    expect(parseErApi({ ...ER, rates: { USD: 1 } }, NOW)).toBeNull();
    expect(parseErApi(null, NOW)).toBeNull();
    expect(parseErApi([], NOW)).toBeNull();
  });
});

describe("fetchRates", () => {
  it("uses the central bank first and does not touch the backup", async () => {
    const r = router({ [CBU_URL]: () => resp(CBU), [ER_API_URL]: () => resp(ER) });
    const t = await fetchRates(r.fn, { now });
    expect(t?.base).toBe("UZS");
    expect(r.calls).toEqual([CBU_URL]);
  });
  it("falls back when the bank answers with an error status", async () => {
    const r = router({ [CBU_URL]: () => resp("oops", { ok: false, status: 503 }), [ER_API_URL]: () => resp(ER) });
    const t = await fetchRates(r.fn, { now });
    expect(t?.base).toBe("USD");
    expect(r.calls).toEqual([CBU_URL, ER_API_URL]);
  });
  it("falls back on invalid JSON and on wrong shape", async () => {
    expect((await fetchRates(router({ [CBU_URL]: () => resp("<html>"), [ER_API_URL]: () => resp(ER) }).fn, { now }))?.base).toBe("USD");
    expect((await fetchRates(router({ [CBU_URL]: () => resp({ nope: 1 }), [ER_API_URL]: () => resp(ER) }).fn, { now }))?.base).toBe("USD");
  });
  it("falls back when the fetch itself throws", async () => {
    const r = router({ [ER_API_URL]: () => resp(ER) }); // CBU route missing -> throws
    expect((await fetchRates(r.fn, { now }))?.base).toBe("USD");
  });
  it("returns null when both sources fail", async () => {
    expect(await fetchRates(router({}).fn, { now })).toBeNull();
    const bad = router({ [CBU_URL]: () => resp("x", { ok: false, status: 500 }), [ER_API_URL]: () => resp({ result: "error" }) });
    expect(await fetchRates(bad.fn, { now })).toBeNull();
  });
  it("rejects oversized bodies (content-length and actual text)", async () => {
    const big = router({
      [CBU_URL]: () => resp(CBU, { len: String(MAX_BODY_BYTES + 1) }),
      [ER_API_URL]: () => resp(JSON.stringify(ER) + " ".repeat(MAX_BODY_BYTES)),
    });
    expect(await fetchRates(big.fn, { now })).toBeNull();
  });
  it("times out a hanging request and moves on", async () => {
    const hang: FetchFn = (url, init) =>
      url === CBU_URL
        ? new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))))
        : Promise.resolve(resp(ER));
    const t0 = Date.now();
    const t = await fetchRates(hang, { now, timeoutMs: 30 });
    expect(t?.base).toBe("USD");
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it("times out even when the fetch ignores the abort signal", async () => {
    const stuck: FetchFn = () => new Promise(() => undefined);
    expect(await fetchRates(stuck, { now, timeoutMs: 20 })).toBeNull();
  });
  it("sends an accept header and an abort signal", async () => {
    let seen: { signal?: AbortSignal; headers?: Record<string, string> } | undefined;
    const fn: FetchFn = async (_u, init) => {
      seen = init;
      return resp(CBU);
    };
    await fetchRates(fn, { now });
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
    expect(seen?.headers?.accept).toBe("application/json");
  });
  it("default clock produces a plausible updatedAt", async () => {
    const t = await fetchRates(router({ [CBU_URL]: () => resp(CBU) }).fn);
    expect(Math.abs((t?.updatedAt ?? 0) - Date.now() / 1000)).toBeLessThan(5);
  });
});
