import { describe, expect, it } from "vitest";
import { derivative, parseExpression, simplify, toText } from "../../../src/calc";
import { close, fn, numDiff, points } from "./util";

// [expression, lo, hi] - the derivative is compared with a central difference at random points of (lo, hi).
const TABLE: Array<[string, number, number]> = [
  ["5", -3, 3],
  ["x", -3, 3],
  ["x^2", -3, 3],
  ["x^3+2x", -3, 3],
  ["3x^4-2x^2+x-7", -3, 3],
  ["x^(1/2)", 0.2, 4],
  ["1/x", 0.2, 4],
  ["1/x^2", 0.2, 4],
  ["x^-3", 0.2, 4],
  ["sqrt(x)", 0.2, 4],
  ["cbrt(x)", 0.2, 4],
  ["x^(2/3)", 0.2, 4],
  ["x^pi", 0.2, 4],
  ["(2x+1)^5", -1, 1],
  ["(x^2+1)^3", -2, 2],
  ["1/(x^2+1)", -2, 2],
  ["sqrt(x^2+1)", -2, 2],
  ["1/sqrt(x)", 0.2, 4],
  ["x sin(x)", -3, 3],
  ["x^2 e^x", -3, 3],
  ["e^x cos(x)", -3, 3],
  ["x ln(x)", 0.2, 4],
  ["sin(x) cos(x)", -3, 3],
  ["x^2 sin(x) cos(x)", -3, 3],
  ["x e^x sin(x)", -2, 2],
  ["x/(x+1)", 0.2, 4],
  ["sin(x)/x", 0.3, 4],
  ["(x^2+1)/(x-1)", 1.3, 4],
  ["e^x/x", 0.3, 4],
  ["ln(x)/x^2", 0.3, 4],
  ["tan(x)/x", 0.2, 1.3],
  ["sin(x)", -3, 3],
  ["cos(x)", -3, 3],
  ["tan(x)", -1.2, 1.2],
  ["cot(x)", 0.2, 2.9],
  ["sec(x)", -1.2, 1.2],
  ["csc(x)", 0.2, 2.9],
  ["sin(3x)", -3, 3],
  ["cos(x^2)", -2, 2],
  ["tan(2x+1)", -0.5, 0.2],
  ["sin(x)^2", -3, 3],
  ["cos(x)^3", -3, 3],
  ["sin(cos(x))", -3, 3],
  ["asin(x)", -0.9, 0.9],
  ["acos(2x)", -0.4, 0.4],
  ["atan(x^2)", -3, 3],
  ["arctan(3x)", -3, 3],
  ["sinh(x)", -2, 2],
  ["cosh(x)", -2, 2],
  ["tanh(2x)", -2, 2],
  ["sinh(x) cosh(x)", -2, 2],
  ["e^x", -3, 3],
  ["e^(2x)", -2, 2],
  ["e^(x^2)", -2, 2],
  ["exp(sin(x))", -3, 3],
  ["2^x", -3, 3],
  ["3^(x^2)", -2, 2],
  ["x^x", 0.2, 3],
  ["x^(2x)", 0.2, 2],
  ["ln(x)", 0.2, 4],
  ["ln(2x+1)", 0, 4],
  ["ln(x^2+1)", -3, 3],
  ["log(x)", 0.2, 4],
  ["log2(x)", 0.2, 4],
  ["log10(3x)", 0.2, 4],
  ["log(x, 3)", 0.2, 4],
  ["abs(x)", 0.2, 3],
  ["abs(x^2-1)", 1.2, 3],
  ["sin(e^x)", -2, 2],
  ["ln(sin(x))", 0.2, 2.9],
  ["sqrt(sin(x))", 0.2, 2.9],
  ["e^(sin(x)^2)", -3, 3],
  ["sin x", -3, 3],
  ["x(x+1)", -3, 3],
  ["2x e^(-x)", -2, 3],
  ["pi x^2", -3, 3],
  ["sin(x)^2 + cos(x)^2", -3, 3],
  ["(x+1)(x+2)(x+3)", -3, 3],
  ["x^3 / (1 + x^2)", -3, 3],
];

