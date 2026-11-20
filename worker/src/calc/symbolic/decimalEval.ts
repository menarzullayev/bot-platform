// High-precision evaluation of an AST with the calculator's Decimal arithmetic (used by explainArithmetic and
// analytic definite integrals). Never touches DOM/Node APIs.

import { Decimal } from "../decimal";
import { CalcError } from "../errors";
import { callFunction, getConstant, type FnContext } from "../functions";
import type { Node } from "../parser";
import { constName, isKnownFunction } from "./ast";
import { SymbolicError } from "./types";

const HUNDRED = Decimal.from(100);

export interface DecOptions {
  digits?: number;
  vars?: Record<string, Decimal>;
}

/** Map calculator errors to symbolic ones. */
export function mapCalcError(e: unknown): SymbolicError {
  if (e instanceof SymbolicError) return e;
  if (e instanceof CalcError) {
    if (e.code === "div0") return new SymbolicError("div_zero", e.message);
    if (e.code === "domain") return new SymbolicError("domain", e.message);
    if (e.code === "overflow") return new SymbolicError("too_complex", e.message);
    if (e.code === "unknown_ident") return new SymbolicError("unknown_function", e.message);
    return new SymbolicError("invalid", e.message);
  }
  if (e instanceof RangeError) return new SymbolicError("too_complex", "number is too large");
  return new SymbolicError("invalid", e instanceof Error ? e.message : "evaluation failed");
}

export function evalDecimal(node: Node, opts: DecOptions = {}): Decimal {
  const P = Math.min(100, Math.max(10, opts.digits ?? 34));
  const ctx: FnContext = { angle: "rad", digits: P };
  const vars = opts.vars ?? {};
  const fit = (d: Decimal): Decimal => (d.s > 0 && d.nd > P ? d.roundSig(P) : d);
  const go = (n: Node): Decimal => {
    switch (n.type) {
      case "num":
        return n.value;
      case "ident": {
        if (Object.hasOwn(vars, n.name)) return vars[n.name];
        const c = constName(n.name);
        if (c !== null) return getConstant(c, P);
        throw new SymbolicError("unsupported", `unknown identifier ${n.name}`);
      }
      case "unary": {
        const a = go(n.arg);
        return n.op === "-" ? a.neg() : a;
      }
      case "postfix": {
        const a = go(n.arg);
        if (n.op === "percent") return a.div(HUNDRED, P);
        return fit(callFunction("fact", [a], ctx));
      }
      case "implicit":
        return fit(go(n.left).mul(go(n.right)));
      case "assign":
        throw new SymbolicError("unsupported");
      case "call": {
        const name = n.name.toLowerCase();
        const args = n.args.map(go);
        if (name === "sec" || name === "csc") {
          const f = callFunction(name === "sec" ? "cos" : "sin", args, ctx);
          return Decimal.ONE.div(f, P);
        }
        if (!isKnownFunction(name)) throw new SymbolicError("unknown_function", `unknown function ${n.name}`);
        return fit(callFunction(name, args, ctx));
      }
      case "binary": {
        if ((n.op === "+" || n.op === "-") && n.right.type === "postfix" && n.right.op === "percent") {
          const base = go(n.left);
          const pct = go(n.right.arg);
          const f = n.op === "+" ? Decimal.ONE.add(pct.div(HUNDRED, P)) : Decimal.ONE.sub(pct.div(HUNDRED, P));
          return fit(base.mul(f));
        }
        const a = go(n.left);
        const b = go(n.right);
        switch (n.op) {
          case "+":
            return fit(a.add(b));
          case "-":
            return fit(a.sub(b));
          case "*":
          case "of":
            return fit(a.mul(b));
          case "/":
            return a.div(b, P);
          case "^":
            return fit(a.pow(b, P));
          case "mod":
            return fit(a.mod(b));
        }
      }
    }
  };
  try {
    return go(node);
  } catch (e) {
    throw mapCalcError(e);
  }
}
