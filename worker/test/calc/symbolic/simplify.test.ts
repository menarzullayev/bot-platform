import { describe, expect, it } from "vitest";
import { Decimal, parse, simplify, toText, type Ast } from "../../../src/calc";
import { close, fn, points } from "./util";

const s = (e: string): string => toText(simplify(e));

describe("simplify", () => {
  it("collects like terms and folds constants", () => {
    expect(s("x^2+2x+x^2")).toBe("2x² + 2x");
    expect(s("2+3*4-5")).toBe("9");
    expect(s("x+x+x")).toBe("3x");
    expect(s("3x/6")).toBe("x/2");
    expect(s("0.5x")).toBe("x/2");
    expect(s("1/3+1/6")).toBe("1/2");
    expect(s("x-x")).toBe("0");
    expect(s("2x-3x")).toBe("−x");
  });
  it("0 and 1 rules", () => {
    expect(s("x*1")).toBe("x");
    expect(s("1*x^1")).toBe("x");
    expect(s("0*x+5")).toBe("5");
    expect(s("x^0")).toBe("1");
    expect(s("0^3")).toBe("0");
    expect(s("x+0")).toBe("x");
    expect(s("e^0")).toBe("1");
    expect(s("ln(1)")).toBe("0");
    expect(s("sin(0)+cos(0)")).toBe("1");
  });
  it("expands polynomial products and sums of powers", () => {
    expect(s("(x+1)(x+2)")).toBe("x² + 3x + 2");
    expect(s("x*(x+1)")).toBe("x² + x");
    expect(s("2(x+3)")).toBe("2x + 6");
    expect(s("(x+1)(x-1)")).toBe("x² − 1");
    expect(toText(simplify("(x+1)^3", { expand: true }))).toBe("x³ + 3x² + 3x + 1");
    expect(toText(simplify("(a+b)^2", { expand: true }))).toBe("a² + 2ab + b²");
  });
  it("keeps factored powers and denominators compact", () => {
    expect(s("(x+1)^2")).toBe("(x + 1)²");
    expect(s("(x^2+1)/x")).toBe("(x² + 1)/x");
    expect(s("x/(x+1)^2")).toBe("x/(x + 1)²");
    expect(s("2x*(x^2+1)^2")).toBe("2x(x² + 1)²");
  });
  it("powers and roots", () => {
    expect(s("x^3/x")).toBe("x²");
    expect(s("sqrt(x)*x")).toBe("x^(3/2)");
    expect(s("x^(1/3)*x^(1/6)")).toBe("√x");
    expect(s("sqrt(8)")).toBe("2√2");
    expect(s("sqrt(12)+sqrt(3)")).toBe("3√3");
    expect(s("sqrt(2)*sqrt(8)")).toBe("4");
    expect(s("1/sqrt(2)")).toBe("√2/2");
    expect(s("(x^2)^(1/2)")).toBe("|x|");
    expect(s("sqrt(1/4)")).toBe("1/2");
    expect(s("2^10")).toBe("1024");
    expect(s("(2/3)^2")).toBe("4/9");
    expect(s("4^(1/2)")).toBe("2");
    expect(s("8^(1/3)")).toBe("2");
  });
  it("exponentials and logarithms", () => {
    expect(s("e^x*e^x")).toBe("e^(2x)");
    expect(s("exp(x)/e^x")).toBe("1");
    expect(s("ln(e^2)")).toBe("2");
    expect(s("e^(ln(x))")).toBe("x");
    expect(s("ln(e)")).toBe("1");
    expect(s("exp(0)")).toBe("1");
  });
  it("exact trigonometric values", () => {
    expect(s("sin(pi/6)")).toBe("1/2");
    expect(s("cos(pi/3)")).toBe("1/2");
    expect(s("tan(pi/4)")).toBe("1");
    expect(s("sin(pi/4)")).toBe("√2/2");
    expect(s("cos(pi)")).toBe("−1");
    expect(s("sin(pi)")).toBe("0");
    expect(s("sin(pi/3)")).toBe("√3/2");
    expect(s("cos(2*pi)")).toBe("1");
    expect(s("sin(-x)")).toBe("−sin(x)");
    expect(s("cos(-x)")).toBe("cos(x)");
    expect(s("abs(-x)")).toBe("|x|");
  });
  it("parser quirks: function without parentheses, implicit multiplication, unicode", () => {
    expect(s("sin x")).toBe("sin(x)");
    expect(s("2x")).toBe("2x");
    expect(s("x(x+1)")).toBe("x² + x");
    expect(s("a b c")).toBe("abc");
    expect(s("√x")).toBe("√x");
    expect(s("2 × 3 ÷ 4")).toBe("3/2");
  });
  it("unchanged on failure", () => {
    const bad = parse("1/0");
    expect(simplify(bad)).toBe(bad);
    const unk = parse("f(x)");
    expect(simplify(unk)).toBe(unk);
  });
  it("is idempotent", () => {
    for (const e of ["(x+1)^2*(x-3)", "x/(x+1)+1/x", "2x^3-4x^2+x/3", "sin(x)^2*cos(x)/x", "e^(2x)*x^2", "(x^2+1)^(3/2)", "sqrt(x+1)*x"]) {
      const once = simplify(e);
      expect(toText(simplify(once)), e).toBe(toText(once));
    }
  });
  it("preserves the value (random expressions, numeric check)", () => {
    const exprs = [
      "(x+1)(x+2)(x-3)",
      "x/(x+1)+1/x",
      "(x^2-1)/(x-1)",
      "sqrt(x)*x^2/sqrt(x^3)",
      "(2x+1)^2-(2x-1)^2",
      "e^(2x)*e^(-x)/x",
      "sin(x)^2+cos(x)^2+x",
      "x^3/(x^2+1)-x",
      "(x+2)^3/(x+2)",
      "2^x*3^x/6^x",
      "ln(x^2)+ln(x)",
      "(1/2)x+(3/4)x-x/8",
      "0.25*x^2+0.75*x^2",
    ];
    for (const e of exprs) {
      const a = fn(e);
      const b = fn(simplify(e));
      for (const x of points(0.3, 4, 6)) {
        const u = a(x);
        const v = b(x);
        if (Number.isFinite(u) && Number.isFinite(v)) expect(close(u, v, 1e-9), `${e} at ${x}: ${u} vs ${v}`).toBe(true);
      }
    }
  });
});

