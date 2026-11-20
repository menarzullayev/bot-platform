import { describe, expect, it } from "vitest";
import { CalcError, Decimal } from "../../src/calc";

const D = (x: string | number | bigint) => Decimal.from(x);

function code(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    return (e as CalcError).code;
  }
  return "none";
}

describe("Decimal basics", () => {
  it("parses and prints in plain notation, never with an exponent", () => {
    expect(D("1e3").toString()).toBe("1000");
    expect(D("1.5e-3").toString()).toBe("0.0015");
    expect(D("-0.000").toString()).toBe("0");
    expect(D("007.50").toString()).toBe("7.5");
    expect(D(1e21).toString()).toBe("1000000000000000000000");
    expect(D(1e-7).toString()).toBe("0.0000001");
    expect(D(123n).toString()).toBe("123");
    expect(D(".5").toString()).toBe("0.5");
  });

  it("rejects garbage", () => {
    expect(() => D("abc")).toThrow(CalcError);
    expect(() => D("")).toThrow(CalcError);
    expect(() => D(NaN)).toThrow(CalcError);
    expect(() => D(Infinity)).toThrow(CalcError);
  });

  it("adds and subtracts exactly (0.1 + 0.2 = 0.3)", () => {
    expect(D("0.1").add(D("0.2")).toString()).toBe("0.3");
    expect(D("0.3").sub(D("0.1")).toString()).toBe("0.2");
    expect(D("1e30").add(D("1")).toString()).toBe("1000000000000000000000000000001");
    expect(D("5").sub(D("5")).isZero()).toBe(true);
  });

  it("multiplies exactly", () => {
    expect(D("12345.678").mul(D("9876.543")).toString()).toBe("121932619.631154");
    expect(D("-2").mul(D("0.5")).toString()).toBe("-1");
    expect(D("0").mul(D("999")).toString()).toBe("0");
  });

  it("divides to the working precision, with correct rounding", () => {
    expect(D(1).div(D(3)).toString()).toBe("0.3333333333333333333333333333333333");
    expect(D(2).div(D(3)).toString()).toBe("0.6666666666666666666666666666666667");
    expect(D(1).div(D(4)).toString()).toBe("0.25");
    expect(D(-1).div(D(3), 10).toString()).toBe("-0.3333333333");
    expect(D(1).div(D(7), 20).toString()).toBe("0.14285714285714285714");
    expect(D("1e100").div(D("1e-100")).toString()).toBe("1" + "0".repeat(200));
    expect(() => D(1).div(Decimal.ZERO)).toThrow(/division by zero/);
  });

  it("compares", () => {
    expect(D("0.1").cmp(D("0.10"))).toBe(0);
    expect(D("-5").lt(D("3"))).toBe(true);
    expect(D("1e50").gt(D("9e49"))).toBe(true);
    expect(D("-1e50").lt(D("-9e49"))).toBe(true);
    expect(D("2").gte(D("2"))).toBe(true);
    expect(D("0.001").lte(D("0.01"))).toBe(true);
    expect(D(3).eq(D("3.000"))).toBe(true);
    expect(D(0).sign()).toBe(0);
    expect(D(-9).sign()).toBe(-1);
  });

  it("detects integers", () => {
    expect(D("1000").isInteger()).toBe(true);
    expect(D("1.5").isInteger()).toBe(false);
    expect(D("2.0").isInteger()).toBe(true);
  });
});

describe("Decimal rounding", () => {
  it("round modes", () => {
    expect(D("2.5").round(0, "half-up").toString()).toBe("3");
    expect(D("2.5").round(0, "half-even").toString()).toBe("2");
    expect(D("3.5").round(0, "half-even").toString()).toBe("4");
    expect(D("-2.5").round(0, "half-up").toString()).toBe("-3");
    expect(D("2.9").round(0, "down").toString()).toBe("2");
    expect(D("-2.1").round(0, "up").toString()).toBe("-3");
    expect(D("1.005").round(2).toString()).toBe("1.01");
    expect(D("1234.5678").round(-2).toString()).toBe("1200");
  });
  it("floor / ceil / trunc", () => {
    expect(D("-2.5").floor().toString()).toBe("-3");
    expect(D("-2.5").ceil().toString()).toBe("-2");
    expect(D("-2.5").trunc().toString()).toBe("-2");
    expect(D("2.5").floor().toString()).toBe("2");
    expect(D("2.1").ceil().toString()).toBe("3");
  });
  it("toFixed / toSignificant / toNumber", () => {
    expect(D("3.14159").toFixed(2)).toBe("3.14");
    expect(D("3").toFixed(3)).toBe("3.000");
    expect(D("-0.0001").toFixed(2)).toBe("0.00");
    expect(D("0.5").toFixed(0)).toBe("1");
    expect(D("123456").toSignificant(3)).toBe("123000");
    expect(D("0.000123456").toSignificant(2)).toBe("0.00012");
    expect(D("1.5").toNumber()).toBe(1.5);
  });
});

