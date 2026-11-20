import { describe, expect, it } from "vitest";
import { convertCurrency, Decimal, findCurrency, listCurrencies, type FxRates } from "../../src/calc";

// 1 USD = 12000 UZS = 0.9 EUR = 90 RUB
const usdRates: FxRates = { base: "USD", rates: { UZS: "12000", EUR: "0.9", RUB: "90", USD: "1" }, updatedAt: 1000 };
// base UZS (as produced from the central bank feed)
const uzsRates: FxRates = { base: "UZS", rates: { UZS: "1", USD: "0.0001", EUR: "0.00009" }, updatedAt: 1000 };

describe("findCurrency", () => {
  const groups: Record<string, string[]> = {
    USD: ["usd", "USD", "$", "dollar", "dollars", "доллар", "долларов", "dollarlar", "US$", "Dollari"],
    EUR: ["eur", "€", "euro", "евро", "evro", "Euros"],
    UZS: ["uzs", "so'm", "so‘m", "som", "sum", "сум", "сўм", "so`m", "somga", "Sumlar"],
    RUB: ["rub", "₽", "руб", "рублей", "рубль", "ruble", "rubl"],
    GBP: ["gbp", "£", "pound sterling", "funt sterling"],
    JPY: ["jpy", "¥", "yen", "иена"],
    TRY: ["try", "₺", "lira", "лира", "TL"],
    AED: ["aed", "dirham", "дирхам"],
    CNY: ["cny", "yuan", "юань", "rmb"],
    KZT: ["kzt", "₸", "tenge", "тенге"],
    KGS: ["kgs", "сом"],
    UAH: ["uah", "₴", "гривна"],
    INR: ["inr", "₹", "rupee"],
    PLN: ["pln", "zł", "zloty"],
  };
  for (const [code, names] of Object.entries(groups)) {
    it(code, () => {
      for (const n of names) expect(findCurrency(n), n).toBe(code);
    });
  }
  it("knows the required ISO list", () => {
    const need = "USD EUR UZS RUB KZT TRY CNY GBP JPY AED KRW INR CHF CAD AUD KGS TJS UAH PLN SAR BRL EGP BYN AZN GEL".split(" ");
    const have = new Set(listCurrencies());
    for (const c of need) {
      expect(have.has(c), c).toBe(true);
      expect(findCurrency(c.toLowerCase()), c).toBe(c);
    }
  });
  it("rejects non-currencies and garbage", () => {
    for (const s of ["", "km", "hello", "xyz", "123", "to", "\u0000", "x".repeat(500)]) expect(findCurrency(s), s).toBeNull();
    expect(() => findCurrency(undefined as unknown as string)).not.toThrow();
  });
});

describe("convertCurrency", () => {
  const d = (s: string) => Decimal.parse(s);
  it("direct from the base", () => {
    expect(convertCurrency(d("100"), "USD", "UZS", usdRates)?.toString()).toBe("1200000");
  });
  it("to the base", () => {
    expect(convertCurrency(d("1200000"), "UZS", "USD", usdRates)?.toString()).toBe("100");
  });
  it("cross rate through the base", () => {
    expect(convertCurrency(d("90"), "RUB", "UZS", usdRates)?.toString()).toBe("12000");
    expect(convertCurrency(d("1"), "EUR", "RUB", usdRates)?.toFixed(4)).toBe("100.0000");
  });
  it("works with a UZS base", () => {
    expect(convertCurrency(d("100"), "USD", "UZS", uzsRates)?.toString()).toBe("1000000");
    expect(convertCurrency(d("100"), "USD", "EUR", uzsRates)?.toFixed(2)).toBe("90.00");
  });
  it("same currency needs no rate", () => {
    expect(convertCurrency(d("5"), "KZT", "KZT", usdRates)?.toString()).toBe("5");
  });
  it("is case-insensitive on codes", () => {
    expect(convertCurrency(d("1"), "usd", "uzs", usdRates)?.toString()).toBe("12000");
  });
  it("returns null for a missing rate", () => {
    expect(convertCurrency(d("1"), "USD", "KZT", usdRates)).toBeNull();
    expect(convertCurrency(d("1"), "KZT", "USD", usdRates)).toBeNull();
  });
  it("returns null for broken rates", () => {
    const bad: FxRates = { base: "USD", rates: { UZS: "0", EUR: "abc", RUB: "-3" }, updatedAt: 0 };
    expect(convertCurrency(d("1"), "USD", "UZS", bad)).toBeNull();
    expect(convertCurrency(d("1"), "USD", "EUR", bad)).toBeNull();
    expect(convertCurrency(d("1"), "RUB", "USD", bad)).toBeNull();
  });
  it("keeps precision for negative and tiny values", () => {
    expect(convertCurrency(d("-0.01"), "USD", "UZS", usdRates)?.toString()).toBe("-120");
  });
});
