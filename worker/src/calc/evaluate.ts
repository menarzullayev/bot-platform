// AST evaluator. evaluate() never throws: every failure is returned as { ok: false, error }.

import { Decimal } from "./decimal";
import { CalcError } from "./errors";
import { callFunction, getConstant, isConstant, isFunction, type AngleMode, type FnContext } from "./functions";
import { parseProgram, type Node, type Program } from "./parser";

export interface EvalOptions {
  /** Angle unit for trigonometric functions (default "rad"). */
  angle?: AngleMode;
  /** Working precision in significant digits (default 34, clamped to 10..100). */
  digits?: number;
  /** Variables. `ans` and `_` hold the previous result. */
  vars?: Record<string, Decimal>;
}

export type EvalResult =
  | {
      ok: true;
      value: Decimal;
      /** AST of the last statement. */
      ast: Node;
      /** Full program (all ';'-separated statements). */
      program: Program;
      /** Variables after evaluation, including assignments plus `ans` and `_`. */
      vars: Record<string, Decimal>;
    }
  | { ok: false; error: CalcError };

const WORK_BUDGET = 40_000;
const HUNDRED_TH = Decimal.parse("0.01");
const HUNDRED = Decimal.from(100);

class Evaluator {
  private work = 0;
  readonly fnCtx: FnContext;
  readonly vars: Map<string, Decimal>;

  constructor(
    private readonly P: number,
    angle: AngleMode,
    vars: Map<string, Decimal>,
  ) {
    this.vars = vars;
    this.fnCtx = { angle, digits: P, charge: (u) => this.charge(u) };
  }

  private charge(units: number): void {
    this.work += units;
    if (this.work > WORK_BUDGET) throw new CalcError("overflow", "calculation is too expensive");
  }

  /** Keep results bounded: non-integers are rounded to the working precision; integers stay exact. */
  private fit(d: Decimal): Decimal {
    return d.s > 0 && d.nd > this.P ? d.roundSig(this.P) : d;
  }

  eval(node: Node): Decimal {
    this.charge(1);
    switch (node.type) {
      case "num":
        return node.value;
      case "ident":
        return this.lookup(node.name);
      case "unary": {
        const v = this.eval(node.arg);
        return node.op === "-" ? v.neg() : v;
      }
      case "postfix": {
        const v = this.eval(node.arg);
        if (node.op === "percent") return this.fit(v.mul(HUNDRED_TH));
        return callFunction("fact", [v], this.fnCtx);
      }
      case "implicit":
        return this.fit(this.eval(node.left).mul(this.eval(node.right)));
      case "assign": {
        if (isConstant(node.name) || isFunction(node.name)) {
          throw new CalcError("syntax", `cannot assign to ${node.name}`, { pos: node.pos });
        }
        const v = this.eval(node.value);
        this.vars.set(node.name, v);
        return v;
      }
      case "call":
        return this.call(node);
      case "binary":
        return this.binary(node);
    }
  }

  private lookup(name: string): Decimal {
    const v = this.vars.get(name);
    if (v !== undefined) return v;
    if (isConstant(name)) return getConstant(name, this.P);
    throw new CalcError("unknown_ident", `unknown identifier ${name}`, { ident: name });
  }

  private call(node: Extract<Node, { type: "call" }>): Decimal {
    const name = node.name;
    if (!isFunction(name)) {
      // x(3+4) with a variable x means implicit multiplication.
      const v = this.vars.get(name);
      if (v !== undefined && node.args.length === 1) return this.fit(v.mul(this.eval(node.args[0])));
      if (v === undefined && !isConstant(name)) throw new CalcError("unknown_ident", `unknown function ${name}`, { ident: name, fn: name });
      if (isConstant(name) && node.args.length === 1) return this.fit(getConstant(name, this.P).mul(this.eval(node.args[0])));
      throw new CalcError("arg_count", `${name} is not a function`, { fn: name, ident: name });
    }
    const args = node.args.map((a) => this.eval(a));
    return this.fit(callFunction(name, args, this.fnCtx));
  }

  private binary(node: Extract<Node, { type: "binary" }>): Decimal {
    const { op } = node;
    // Percent relative to the left operand: 200+15% = 230, 200-15% = 170.
    if ((op === "+" || op === "-") && node.right.type === "postfix" && node.right.op === "percent") {
      const base = this.eval(node.left);
      const pct = this.eval(node.right.arg);
      const factor = op === "+" ? Decimal.ONE.add(pct.div(HUNDRED, this.P)) : Decimal.ONE.sub(pct.div(HUNDRED, this.P));
      return this.fit(base.mul(factor));
    }
    const a = this.eval(node.left);
    const b = this.eval(node.right);
    switch (op) {
      case "+":
        return this.fit(a.add(b));
      case "-":
        return this.fit(a.sub(b));
      case "*":
      case "of":
        return this.fit(a.mul(b));
      case "/":
        return a.div(b, this.P);
      case "^":
        this.charge(20);
        return this.fit(a.pow(b, this.P));
      case "mod":
        return this.fit(a.mod(b));
    }
  }
}

function clampDigits(d: number | undefined): number {
  if (d === undefined || !Number.isFinite(d)) return Decimal.precision;
  return Math.min(100, Math.max(10, Math.floor(d)));
}

export function evaluate(input: string, opts: EvalOptions = {}): EvalResult {
  try {
    const program = parseProgram(input);
    const vars = new Map<string, Decimal>();
    if (opts.vars) {
      for (const k of Object.keys(opts.vars)) {
        const v = opts.vars[k];
        if (v instanceof Decimal) vars.set(k, v);
      }
    }
    const ev = new Evaluator(clampDigits(opts.digits), opts.angle === "deg" ? "deg" : "rad", vars);
    let value = Decimal.ZERO;
    for (const stmt of program.body) value = ev.eval(stmt);
    vars.set("ans", value);
    vars.set("_", value);
    const out: Record<string, Decimal> = Object.create(null);
    for (const [k, v] of vars) out[k] = v;
    return { ok: true, value, ast: program.body[program.body.length - 1], program, vars: out };
  } catch (e) {
    if (e instanceof CalcError) return { ok: false, error: e };
    if (e instanceof RangeError) return { ok: false, error: new CalcError("overflow", "number is too large") };
    return { ok: false, error: new CalcError("syntax", "internal error", { pos: 0 }) };
  }
}
