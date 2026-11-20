import { describe, expect, it } from "vitest";
import { EVALUATOR_SRC } from "../../src/widget/evaluator";

// `new Function` is allowed in TESTS only: it compiles the exact string that is embedded into the widget.
const calc = new Function(EVALUATOR_SRC + "\nreturn calc;")() as (e: string, deg?: boolean, ans?: number) => number;

function run(expr: string, deg = false, ans?: number): number | string {
  try {
    return calc(expr, deg, ans);
  } catch (e) {
    return "ERR:" + String(e);
  }
}

type Row = [expr: string, expected: number | string, deg?: boolean, ans?: number];

const TABLE: Row[] = [
  // arithmetic and precedence
  ["1+2", 3],
  ["2+3×4", 14],
  ["(2+3)×4", 20],
  ["10−4−3", 3],
  ["100÷4÷5", 5],
  ["7÷2", 3.5],
  ["2*3+4/2", 8],
  ["1 + 2", 3],
  ["2^10", 1024],
  ["2^3^2", 512],
  ["-2^2", -4],
  ["2^-2", 0.25],
  ["−3²", -9],
  ["3²", 9],
  ["(1+2)²", 9],
  ["9−−3", 12],
  ["5+−3", 2],
  ["4×−2", -8],
  ["((((1))))", 1],
  // floating point cleanup
  ["0.1+0.2", 0.3],
  ["0.1×3", 0.3],
  ["0.1+0.2−0.3", 0],
  ["1÷3×3", 1],
  ["1000000×1000000", 1e12],
  ["0.000001×0.000001", 1e-12],
  ["123456789×987654321", 1.21932631113e17],
  // constants
  ["π", 3.14159265359],
  ["2π", 6.28318530718],
  ["e", 2.71828182846],
  ["ln(e)", 1],
  // implicit multiplication
  ["3(4+1)", 15],
  ["(1+2)(3+4)", 21],
  ["2√9", 6],
  ["√9×2", 6],
  // factorial
  ["0!", 1],
  ["5!", 120],
  ["10!", 3628800],
  ["170!", 7.25741561531e306],
  ["171!", "ERR:m"],
  ["2.5!", "ERR:m"],
  ["(-1)!", "ERR:m"],
  // roots and logs
  ["√16", 4],
  ["√(2)", 1.41421356237],
  ["√(-1)", "ERR:m"],
  ["ln(0)", "ERR:m"],
  ["log(1000)", 3],
  ["log(0.001)", -3],
  ["log(-5)", "ERR:m"],
  // trig, degrees
  ["sin(30)", 0.5, true],
  ["cos(60)", 0.5, true],
  ["tan(45)", 1, true],
  ["sin(90)", 1, true],
  ["cos(90)", 0, true],
  ["sin(180)", 0, true],
  ["tan(90)", "ERR:m", true],
  ["2sin(30)", 1, true],
  ["SIN(30)", 0.5, true],
  // trig, radians
  ["sin(π)", 0],
  ["cos(π)", -1],
  ["sin(π÷2)", 1],
  ["tan(π÷4)", 1],
  // percent semantics
  ["200+15%", 230],
  ["200−15%", 170],
  ["50%", 0.5],
  ["200×15%", 30],
  ["100+10%+10%", 121],
  // ans
  ["ans×2", 42, false, 21],
  ["ans", 0],
  // errors
  ["1÷0", "ERR:z"],
  ["0÷0", "ERR:z"],
  ["1÷(5−5)", "ERR:z"],
  ["10^400", "ERR:m"],
  ["(-8)^0.5", "ERR:m"],
  ["", "ERR:s"],
  ["1+", "ERR:s"],
  ["×3", "ERR:s"],
  ["1+2)", "ERR:s"],
  ["abc", "ERR:s"],
  ["sin", "ERR:s"],
  ["()", "ERR:s"],
  // forgiving input: missing closing parentheses at the end
  ["(1+2", 3],
  ["sqrt(16", 4],
];

describe("widget evaluator (the exact source embedded in the widget)", () => {
  it("has at least 40 table rows", () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(40);
  });

  for (const [expr, expected, deg, ans] of TABLE) {
    it(`${JSON.stringify(expr)}${deg ? " [deg]" : ""} -> ${expected}`, () => {
      const got = run(expr, deg ?? false, ans);
      // Object.is distinguishes -0 from 0: results must never be negative zero
      expect(Object.is(got, expected)).toBe(true);
    });
  }

  it("source is ES5-style: no arrows, let/const, classes, template strings", () => {
    expect(EVALUATOR_SRC).not.toMatch(/=>|\blet\s|\bconst\s|\bclass\s|`/);
  });

  it("source has no network or dynamic-code identifiers", () => {
    expect(EVALUATOR_SRC).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|eval|import)\b|new\s+Function/);
  });

  it("is deterministic and keeps no state between calls", () => {
    expect(run("2+2")).toBe(4);
    expect(run("1÷0")).toBe("ERR:z");
    expect(run("2+2")).toBe(4);
  });

  it("does not execute or resolve prototype names as symbols", () => {
    expect(run("constructor")).toBe("ERR:s");
    expect(run("__proto__")).toBe("ERR:s");
    expect(run("toString(1)")).toBe("ERR:s");
  });
});
