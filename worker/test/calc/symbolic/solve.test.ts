import { describe, expect, it } from "vitest";
import { solveEquation, solveSystem } from "../../../src/calc";

type C = [number, number]; // complex

/** Evaluate a polynomial (ascending coefficients) at a complex point. */
function pEval(coeffs: number[], z: C): C {
  let re = 0;
  let im = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) {
    const nr = re * z[0] - im * z[1] + coeffs[i];
    const ni = re * z[1] + im * z[0];
    re = nr;
    im = ni;
  }
  return [re, im];
}

// [equation, ascending coefficients of lhs - rhs, expected root texts (all roots, as printed)]
const CASES: Array<[string, number[], string[] | null]> = [
  ["2x+3=7", [-4, 2], ["2"]],
  ["3x=0", [0, 3], ["0"]],
  ["x/2+1=4", [-3, 0.5], ["6"]],
  ["5-x=2x-4", [9, -3], ["3"]],
  ["x^2-5x+6=0", [6, -5, 1], ["2", "3"]],
  ["x²−2=0", [-2, 0, 1], ["−√2", "√2"]],
  ["x^2+2x+1=0", [1, 2, 1], ["−1"]],
  ["x^2=9", [-9, 0, 1], ["−3", "3"]],
  ["2x^2-3x-2=0", [-2, -3, 2], ["−1/2", "2"]],
  ["x^2-2x-1=0", [-1, -2, 1], ["1 − √2", "1 + √2"]],
  ["x^2+x+1=0", [1, 1, 1], ["−1/2 − (√3/2)i", "−1/2 + (√3/2)i"]],
  ["x^2+4=0", [4, 0, 1], ["−2i", "2i"]],
  ["x^2+1=0", [1, 0, 1], ["−i", "i"]],
  ["x^2+2x+5=0", [5, 2, 1], ["−1 − 2i", "−1 + 2i"]],
  ["x^2=5x-6", [6, -5, 1], ["2", "3"]],
  ["(x+1)(x-2)=0", [-2, -1, 1], ["−1", "2"]],
  ["4x^2-12x+9=0", [9, -12, 4], ["3/2"]],
  ["x^2/2+x=3", [-3, 1, 0.5], ["−1 − √7", "−1 + √7"]],
  ["x^3-6x^2+11x-6=0", [-6, 11, -6, 1], ["1", "2", "3"]],
  ["x^3-2x+1=0", [1, -2, 0, 1], ["(−1 − √5)/2", "(−1 + √5)/2", "1"]],
  ["x^3=8", [-8, 0, 0, 1], null],
  ["x^3+8=0", [8, 0, 0, 1], null],
  ["x^3-2=0", [-2, 0, 0, 1], null],
  ["x^3+x+1=0", [1, 1, 0, 1], null],
  ["x^3-3x+1=0", [1, -3, 0, 1], null],
  ["2x^3-x^2-13x-6=0", [-6, -13, -1, 2], null],
  ["x^3-3x^2+3x-1=0", [-1, 3, -3, 1], ["1"]],
  ["x^4-5x^2+4=0", [4, 0, -5, 0, 1], ["−2", "−1", "1", "2"]],
  ["x^4=16", [-16, 0, 0, 0, 1], null],
  ["x^4+1=0", [1, 0, 0, 0, 1], null],
  ["x^4-x^2-2=0", [-2, 0, -1, 0, 1], null],
  ["x^5-x=0", [0, -1, 0, 0, 0, 1], null],
  ["x^4-10x^3+35x^2-50x+24=0", [24, -50, 35, -10, 1], ["1", "2", "3", "4"]],
  ["x^3-x=0", [0, -1, 0, 1], ["−1", "0", "1"]],
  ["x^2=0", [0, 0, 1], ["0"]],
  ["x^6=64", [-64, 0, 0, 0, 0, 0, 1], null],
];

