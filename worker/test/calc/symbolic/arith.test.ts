import { describe, expect, it } from "vitest";
import { evaluate, explainArithmetic } from "../../../src/calc";

function steps(expr: string, opts = {}) {
  const r = explainArithmetic(expr, opts);
  if (!r.ok) throw new Error(`${expr}: ${r.error} ${r.message ?? ""}`);
  return r;
}

describe("explainArithmetic", () => {
  it("follows the order of operations", () => {
    const r = steps("2+3*4");
    expect(r.result).toBe("14");
    expect(r.steps.map((s) => s.after)).toEqual(["2 + 12", "14"]);
    expect(r.steps[0].before).toBe("2 + 3 × 4");
    expect(r.steps[0].note).toBe("3 × 4 = 12");
    expect(r.steps.every((s) => s.rule === "arith")).toBe(true);
  });
  it("parentheses first, then powers, then ×÷, then +−", () => {
    const r = steps("2+3*(4+5)^2-10/4");
    expect(r.steps.map((s) => s.after)).toEqual([
      "2 + 3 × 9² − 10 ÷ 4",
      "2 + 3 × 81 − 10 ÷ 4",
      "2 + 243 − 2.5",
      "245 − 2.5",
      "242.5",
    ]);
    expect(r.result).toBe("242.5");
  });
  it("matches the calculator on random expressions", () => {
    const exprs = [
      "(1+2)*(3+4)",
      "100/4/5",
      "2^3^2",
      "-2^2",
      "(-2)^2",
      "10-2-3",
      "8/2*(2+2)",
      "sqrt(16)+2*3",
      "5!/(2+3)",
      "17 mod 5 + 2",
      "1/3+1/6",
      "3*(2+(4-1)*2)",
      "abs(-7)*2-1",
      "2*pi",
      "200+15%",
      "15% of 200",
      "1.5*4-0.5",
      "((2+3)*(4+5))/9",
    ];
    for (const e of exprs) {
      const r = steps(e, { maxSteps: 30 });
      const ev = evaluate(e);
      expect(ev.ok, e).toBe(true);
      if (!ev.ok) continue;
      expect(Math.abs(Number(r.value) - Number(ev.value.toString())) / (1 + Math.abs(Number(ev.value.toString()))), e).toBeLessThan(1e-12);
    }
  });
  it("each step is one operation group and the text strictly shrinks or stays", () => {
    const r = steps("(1+2)*(3+4)-5*(6-1)");
    for (const s of r.steps) expect(s.before).not.toBe(s.after);
    expect(r.steps[r.steps.length - 1].after).toBe(r.result);
  });
  it("limits the number of steps (default 12) and still ends with the value", () => {
    const expr = Array.from({ length: 30 }, (_, i) => `(${i + 1}+1)`).join("+");
    const r = steps(expr);
    expect(r.steps.length).toBeLessThanOrEqual(12);
    expect(r.steps[r.steps.length - 1].after).toBe(r.result);
    expect(r.result).toBe("495");
    const short = steps(expr, { maxSteps: 3 });
    expect(short.steps.length).toBe(3);
    expect(short.steps[2].after).toBe("495");
  });
  it("constants are replaced in the first step", () => {
    const r = steps("2*pi+e");
    expect(r.steps[0].note).toContain("π");
    expect(r.approx).toBe(true);
  });
  it("percent and unary minus", () => {
    expect(steps("200+15%").result).toBe("230");
    expect(steps("-3*-2").result).toBe("6");
    expect(steps("-(2+3)").result).toBe("-5");
  });
  it("long decimals are rounded for display", () => {
    const r = steps("1/3+1/3", { digits: 8 });
    expect(r.approx).toBe(true);
    expect(r.result).toBe("0.66666667");
    expect(steps("0.1+0.2").approx).toBe(false);
    expect(steps("0.1+0.2").result).toBe("0.3");
  });
  it("a single number needs no steps", () => {
    const r = steps("42");
    expect(r.steps).toEqual([]);
    expect(r.result).toBe("42");
  });
  it("errors", () => {
    for (const [e, code] of [
      ["1/0", "div_zero"],
      ["5+2/(3-3)", "div_zero"],
      ["sqrt(-1)", "domain"],
      ["2+x", "unsupported"],
      ["foo(3)", "unknown_function"],
      ["2+", "parse"],
    ] as const) {
      const r = explainArithmetic(e);
      expect(r.ok, e).toBe(false);
      if (!r.ok) expect(r.error, e).toBe(code);
    }
  });
});
