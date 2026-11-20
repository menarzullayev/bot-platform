// Symbolic differentiation with a step trace.

import type { Node } from "../parser";
import { add, call, div, dependsOn, mul, neg, normalizeNode, numN, pow, sub, ONE, ZERO, assertSize } from "./ast";
import { simplifyStrict } from "./simplify";
import { toText } from "./text";
import { MAX_STEPS, SymbolicError, type StepRule, type Step } from "./types";

type Ctx = "top" | "term" | "inner";

const TWO = numN(2);

/** f'(u) for a unary function f; undefined when the function is not supported. */
function outerDerivative(name: string, u: Node): Node | undefined {
  switch (name) {
    case "sin":
      return call("cos", u);
    case "cos":
      return neg(call("sin", u));
    case "tan":
      return div(ONE, pow(call("cos", u), TWO));
    case "cot":
      return neg(div(ONE, pow(call("sin", u), TWO)));
    case "sec":
      return mul(call("sec", u), call("tan", u));
    case "csc":
      return neg(mul(call("csc", u), call("cot", u)));
    case "asin":
      return div(ONE, call("sqrt", sub(ONE, pow(u, TWO))));
    case "acos":
      return neg(div(ONE, call("sqrt", sub(ONE, pow(u, TWO)))));
    case "atan":
      return div(ONE, add(ONE, pow(u, TWO)));
    case "sinh":
      return call("cosh", u);
    case "cosh":
      return call("sinh", u);
    case "tanh":
      return sub(ONE, pow(call("tanh", u), TWO));
    case "ln":
      return div(ONE, u);
    case "log10":
      return div(ONE, mul(u, call("ln", numN(10))));
    case "log2":
      return div(ONE, mul(u, call("ln", TWO)));
    case "abs":
      return div(u, call("abs", u));
    default:
      return undefined;
  }
}

function ruleOf(name: string): StepRule {
  if (["sin", "cos", "tan", "cot", "sec", "csc"].includes(name)) return "trig";
  if (["asin", "acos", "atan"].includes(name)) return "invtrig";
  if (["sinh", "cosh", "tanh"].includes(name)) return "hyper";
  if (name === "abs") return "abs";
  return "log";
}

class Deriv {
  readonly steps: Step[] = [];
  truncated = false;

  constructor(private readonly v: string) {}

  private simp(n: Node): Node {
    return simplifyStrict(n, { check: false });
  }

  private rule(n: Node, rule: StepRule, note: string | undefined, compute: () => Node): Node {
    let slot = -1;
    if (this.steps.length < MAX_STEPS) {
      slot = this.steps.length;
      this.steps.push({ rule, before: `(${toText(n)})′`, after: "", ...(note !== undefined ? { note } : {}) });
    } else this.truncated = true;
    const res = this.simp(compute());
    if (slot >= 0) this.steps[slot].after = toText(res);
    return res;
  }

  d(n: Node, ctx: Ctx): Node {
    const v = this.v;
    if (!dependsOn(n, v)) return ctx === "inner" ? ZERO : this.rule(n, "const", undefined, () => ZERO);
    switch (n.type) {
      case "ident":
        return ctx === "inner" ? ONE : this.rule(n, "power", undefined, () => ONE);
      case "unary":
        return this.rule(n, "const_mult", "−1", () => neg(this.d(n.arg, "inner")));
      case "binary":
        return this.binary(n);
      case "call":
        return this.call(n);
      default:
        throw new SymbolicError("unsupported", `cannot differentiate ${n.type}`);
    }
  }

  private flattenSum(n: Node, sign: 1 | -1, out: Array<[Node, 1 | -1]>): void {
    if (n.type === "binary" && n.op === "+") {
      this.flattenSum(n.left, sign, out);
      this.flattenSum(n.right, sign, out);
    } else if (n.type === "binary" && n.op === "-") {
      this.flattenSum(n.left, sign, out);
      this.flattenSum(n.right, sign === 1 ? -1 : 1, out);
    } else if (n.type === "unary" && n.op === "-") {
      this.flattenSum(n.arg, sign === 1 ? -1 : 1, out);
    } else out.push([n, sign]);
  }

  private flattenMul(n: Node, out: Node[]): void {
    if (n.type === "binary" && n.op === "*") {
      this.flattenMul(n.left, out);
      this.flattenMul(n.right, out);
    } else out.push(n);
  }