describe("solveEquation: roots substituted back", () => {
  it("has 30+ cases", () => expect(CASES.length).toBeGreaterThanOrEqual(30));
  for (const [eq, coeffs, texts] of CASES) {
    it(eq, () => {
      const r = solveEquation(eq);
      expect(r.ok, JSON.stringify(r)).toBe(true);
      if (!r.ok) return;
      expect(r.kind).toBe("roots");
      expect(r.degree).toBe(coeffs.length - 1);
      if (texts) expect(r.roots.map((x) => x.text)).toEqual(texts);
      for (const root of r.roots) {
        const v = pEval(coeffs, [root.re, root.im]);
        const scale = coeffs.reduce((s, c) => s + Math.abs(c), 0) * Math.max(1, Math.hypot(root.re, root.im)) ** (coeffs.length - 1);
        expect(Math.hypot(v[0], v[1]) / scale, `${eq}: root ${root.text}`).toBeLessThan(1e-9);
      }
      // every root of the polynomial is found: count with multiplicity removed is <= degree, and >= 1
      expect(r.roots.length).toBeGreaterThanOrEqual(1);
      expect(r.roots.length).toBeLessThanOrEqual(coeffs.length - 1);
      expect(r.text).toContain("x = ");
      expect(r.steps.length).toBeGreaterThan(0);
    });
  }
});

describe("solveEquation: exactness and shape", () => {
  it("rational roots have exact AST values", () => {
    const r = solveEquation("x^2-5x+6=0");
    expect(r.ok && r.roots.every((x) => x.exact !== null && x.kind === "real")).toBe(true);
  });
  it("irrational roots keep a closed form", () => {
    const r = solveEquation("x^2-2=0");
    expect(r.ok && r.roots[1].re).toBeCloseTo(Math.SQRT2, 14);
    expect(r.ok && r.roots[1].exact).not.toBeNull();
  });
  it("complex roots are marked", () => {
    const r = solveEquation("x^2+1=0");
    expect(r.ok && r.roots.map((x) => x.kind)).toEqual(["complex", "complex"]);
  });
  it("cubic with one real root has a complex pair", () => {
    const r = solveEquation("x^3+x+1=0");
    expect(r.ok && r.roots.map((x) => x.kind)).toEqual(["real", "complex", "complex"]);
  });
  it("x^n = a gives closed-form real roots", () => {
    const r = solveEquation("x^3=2");
    expect(r.ok && r.roots[0].text).toBe("2^(1/3)");
    const s = solveEquation("x^4=16");
    expect(s.ok && s.roots.filter((x) => x.kind === "real").map((x) => x.text)).toEqual(["−2", "2"]);
  });
  it("identities and contradictions", () => {
    const all = solveEquation("x+1=x+1");
    expect(all.ok && all.kind).toBe("all");
    const none = solveEquation("0x=5");
    expect(none.ok && none.kind).toBe("none");
    const none2 = solveEquation("x+1=x+2");
    expect(none2.ok && none2.kind).toBe("none");
  });
  it("accepts an equation without '=' as expr = 0", () => {
    const r = solveEquation("x^2-1");
    expect(r.ok && r.roots.map((x) => x.text)).toEqual(["−1", "1"]);
  });
  it("other unknown", () => {
    const r = solveEquation("t^2-4=0", "t");
    expect(r.ok && r.roots.map((x) => x.text)).toEqual(["−2", "2"]);
    expect(r.ok && r.text).toBe("t = −2, t = 2");
  });
  it("step trace of a quadratic", () => {
    const r = solveEquation("x^2=5x-6");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rules = r.steps.map((s) => s.rule);
    expect(rules).toEqual(expect.arrayContaining(["rewrite", "discriminant", "root", "check"]));
    const disc = r.steps.find((s) => s.rule === "discriminant");
    expect(disc?.after).toBe("D = 1");
    expect(disc?.note).toBe("a = 1, b = −5, c = 6");
    expect(r.steps.find((s) => s.rule === "rewrite")?.after).toBe("x² − 5x + 6 = 0");
  });
  it("step trace of linear and cubic equations", () => {
    const lin = solveEquation("2x+3=7");
    expect(lin.ok && lin.steps.map((s) => s.rule)).toEqual(expect.arrayContaining(["rewrite", "linear", "check"]));
    const cub = solveEquation("x^3+x+1=0");
    expect(cub.ok && cub.steps.map((s) => s.rule)).toContain("cubic");
  });
});

