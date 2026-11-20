import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/calc";

// 30 typical calculator inputs. The threshold is 10 ms per expression (CI can be slow);
// the measured averages are printed in the assertion message and in the test title output.
const EXPRESSIONS: Array<[string, "deg" | "rad"]> = [
  ["sin(30)+cos(60)", "deg"],
  ["2^0.5*10", "rad"],
  ["15% of 200", "rad"],
  ["12345.678*9876.543", "rad"],
  ["ln(10)", "rad"],
  ["0.1+0.2", "rad"],
  ["1/3", "rad"],
  ["sqrt(2)*sqrt(8)", "rad"],
  ["10!", "rad"],
  ["200+15%", "rad"],
  ["2pi*6371", "rad"],
  ["exp(1.5)", "rad"],
  ["log(1000)+log2(8)", "rad"],
  ["tan(45)", "deg"],
  ["atan(1)*4", "rad"],
  ["asin(0.5)", "deg"],
  ["cosh(2)+sinh(2)", "rad"],
  ["ncr(52,5)", "rad"],
  ["(1+2)(3+4)", "rad"],
  ["x = 5; x^2 + 3x + 1", "rad"],
  ["1,234,567.89*3", "rad"],
  ["2^100", "rad"],
  ["(1+0.05)^10", "rad"],
  ["sin(pi/6)", "rad"],
  ["cbrt(27)+sqrt(144)", "rad"],
  ["1/7*7", "rad"],
  ["gcd(1071, 462)", "rad"],
  ["sin(1)^2+cos(1)^2", "rad"],
  ["avg(1,2,3,4,5)*hypot(3,4)", "rad"],
  ["1.5e3*2.5e-2", "rad"],
];

describe("benchmark", () => {
  it("30 typical expressions average well under the limit", () => {
    expect(EXPRESSIONS).toHaveLength(30);
    for (const [s, angle] of EXPRESSIONS) {
      const r = evaluate(s, { angle });
      expect(r.ok, s).toBe(true);
    }
    // warm-up pass done above; now measure
    const rounds = 20;
    const perExpr: Array<[string, number]> = [];
    let total = 0;
    for (const [s, angle] of EXPRESSIONS) {
      const t0 = performance.now();
      for (let i = 0; i < rounds; i++) evaluate(s, { angle });
      const ms = (performance.now() - t0) / rounds;
      perExpr.push([s, ms]);
      total += ms;
    }
    const avg = total / EXPRESSIONS.length;
    const worst = perExpr.reduce((a, b) => (b[1] > a[1] ? b : a));
    // eslint-disable-next-line no-console
    console.log(`calc benchmark: average ${avg.toFixed(3)} ms over ${EXPRESSIONS.length} expressions, worst "${worst[0]}" ${worst[1].toFixed(3)} ms`);
    expect(avg, `average ${avg.toFixed(3)} ms`).toBeLessThan(10);
    expect(worst[1], `worst ${worst[0]} ${worst[1].toFixed(3)} ms`).toBeLessThan(30);
  });
});