  private binary(n: Extract<Node, { type: "binary" }>): Node {
    const v = this.v;
    switch (n.op) {
      case "+":
      case "-":
        return this.rule(n, "sum", undefined, () => {
          const terms: Array<[Node, 1 | -1]> = [];
          this.flattenSum(n, 1, terms);
          let acc: Node | null = null;
          for (const [t, s] of terms) {
            const dt = this.d(t, "term");
            acc = acc === null ? (s === 1 ? dt : neg(dt)) : s === 1 ? add(acc, dt) : sub(acc, dt);
          }
          return acc ?? ZERO;
        });
      case "*": {
        const fs: Node[] = [];
        this.flattenMul(n, fs);
        const dep = fs.filter((f) => dependsOn(f, v));
        if (dep.length === 1) {
          const consts = fs.filter((f) => !dependsOn(f, v));
          return this.rule(n, "const_mult", consts.map((c) => toText(c)).join(" · "), () => {
            const dd = this.d(dep[0], "inner");
            return consts.reduce<Node>((acc, c) => mul(c, acc), dd);
          });
        }
        return this.rule(n, "product", undefined, () => {
          const ds = fs.map((f) => (dependsOn(f, v) ? this.d(f, "inner") : ZERO));
          let acc: Node | null = null;
          for (let i = 0; i < fs.length; i++) {
            if (!dependsOn(fs[i], v)) continue;
            let term = ds[i];
            for (let j = 0; j < fs.length; j++) if (j !== i) term = mul(term, fs[j]);
            acc = acc === null ? term : add(acc, term);
          }
          return acc ?? ZERO;
        });
      }
      case "/": {
        if (!dependsOn(n.right, v)) {
          return this.rule(n, "const_mult", `1/(${toText(n.right)})`, () => div(this.d(n.left, "inner"), n.right));
        }
        const powerLike = n.right.type === "ident" || (n.right.type === "binary" && n.right.op === "^" && n.right.left.type === "ident" && !dependsOn(n.right.right, v));
        const kind: StepRule = !dependsOn(n.left, v) && powerLike ? "power" : "quotient";
        return this.rule(n, kind, undefined, () => {
          const du = this.d(n.left, "inner");
          const dw = this.d(n.right, "inner");
          return div(sub(mul(du, n.right), mul(n.left, dw)), pow(n.right, TWO));
        });
      }
      case "^": {
        const base = n.left;
        const ex = n.right;
        if (!dependsOn(ex, v)) {
          const isVar = base.type === "ident";
          return this.rule(n, isVar ? "power" : "chain", isVar ? undefined : `u = ${toText(base)}`, () => {
            const du = this.d(base, "inner");
            const core = mul(ex, pow(base, sub(ex, ONE)));
            return isVar ? core : mul(core, du);
          });
        }
        if (!dependsOn(base, v)) {
          const isVar = ex.type === "ident";
          const isE = base.type === "ident" && base.name === "e";
          return this.rule(n, isVar ? "exp" : "chain", isVar ? undefined : `u = ${toText(ex)}`, () => {
            const dv = this.d(ex, "inner");
            const core = isE ? n : mul(n, call("ln", base));
            return isVar ? core : mul(core, dv);
          });
        }
        return this.rule(n, "log", `${toText(n)} = e^(${toText(ex)} · ln ${toText(base)})`, () => {
          const du = this.d(base, "inner");
          const dv = this.d(ex, "inner");
          return mul(n, add(mul(dv, call("ln", base)), div(mul(ex, du), base)));
        });
      }
      default:
        throw new SymbolicError("unsupported", `cannot differentiate operator ${n.op}`);
    }
  }

  private call(n: Extract<Node, { type: "call" }>): Node {
    if (n.args.length !== 1) throw new SymbolicError("unsupported", `cannot differentiate ${n.name} with ${n.args.length} arguments`);
    const u = n.args[0];
    const outer = outerDerivative(n.name, u);
    if (outer === undefined) throw new SymbolicError("unsupported", `no derivative rule for ${n.name}`);
    const isVar = u.type === "ident" && u.name === this.v;
    const rule: StepRule = isVar ? ruleOf(n.name) : "chain";
    return this.rule(n, rule, isVar ? undefined : `u = ${toText(u)}`, () => (isVar ? outer : mul(outer, this.d(u, "inner"))));
  }
}

export interface DerivativeOutcome {
  result: Node;
  /** The simplified input. */
  expression: Node;
  steps: Step[];
  truncated: boolean;
}

/** Differentiate; throws SymbolicError. */
export function differentiate(input: Node, variable: string): DerivativeOutcome {
  const norm = normalizeNode(input);
  assertSize(norm);
  const expression = simplifyStrict(norm, { check: false });
  const d = new Deriv(variable);
  const result = d.d(expression, "top");
  return { result, expression, steps: d.steps, truncated: d.truncated };
}

/** Raw derivative without steps (used internally by the integrator). */
export function derivativeNode(input: Node, variable: string): Node {
  const expression = simplifyStrict(normalizeNode(input), { check: false });
  return new Deriv(variable).d(expression, "inner");
}