describe("solveEquation: unsupported and invalid input", () => {
  for (const s of ["sin(x)=0", "x^2<4", "1/x=2", "x^7+x+1=0", "x^2+y=0", "e^x=3", "x=", "=3", "x^2=1=2"]) {
    it(s, () => {
      const r = solveEquation(s);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(["unsupported", "parse"]).toContain(r.error);
    });
  }
});

describe("solveSystem", () => {
  it("unique solution with Cramer steps", () => {
    const r = solveSystem(["2x+3y=7", "x-y=1"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.kind).toBe("unique");
    expect(r.texts).toEqual({ x: "2", y: "1" });
    expect(r.steps.filter((s) => s.rule === "cramer").length).toBe(3);
    expect(r.steps.some((s) => s.rule === "check")).toBe(true);
    expect(r.steps[0].rule).toBe("rewrite");
  });
  it("substituting the solution satisfies the equations (random systems)", () => {
    let seed = 5;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed % 19) - 9;
    };
    let tested = 0;
    for (let i = 0; i < 40; i++) {
      const [a1, b1, c1, a2, b2, c2] = [next(), next(), next(), next(), next(), next()];
      if (a1 * b2 - a2 * b1 === 0) continue;
      const eq1 = `${a1}x+(${b1})y=${c1}`;
      const eq2 = `${a2}x+(${b2})y=${c2}`;
      const r = solveSystem([eq1, eq2]);
      expect(r.ok, `${eq1} ; ${eq2}`).toBe(true);
      if (!r.ok || r.kind !== "unique") continue;
      const x = Number(r.texts.x.includes("/") ? eval2(r.texts.x) : r.texts.x.replace("−", "-"));
      const y = Number(r.texts.y.includes("/") ? eval2(r.texts.y) : r.texts.y.replace("−", "-"));
      expect(Math.abs(a1 * x + b1 * y - c1)).toBeLessThan(1e-9);
      expect(Math.abs(a2 * x + b2 * y - c2)).toBeLessThan(1e-9);
      tested++;
    }
    expect(tested).toBeGreaterThan(20);
  });
  it("fractions and other names", () => {
    const r = solveSystem(["x+y=1", "x-y=0"]);
    expect(r.ok && r.texts).toEqual({ x: "1/2", y: "1/2" });
    const s = solveSystem(["a+b=3", "a-b=1"]);
    expect(s.ok && s.texts).toEqual({ a: "2", b: "1" });
    const t = solveSystem(["2x = 3y", "x + y = 5"]);
    expect(t.ok && t.texts).toEqual({ x: "3", y: "2" });
  });
  it("no solution and infinitely many", () => {
    const none = solveSystem(["x+y=1", "x+y=2"]);
    expect(none.ok && none.kind).toBe("none");
    const inf = solveSystem(["x+y=1", "2x+2y=2"]);
    expect(inf.ok && inf.kind).toBe("infinite");
    const bad = solveSystem(["0x+0y=1", "x+y=2"]);
    expect(bad.ok && bad.kind).toBe("none");
  });
  it("rejects nonlinear systems and wrong counts", () => {
    expect(solveSystem(["x*y=1", "x+y=2"]).ok).toBe(false);
    expect(solveSystem(["x+y=1"]).ok).toBe(false);
    expect(solveSystem(["x=1", "x=2"]).ok).toBe(false);
    expect(solveSystem(["x+y+z=1", "x-y=0"]).ok).toBe(false);
  });
});

function eval2(t: string): number {
  const [n, d] = t.replace("−", "-").split("/");
  return Number(n) / Number(d);
}
