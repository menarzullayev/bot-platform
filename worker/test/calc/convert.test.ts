import { describe, expect, it } from "vitest";
import { parseConvertQuery, runConvert, type FxRates } from "../../src/calc";

const rates: FxRates = { base: "USD", rates: { UZS: "12000", EUR: "0.9", RUB: "90", GBP: "0.8" }, updatedAt: 1 };

function run(input: string, r: FxRates | null = rates): string {
  const q = parseConvertQuery(input);
  if (!q) throw new Error(`not a conversion: ${input}`);
  const res = runConvert(q, r);
  if (!res.ok) throw new Error(`${input}: ${res.code}`);
  return `${res.value.toSignificant(10)} ${res.from}>${res.to} ${res.kind}`;
}

describe("parseConvertQuery: accepted forms", () => {
  const cases: [string, string][] = [
    ["100 usd to uzs", "1200000 USD>UZS currency"],
    ["100 USD → EUR", "90 USD>EUR currency"],
    ["100usd->eur", "90 USD>EUR currency"],
    ["$50 in som", "600000 USD>UZS currency"],
    ["€10 to usd", "11.11111111 EUR>USD currency"],
    ["1 000 000 sum to usd", "83.33333333 UZS>USD currency"],
    ["1,000 usd to uzs", "12000000 USD>UZS currency"],
    ["100,5 usd to uzs", "1206000 USD>UZS currency"],
    ["5 km in mi", "3.106855961 km>mi unit"],
    ["5 km to mi", "3.106855961 km>mi unit"],
    ["20 c to f", "68 c>f unit"],
    ["-40 c to f", "-40 c>f unit"],
    ["2*(3+4) kg to lb", "30.86471671 kg>lb unit"],
    ["2*(3+4)kg to lb", "30.86471671 kg>lb unit"],
    ["10 km/h to m/s", "2.777777778 kmh>m/s unit"],
    ["/convert 100 km mi", "62.13711922 km>mi unit"],
    ["/convert@mybot 100 usd uzs", "1200000 USD>UZS currency"],
    ["/convert 100 km to mi", "62.13711922 km>mi unit"],
    ["5 км в мили", "3.106855961 km>mi unit"],
    ["5 км на мили", "3.106855961 km>mi unit"],
    ["100 долларов в сум", "1200000 USD>UZS currency"],
    ["100 usd ga som", "1200000 USD>UZS currency"],
    ["100 usd a eur", "90 USD>EUR currency"],
    ["10 kilómetros en millas", "6.213711922 km>mi unit"],
    ["5 in to cm", "12.7 in>cm unit"],
    ["5 in in cm", "12.7 in>cm unit"],
    ["1 gb in mb", "1000 GB>MB unit"],
    ["1 gib to mib", "1024 GiB>MiB unit"],
    ["100 gradus to f", "212 c>f unit"],
    ["10 pound to usd", "12.5 GBP>USD currency"],
    ["10 pound to kg", "4.5359237 lb>kg unit"],
    ["5 km to mi?", "3.106855961 km>mi unit"],
    ["100 usd to eur", "90 USD>EUR currency"],
  ];
  for (const [input, want] of cases) {
    it(input, () => {
      expect(run(input)).toBe(want);
    });
  }
  it("without a connector and without /convert it is not a conversion", () => {
    expect(parseConvertQuery("100 dollar so'mga")).toBeNull();
    expect(parseConvertQuery("100 km mi")).toBeNull();
  });
});

describe("parseConvertQuery: plain arithmetic is not captured", () => {
  for (const s of [
    "5 in",
    "3 to 4",
    "5 to",
    "to 5",
    "in",
    "2+2",
    "hello world",
    "5 a 3",
    "10 in 20",
    "x in y",
    "km to mi",
    "5 km",
    "5 km to",
    "5 km to banana",
    "banana to 5 km",
    "100 в 200",
    "1 en 2",
    "100 usd",
    "",
    "   ",
    "→",
    "-> ->",
  ]) {
    it(JSON.stringify(s), () => {
      expect(parseConvertQuery(s)).toBeNull();
    });
  }
});

describe("runConvert errors", () => {
  it("units_mismatch for different categories", () => {
    const q = parseConvertQuery("5 kg to km");
    expect(q).not.toBeNull();
    expect(runConvert(q!, null)).toEqual({ ok: false, code: "units_mismatch", pair: "kg/km" });
  });
  it("units_mismatch for unit vs currency", () => {
    const q = parseConvertQuery("5 kg to usd");
    expect(q?.kind).toBe("mismatch");
    expect(runConvert(q!, rates)).toMatchObject({ ok: false, code: "units_mismatch" });
  });
  it("no_rate when rates are missing or incomplete", () => {
    const q = parseConvertQuery("5 usd to kzt")!;
    expect(runConvert(q, null)).toEqual({ ok: false, code: "no_rate", pair: "USD/KZT" });
    expect(runConvert(q, rates)).toEqual({ ok: false, code: "no_rate", pair: "USD/KZT" });
  });
  it("unit conversion does not need rates", () => {
    const q = parseConvertQuery("5 km to mi")!;
    expect(runConvert(q, null).ok).toBe(true);
  });
  it("unknown_unit for a hand-made broken query", () => {
    const q = parseConvertQuery("5 km to mi")!;
    expect(runConvert({ ...q, toUnit: undefined }, null)).toMatchObject({ ok: false, code: "unknown_unit" });
  });
  it("huge values do not throw", () => {
    const q = parseConvertQuery("9^9999 km to nm");
    if (q) expect(typeof runConvert(q, null).ok).toBe("boolean");
  });
});

describe("parseConvertQuery: fuzz", () => {
  it("never throws on garbage", () => {
    const parts = ["100", "usd", "to", "km", "mi", "->", "→", "$", "€", "(", ")", "*", "1 000", "in", "a", "ga", "в", "/convert", "c", "f", "°", "x", "9^999", "..", ",", "\u0000", "💥", "="];
    let seed = 777;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 4000; i++) {
      const n = 1 + Math.floor(rnd() * 8);
      const s = Array.from({ length: n }, () => parts[Math.floor(rnd() * parts.length)]).join(rnd() < 0.8 ? " " : "");
      expect(() => {
        const q = parseConvertQuery(s);
        if (q) runConvert(q, rates);
      }, s).not.toThrow();
    }
    expect(parseConvertQuery("1 ".repeat(5000))).toBeNull();
    expect(parseConvertQuery(undefined as unknown as string)).toBeNull();
  });
  it("is fast", () => {
    const t = performance.now();
    for (let i = 0; i < 200; i++) parseConvertQuery("2*(3+4) kg to lb");
    expect((performance.now() - t) / 200).toBeLessThan(3);
  });
});
