import { describe, expect, it } from "vitest";
import { Decimal, evaluate, formatDecimal, formatLocale, type LocaleCode } from "../../src/calc";

const D = (x: string | number) => Decimal.from(x);
const f = (x: string, o = {}) => formatDecimal(D(x), o);

describe("formatDecimal", () => {
  const table: Array<[string, string, string]> = [
    // input, default output, note
    ["0", "0", "zero"],
    ["0.3", "0.3", "exact"],
    ["0.3333333333333333333333333333333333", "0.333333333333", "12 significant digits"],
    ["0.6666666666666666666666666666666667", "0.666666666667", "rounded up"],
    ["3.141592653589793238462643383279503", "3.14159265359", "pi"],
    ["1234567.891", "1 234 567.891", "grouping"],
    ["-1234567.891", "-1 234 567.891", "negative"],
    ["1000", "1 000", "4-digit group"],
    ["999", "999", "no group"],
    ["3628800", "3 628 800", "10!"],
    ["121932619.631154", "121 932 619.631", "12 significant digits"],
    ["123456789012345", "123 456 789 012 345", "15 digit integer stays exact"],
    ["1125899906842624", "1.12589990684×10^15", "2^50 is 16 digits"],
    ["1267650600228229401496703205376", "1.26765060023×10^30", "2^100"],
    ["12345678901234.5678", "12 345 678 901 235", "float above 12 digits keeps the integer part"],
    ["0.000001", "0.000001", "1e-6 stays plain"],
    ["0.0000001", "1×10^-7", "1e-7 is scientific"],
    ["0.000000123456", "1.23456×10^-7", "small"],
    ["-0.00000000012345678901234", "-1.23456789012×10^-10", "negative small"],
    ["1e25", "1×10^25", "exact power of ten"],
    ["1.23e25", "1.23×10^25", "spec example"],
    ["-4.5e100", "-4.5×10^100", "negative big"],
    ["0.1", "0.1", "0.1"],
    ["100", "100", "100"],
  ];
  it.each(table)("%s -> %s (%s)", (input, out) => {
    expect(f(input)).toBe(out);
  });

  it("0.1+0.2 and 1/3 as evaluated", () => {
    const a = evaluate("0.1+0.2");
    const b = evaluate("1/3");
    expect(a.ok && formatDecimal(a.value)).toBe("0.3");
    expect(b.ok && formatDecimal(b.value)).toBe("0.333333333333");
  });

  it("options: separators, significant, maxFraction, sci style", () => {
    expect(f("1234567.891", { groupSep: ",", decimalSep: "." })).toBe("1,234,567.891");
    expect(f("1234567.891", { groupSep: "", decimalSep: "," })).toBe("1234567,891");
    expect(f("1234567.891", { groupSep: ".", decimalSep: "," })).toBe("1.234.567,891");
    expect(f("3.14159265", { significant: 4 })).toBe("3.142");
    expect(f("3.14159265", { maxFraction: 2 })).toBe("3.14");
    expect(f("2.999", { maxFraction: 2 })).toBe("3");
    expect(f("0.001", { maxFraction: 2 })).toBe("0");
    expect(f("-0.001", { maxFraction: 2 })).toBe("0");
    expect(f("1.5e30", { sciStyle: "e" })).toBe("1.5e30");
    expect(f("1.5e30", { decimalSep: "," })).toBe("1,5×10^30");
    expect(f("1e12", { sciUpper: 12 })).toBe("1×10^12");
    expect(f("0.00001", { sciLower: -3 })).toBe("1×10^-5");
    expect(f("1234567", { groupSize: 2, groupSep: "'" })).toBe("1'23'45'67");
  });
});

describe("formatLocale", () => {
  const cases: Array<[LocaleCode, string]> = [
    ["uz-latn", "1 234 567,89"],
    ["uz-cyrl", "1 234 567,89"],
    ["ru", "1 234 567,89"],
    ["en", "1,234,567.89"],
    ["tr", "1.234.567,89"],
    ["es", "1.234.567,89"],
    ["ar", "1,234,567.89"],
  ];
  it.each(cases)("%s", (lang, out) => {
    expect(formatLocale(D("1234567.89"), lang)).toBe(out);
  });
  it("returns an options preset when called with a language only", () => {
    expect(formatLocale("tr")).toEqual({ groupSep: ".", decimalSep: "," });
    expect(formatDecimal(D("1234.5"), formatLocale("en"))).toBe("1,234.5");
  });
  it("uses Western digits for Arabic and keeps scientific form readable", () => {
    const s = formatLocale(D("-1234567.5"), "ar");
    expect(s).toBe("-1,234,567.5");
    expect(/^[\x20-\x7E]+$/.test(s)).toBe(true);
    expect(formatLocale(D("1.5e30"), "ru")).toBe("1,5×10^30");
  });
  it("falls back to en for unknown languages", () => {
    expect(formatLocale(D("1234.5"), "xx" as LocaleCode)).toBe("1,234.5");
  });
});
