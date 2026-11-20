import { describe, expect, it } from "vitest";
import {
  autoRange,
  definiteIntegral,
  derivative,
  explainArithmetic,
  integrate,
  renderSteps,
  sampleFunction,
  simplify,
  solveEquation,
  solveSystem,
  toText,
} from "../../../src/calc";
import { rng } from "./util";

describe("edge cases", () => {
  it("division by zero", () => {
    for (const e of ["1/0", "x/0", "(x+1)/(x-x)", "1/(2-2)"]) {
      const d = derivative(e);
      expect(d.ok, e).toBe(false);
      if (!d.ok) expect(d.error, e).toBe("div_zero");
      const i = integrate(e);
      expect(i.ok, e).toBe(false);
      if (!i.ok) expect(i.error, e).toBe("div_zero");
    }
    const a = explainArithmetic("10/(5-5)");
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error).toBe("div_zero");
    expect(solveEquation("1/0=x").ok).toBe(false);
    expect(definiteIntegral("1/0", 0, 1).ok).toBe(false);
  });
  it("unknown functions", () => {
    for (const e of ["f(x)", "foo(x)", "g(x)+1", "sin(x)*bar(x)", "zeta(x)"]) {
      const d = derivative(e);
      expect(d.ok, e).toBe(false);
      if (!d.ok) expect(d.error, e).toBe("unknown_function");
      const i = integrate(e);
      expect(i.ok, e).toBe(false);
      if (!i.ok) expect(i.error, e).toBe("unknown_function");
    }
    // functions known to the calculator but without a derivative rule
    const g = derivative("gcd(x, 4)");
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.error).toBe("unsupported");
    const f = derivative("floor(x)");
    expect(f.ok).toBe(false);
    const fact = derivative("x!");
    expect(fact.ok).toBe(false);
  });
  it("very large expressions are rejected quickly with too_complex", () => {
    const big = Array.from({ length: 120 }, (_, i) => `x^${i + 2}`).join("+");
    for (const fn of [
      () => derivative(big),
      () => integrate(big),
      () => simplify(big),
      () => solveEquation(big + "=0"),
      () => explainArithmetic(Array.from({ length: 150 }, () => "1").join("+")),
    ]) {
      const t0 = performance.now();
      const r = fn();
      const dt = performance.now() - t0;
      if ("ok" in r) {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("too_complex");
      }
      expect(dt).toBeLessThan(50);
    }
    // exactly at the limit is accepted: 199 nodes = 100 terms of x joined by 99 '+' (100 + 99)
    const ok = Array.from({ length: 100 }, () => "x").join("+");
    expect(derivative(ok).ok).toBe(true);
    const tooMany = Array.from({ length: 101 }, () => "x").join("+");
    const r = derivative(tooMany);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("too_complex");
  });
  it("expression blow-up is bounded (work budget)", () => {
    const e = "((a+b+c+d)^2+(e+f+g+h)^2+(i+j+k+l)^2)^3 * ((m+n+o+p)^5)^2";
    const t0 = performance.now();
    const r = simplify(e, { expand: true });
    expect(performance.now() - t0).toBeLessThan(500);
    expect(r).toBeTruthy();
    const d = derivative("(x+1)^50*(x+2)^50*(x+3)^50");
    expect(d.ok || d.error === "too_complex").toBe(true);
  });
  it("huge numbers do not crash", () => {
    const r = derivative("x^1000000");
    expect(r.ok || r.error === "too_complex").toBe(true);
    const s = simplify("2^1000+x");
    expect(typeof toText(s)).toBe("string");
    const a = explainArithmetic("9^9^9");
    expect(a.ok).toBe(false);
  });
  it("syntax errors are parse errors", () => {
    for (const e of ["", "x+", "(x", "x)", "2**", "1 2", "@"]) {
      const d = derivative(e);
      expect(d.ok, e).toBe(false);
      if (!d.ok) expect(d.error, e).toBe("parse");
    }
  });
  it("wrong argument counts", () => {
    for (const e of ["sin(x, 2)", "ln()", "sqrt(1,2)"]) {
      expect(derivative(e).ok, e).toBe(false);
    }
  });
  it("assignments are not supported", () => {
    const r = derivative({ type: "assign", name: "y", value: { type: "ident", name: "x", pos: 0, end: 1 }, pos: 0, end: 3 });
    expect(r.ok).toBe(false);
  });
  it("derivative with respect to a variable that does not occur is 0", () => {
    const r = derivative("5x^2", "y");
    expect(r.ok && r.text).toBe("0");
  });
  it("domain: ln of a negative constant is reported", () => {
    const r = derivative("ln(-1)+x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("domain");
  });
});

const ALPHABET = ["x", "y", "1", "2", "0.5", "+", "-", "*", "/", "^", "(", ")", "sin", "cos", "ln", "sqrt", "e", "pi", "=", ",", " ", "!", "%", "abs", "foo", "mod", "²", "√", "e^x", "x^2", "1/x", ".", "ln(x)"];

describe("fuzz: nothing throws, every call returns a well-formed result", () => {
  it("random expression strings through every entry point", () => {
    const r = rng(20261120);
    for (let n = 0; n < 600; n++) {
      const len = 1 + Math.floor(r() * 12);
      let s = "";
      for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(r() * ALPHABET.length)];
      const results = [
        derivative(s),
        integrate(s),
        definiteIntegral(s, 0, 1),
        solveEquation(s),
        solveSystem([s, "x+y=1"]),
        explainArithmetic(s),
      ];
      for (const res of results) {
        expect(typeof res.ok, s).toBe("boolean");
        if (!res.ok) {
          expect(typeof res.error, s).toBe("string");
        } else if ("steps" in res) {
          expect(Array.isArray(res.steps), s).toBe(true);
          // rendering never throws either
          expect(typeof renderSteps(res.steps, "en"), s).toBe("string");
        }
      }
      expect(typeof toText(simplify(s)), s).toBe("string");
      const sf = sampleFunction(simplify(s), -1, 1, 20);
      expect(Array.isArray(sf.points), s).toBe(true);
      expect(autoRange(sf.points).min).toBeLessThanOrEqual(autoRange(sf.points).max);
    }
  });
  it("garbage arguments", () => {
    expect(derivative(undefined as never).ok).toBe(false);
    expect(integrate(null as never).ok).toBe(false);
    expect(solveEquation(42 as never).ok).toBe(false);
    expect(solveSystem(null as never).ok).toBe(false);
    expect(explainArithmetic({} as never).ok).toBe(false);
    expect(definiteIntegral("x", {} as never, 1).ok).toBe(false);
    expect(definiteIntegral("x", 0, Infinity).ok).toBe(false);
    expect(solveSystem(["x+y=1", "x-y=1"], ["x"] as never).ok).toBe(false);
  });
});
