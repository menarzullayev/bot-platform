import { describe, expect, it } from "vitest";
import { definiteIntegral, derivative, explainArithmetic, integrate, renderSteps, sampleFunction, simplify, solveEquation, solveSystem, parseExpression } from "../../../src/calc";

// Typical bot / Mini App requests. Target on the bot server: < 5 ms per call (limits here are looser for slow CI).
const OPS: Array<[string, () => unknown]> = [
  ["d x^3+2x", () => derivative("x^3+2x")],
  ["d sin(2x+1)", () => derivative("sin(2x+1)")],
  ["d x^2 sin x", () => derivative("x^2*sin(x)")],
  ["d (x^2+1)/(x-1)", () => derivative("(x^2+1)/(x-1)")],
  ["d e^(x^2) ln(x)", () => derivative("e^(x^2)*ln(x)")],
  ["d sqrt(x^2+1)", () => derivative("sqrt(x^2+1)")],
  ["d atan(3x)^2", () => derivative("atan(3x)^2")],
  ["d (x+1)^3 (x-2)^2", () => derivative("(x+1)^3*(x-2)^2")],
  ["∫ x^2+3x+1", () => integrate("x^2+3x+1")],
  ["∫ sin 2x", () => integrate("sin(2x)")],
  ["∫ x e^x", () => integrate("x*e^x")],
  ["∫ x^2 sin x", () => integrate("x^2*sin(x)")],
  ["∫ 1/(x^2+2x+5)", () => integrate("1/(x^2+2x+5)")],
  ["∫ x/(x^2+1)", () => integrate("x/(x^2+1)")],
  ["∫ (x^2+1)/(x-1)", () => integrate("(x^2+1)/(x-1)")],
  ["∫ cos^3", () => integrate("cos(x)^3")],
  ["∫ e^x sin x", () => integrate("e^x*sin(x)")],
  ["∫ x e^(x^2)", () => integrate("x*e^(x^2)")],
  ["∫ 0..pi sin", () => definiteIntegral("sin(x)", 0, "pi")],
  ["∫ 0..1 exp(-x^2)", () => definiteIntegral("exp(-x^2)", 0, 1)],
  ["solve 2x+3=7", () => solveEquation("2x+3=7")],
  ["solve quadratic", () => solveEquation("x^2-5x+6=0")],
  ["solve x^2-2x-1", () => solveEquation("x^2-2x-1=0")],
  ["solve cubic rational", () => solveEquation("x^3-6x^2+11x-6=0")],
  ["solve cubic Cardano", () => solveEquation("x^3+x+1=0")],
  ["solve biquadratic", () => solveEquation("x^4-5x^2+4=0")],
  ["system 2x2", () => solveSystem(["2x+3y=7", "x-y=1"])],
  ["arith 12 ops", () => explainArithmetic("2+3*(4+5)^2-10/4+(7-2)*3")],
  ["simplify polynomial", () => simplify("(x+1)(x+2)(x-3)+x^2")],
  ["sample sin 400", () => sampleFunction(parseExpression("sin(x)/x+cos(2x)"), -10, 10, 400)],
];

function time(fn: () => unknown, reps: number): number {
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) fn();
  return (performance.now() - t0) / reps;
}

describe("CPU budget", () => {
  it("every typical call stays within the budget", () => {
    const rows: string[] = [];
    let worst = 0;
    let total = 0;
    for (const [name, fn] of OPS) {
      time(fn, 30); // warm-up
      const ms = time(fn, 60);
      worst = Math.max(worst, ms);
      total += ms;
      rows.push(`${name.padEnd(22)} ${ms.toFixed(3)} ms`);
      expect(ms, name).toBeLessThan(15);
    }
    const avg = total / OPS.length;
    console.log(`symbolic bench: avg ${avg.toFixed(3)} ms, worst ${worst.toFixed(3)} ms\n${rows.join("\n")}`);
    expect(avg).toBeLessThan(5);
  });
  it("rendering a long trace in 7 languages is cheap", () => {
    const r = derivative("x^3*sin(x)*e^(2x)/(x^2+1)");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ms = time(() => {
      for (const l of ["uz-latn", "uz-cyrl", "ru", "en", "tr", "ar", "es"] as const) renderSteps(r.steps, l);
    }, 50);
    expect(ms).toBeLessThan(5);
  });
  it("the work budget keeps pathological input bounded", () => {
    const t0 = performance.now();
    derivative("((x+1)(x+2)(x+3)(x+4)(x+5)(x+6)(x+7))^9");
    integrate("((x+1)(x+2)(x+3)(x+4)(x+5)(x+6)(x+7))^9");
    expect(performance.now() - t0).toBeLessThan(300);
  });
});