describe("toText", () => {
  const t = (e: string | Ast): string => toText(typeof e === "string" ? parse(e) : e);
  it("unicode forms", () => {
    expect(t("x^2")).toBe("x²");
    expect(t("x^12")).toBe("x¹²");
    expect(t("x^-1")).toBe("x⁻¹");
    expect(t("sqrt(x)")).toBe("√x");
    expect(t("sqrt(x+1)")).toBe("√(x + 1)");
    expect(t("2*x")).toBe("2x");
    expect(t("2*3")).toBe("2 × 3");
    expect(t("x/y")).toBe("x/y");
    expect(t("pi*r^2")).toBe("πr²");
    expect(t("abs(x)")).toBe("|x|");
    expect(t("ln(abs(x))")).toBe("ln|x|");
    expect(t("log10(x)")).toBe("log₁₀(x)");
    expect(t("5!")).toBe("5!");
    expect(t("5%")).toBe("5%");
    expect(t("a-b")).toBe("a − b");
  });
  it("minimal parentheses", () => {
    expect(t("(x+1)*2")).toBe("(x + 1) × 2");
    expect(t("2*(x+1)")).toBe("2(x + 1)");
    expect(t("(x+1)/(x-1)")).toBe("(x + 1)/(x − 1)");
    expect(t("1/(2x)")).toBe("1/(2x)");
    expect(t("(a-b)-(c-d)")).toBe("a − b − (c − d)");
    expect(t("a-(b+c)")).toBe("a − (b + c)");
    expect(t("(a+b)^2")).toBe("(a + b)²");
    expect(t("(-x)^2")).toBe("(−x)²");
    expect(t("-(x+1)")).toBe("−(x + 1)");
    expect(t("2^(x+1)")).toBe("2^(x + 1)");
    expect(t("e^(-x)")).toBe("e^(−x)");
    expect(t("(2^3)^2")).toBe("(2³)²");
    expect(t("2^3^2")).toBe("2^(3²)");
  });
  it("ascii mode re-parses to the same value", () => {
    for (const e of ["x^2+2x+1", "sqrt(x+1)/(x-1)", "pi*r^2", "e^(-x^2)", "sin(x)^2*cos(x)", "(a+b)(a-b)", "x^(1/3)", "2^x*3"]) {
      const ast = simplify(e);
      const back = parse(toText(ast, { ascii: true }));
      const a = fn(ast, "x");
      const b = fn(back, "x");
      for (const x of points(0.5, 3, 4)) {
        const u = a(x);
        const v = b(x);
        if (Number.isFinite(u) && Number.isFinite(v)) expect(close(u, v, 1e-12), e).toBe(true);
      }
    }
  });
  it("digits option rounds numbers", () => {
    expect(toText(parse("1/3"))).toBe("1/3");
    const n = { type: "num", value: Decimal.parse("0.3333333333333333333"), raw: "", pos: 0, end: 0 } as Ast;
    expect(toText(n, { digits: 4 })).toBe("0.3333");
    expect(toText(n)).toBe("0.3333333333333333333");
  });
  it("never throws on malformed ASTs", () => {
    expect(typeof toText(null as never)).toBe("string");
    expect(typeof toText({ type: "nonsense" } as never)).toBe("string");
  });
});