describe("derivative: table checked numerically", () => {
  it("has 60+ cases", () => expect(TABLE.length).toBeGreaterThanOrEqual(60));
  for (const [expr, lo, hi] of TABLE) {
    it(`d/dx ${expr}`, () => {
      const r = derivative(expr);
      expect(r.ok, JSON.stringify(r)).toBe(true);
      if (!r.ok) return;
      const f = fn(expr);
      const g = fn(r.result);
      let checked = 0;
      for (const x of points(lo, hi, 9)) {
        const d = numDiff(f, x);
        const v = g(x);
        if (!Number.isFinite(d) || !Number.isFinite(v)) continue;
        checked++;
        expect(close(v, d, 2e-5), `${expr} at x=${x}: ${v} vs ${d}`).toBe(true);
      }
      expect(checked).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("derivative: exact forms and steps", () => {
  const text = (s: string): string => {
    const r = derivative(s);
    if (!r.ok) throw new Error(`${s}: ${r.error}`);
    return r.text;
  };
  it("polynomials", () => {
    expect(text("x^3")).toBe("3x²");
    expect(text("x^3+2x")).toBe("3x² + 2");
    expect(text("5")).toBe("0");
    expect(text("x")).toBe("1");
    expect(text("3x^2-4x+1")).toBe("6x − 4");
  });
  it("standard functions", () => {
    expect(text("sin(x)")).toBe("cos(x)");
    expect(text("cos(x)")).toBe("−sin(x)");
    expect(text("e^x")).toBe("e^x");
    expect(text("ln(x)")).toBe("1/x");
    expect(text("sqrt(x)")).toBe("1/(2√x)");
    expect(text("e^(2x)")).toBe("2e^(2x)");
  });
  it("chain, product and quotient rules appear in the trace", () => {
    const rules = (s: string): string[] => {
      const r = derivative(s);
      return r.ok ? r.steps.map((st) => st.rule) : [];
    };
    expect(rules("sin(2x+1)")).toContain("chain");
    expect(rules("x sin(x)")).toContain("product");
    expect(rules("sin(x)/x")).toContain("quotient");
    expect(rules("x^3+x")).toContain("sum");
    expect(rules("5x")).toContain("const_mult");
    expect(rules("x^3")).toContain("power");
    expect(rules("sin(x)")).toContain("trig");
    expect(rules("atan(x)")).toContain("invtrig");
    expect(rules("sinh(x)")).toContain("hyper");
    expect(rules("2^x")).toContain("exp");
    expect(rules("ln(x)")).toContain("log");
    expect(rules("abs(x)")).toContain("abs");
    expect(rules("7")).toContain("const");
  });
  it("steps carry readable text", () => {
    const r = derivative("sin(2x)");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps[0].before).toBe("(sin(2x))′");
    expect(r.steps[0].after).toBe("2cos(2x)");
    expect(r.steps[0].note).toBe("u = 2x");
  });
  it("other variable and constants", () => {
    const r = derivative("a*x^2 + b*x + c", "x");
    expect(r.ok && r.text).toBe("2ax + b");
    const t = derivative("t^2 * y", "t");
    expect(t.ok && t.text).toBe("2ty");
    const z = derivative("y^3", "x");
    expect(z.ok && z.text).toBe("0");
  });
  it("accepts a parsed AST", () => {
    const r = derivative(parseExpression("x^2"));
    expect(r.ok && r.text).toBe("2x");
  });
  it("result is simplified and re-parsable", () => {
    const r = derivative("(x^2+1)^3");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const again = simplify(parseExpression(toText(r.result, { ascii: true })));
    expect(toText(again)).toBe(toText(r.result));
  });
});