describe("Decimal powers and roots", () => {
  it("integer powers are exact", () => {
    expect(D(2).pow(D(100)).toString()).toBe("1267650600228229401496703205376");
    expect(D("1.1").pow(D(3)).toString()).toBe("1.331");
    expect(D(10).pow(D(-3)).toString()).toBe("0.001");
    expect(D(-2).pow(D(3)).toString()).toBe("-8");
    expect(D(0).pow(D(0)).toString()).toBe("1");
    expect(D(2).pow(D(-2)).toString()).toBe("0.25");
    expect(D(10).pow(D(5000)).exponent).toBe(5000);
  });
  it("fractional base to a large integer power stays bounded", () => {
    const r = D(1).div(D(3)).pow(D(100));
    expect(r.nd).toBeLessThanOrEqual(34);
    expect(r.exponent).toBe(-48);
    expect(r.toSignificant(10)).toBe("0." + "0".repeat(47) + "1940325217");
  });
  it("fractional powers", () => {
    expect(D(2).pow(D("0.5")).toString()).toBe("1.414213562373095048801688724209698");
    expect(D(2).pow(D("0.25")).toString()).toBe("1.189207115002721066717499970560476");
    expect(D(2).pow(D("1.5")).toString()).toBe("2.828427124746190097603377448419396");
    expect(D(10).pow(D("0.3")).toString()).toBe("1.995262314968879601352455396739536");
    expect(D(4).pow(D("0.5")).toString()).toBe("2");
  });
  it("sqrt / cbrt", () => {
    expect(D(144).sqrt().toString()).toBe("12");
    expect(D("0.25").sqrt().toString()).toBe("0.5");
    expect(D(2).sqrt().toString()).toBe("1.414213562373095048801688724209698");
    expect(D("1e-100").sqrt().toString()).toBe("0." + "0".repeat(49) + "1");
    expect(D(27).cbrt().toString()).toBe("3");
    expect(D(-27).cbrt().toString()).toBe("-3");
    expect(D(2).cbrt().toString()).toBe("1.259921049894873164767210607278228");
    expect(() => D(-1).sqrt()).toThrow(/negative/);
  });
  it("mod is floored", () => {
    expect(D(50).mod(D(7)).toString()).toBe("1");
    expect(D(-7).mod(D(3)).toString()).toBe("2");
    expect(D(7).mod(D(-3)).toString()).toBe("-2");
    expect(D("5.5").mod(D("2")).toString()).toBe("1.5");
    expect(() => D(1).mod(D(0))).toThrow(CalcError);
  });
});

describe("Decimal guards", () => {
  it("throws overflow for huge results", () => {
    expect(code(() => D(2).pow(D(100000)))).toBe("overflow");
    expect(code(() => D(2).pow(D(10001)))).toBe("overflow");
    expect(code(() => D(3).pow(D(5000)))).toBe("overflow"); // 2386 digits > 2000
    expect(code(() => D(10).pow(D(10001)))).toBe("overflow");
    expect(code(() => D("1e10001"))).toBe("overflow");
    expect(code(() => D("1" + "7".repeat(2100)))).toBe("overflow");
    expect(code(() => D(7).pow(D("0.5")).pow(D(10)))).toBe("none");
  });
  it("precision is configurable per call", () => {
    expect(D(1).div(D(3), 5).toString()).toBe("0.33333");
    expect(D(2).sqrt(50).nd).toBe(50);
  });
  it("is canonical", () => {
    expect(D("1.50").s).toBe(1);
    expect(D("100").m).toBe(1n);
  });
});
