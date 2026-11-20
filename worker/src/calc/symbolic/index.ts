// Symbolic mathematics and step-by-step solutions (Pro feature).
//
// Pure TypeScript with no DOM / Node APIs, so the same code runs in the bot (Workers) and in the Mini App bundle.
// Inputs are ASTs from src/calc/parser.ts (or plain strings); results are ASTs with pos/end = 0.
// No function here throws: failures come back as { ok: false, error } (see SymErrorCode).

import { Decimal } from "../decimal";
import { CalcError } from "../errors";
import type { Node } from "../parser";
import { explainArithmeticNode, type ArithOptions, type ArithOutcome } from "./arith";
import { substitute } from "./ast";
import { evalDecimal, mapCalcError } from "./decimalEval";
import { differentiate } from "./deriv";
import { integrateExpr } from "./integ";
import { compileFast, integrateNumeric, sampleFunction } from "./numeric";
import { simplifyStrict, type SimplifyOptions } from "./simplify";
import { solveEquationNode, solveSystemNodes, parseExpression, type EquationSolution, type SystemSolution } from "./solve";
import { toText } from "./text";
import { fail, SymbolicError, type Failure, type Step } from "./types";

export type { Ast, Step, StepRule, SymErrorCode, Failure } from "./types";
export { STEP_RULES, MAX_NODES } from "./types";
export type SymbolicResult<T> = ({ ok: true } & T) | Failure;
export { toText, type TextOptions } from "./text";
export { STEP_LABELS, stepLabel, renderSteps, escapeHtml, type StepLabel } from "./labels";
export { compileFast, sampleFunction, autoRange, toSegments, integrateNumeric, type Sampled, type NumericIntegral } from "./numeric";
export type { Root, EquationSolution, SystemSolution } from "./solve";
export type { ArithOptions, ArithOutcome } from "./arith";
export { parseExpression } from "./solve";

function guard<T>(fn: () => SymbolicResult<T>): SymbolicResult<T> {
  try {
    return fn();
  } catch (e) {
    if (e instanceof SymbolicError) return fail(e.code, e.message);
    if (e instanceof CalcError) {
      const m = mapCalcError(e);
      return fail(m.code, m.message);
    }
    if (e instanceof RangeError) return fail("too_complex", "number is too large");
    return fail("invalid", e instanceof Error ? e.message : "unexpected error");
  }
}

/** Canonical simplified form of an expression. Returns the input unchanged if it cannot be simplified. */
export function simplify(ast: Node | string, opts?: SimplifyOptions): Node {
  try {
    return simplifyStrict(parseExpression(ast), opts);
  } catch {
    return typeof ast === "string" ? ({ type: "ident", name: ast, pos: 0, end: 0 } as Node) : ast;
  }
}

export type DerivativeResult = SymbolicResult<{ result: Node; text: string; expression: Node; steps: Step[]; truncated: boolean }>;

/** d/dvariable of an expression with a step trace. */
export function derivative(ast: Node | string, variable = "x"): DerivativeResult {
  return guard(() => {
    const r = differentiate(parseExpression(ast), variable);
    return { ok: true as const, result: r.result, text: toText(r.result), expression: r.expression, steps: r.steps, truncated: r.truncated };
  });
}

export type IntegralResult = SymbolicResult<{ result: Node; antiderivative: Node; text: string; expression: Node; steps: Step[] }>;

/** Indefinite integral (result includes "+ C"); { ok: false, error: 'unsupported' } when no rule applies. */
export function integrate(ast: Node | string, variable = "x"): IntegralResult {
  return guard(() => {
    const r = integrateExpr(parseExpression(ast), variable);
    return { ok: true as const, result: r.result, antiderivative: r.antiderivative, text: `${toText(r.antiderivative)} + C`, expression: r.expression, steps: r.steps };
  });
}

export type DefiniteResult = SymbolicResult<{
  /** Decimal string. */
  value: string;
  method: "analytic" | "numeric";
  /** Antiderivative when the analytic path was used. */
  antiderivative?: Node;
  /** F(b) - F(a) in closed form (analytic path, when small enough). */
  exact?: Node;
  exactText?: string;
  steps: Step[];
}>;

type Bound = number | string | Node;

function boundNode(b: Bound): Node {
  if (typeof b === "number") {
    if (!Number.isFinite(b)) throw new SymbolicError("invalid", "bounds must be finite");
    return bNode(Decimal.parse(String(b)));
  }
  return parseExpression(b);
}

function numberText(x: number): string {
  return Decimal.parse(Number(x.toPrecision(15)).toString()).toString();
}

/**
 * Definite integral. Uses the analytic antiderivative when one exists (high precision), otherwise adaptive
 * Gauss-Kronrod (about 1e-10 relative accuracy). Divergent integrals return { ok: false, error: 'divergent' }.
 */
export function definiteIntegral(ast: Node | string, a: Bound, b: Bound, variable = "x"): DefiniteResult {
  return guard(() => {
    const expr = parseExpression(ast);
    const nodeA = boundNode(a);
    const nodeB = boundNode(b);
    const da = evalDecimal(nodeA);
    const db = evalDecimal(nodeB);
    const fa = da.toNumber();
    const fb = db.toNumber();
    const f = compileFast(expr, variable);
    const num = integrateNumeric(f, fa, fb);
    let analytic: { value: Decimal; F: Node; exact: Node | null; steps: Step[] } | null = null;
    try {
      const r = integrateExpr(expr, variable);
      const Fb = evalDecimal(r.antiderivative, { vars: { [variable]: db } });
      const Fa = evalDecimal(r.antiderivative, { vars: { [variable]: da } });
      let exact: Node | null = null;
      try {
        const diff = simplifyStrict(
          { type: "binary", op: "-", left: substitute(r.antiderivative, variable, nodeB), right: substitute(r.antiderivative, variable, nodeA), pos: 0, end: 0 },
          { check: false },
        );
        exact = diff;
      } catch {
        exact = null;
      }
      analytic = { value: Fb.sub(Fa), F: r.antiderivative, exact, steps: r.steps };
    } catch (e) {
      if (!(e instanceof SymbolicError || e instanceof CalcError)) throw e;
    }
    const finiteNum = Number.isFinite(num.value);
    if (analytic !== null) {
      const A = analytic.value.toNumber();
      const agree = finiteNum && Math.abs(A - num.value) <= 1e-6 * Math.max(1, Math.abs(num.value));
      if (agree || (!finiteNum || !num.converged ? noPoles(f, fa, fb) : false)) {
        const value = analytic.value.nd > 20 ? analytic.value.roundSig(20) : analytic.value;
        const steps: Step[] = [...analytic.steps, { rule: "arith", before: `F(${toText(nodeB)}) − F(${toText(nodeA)})`, after: value.toString() }];
        return {
          ok: true as const,
          value: value.toString(),
          method: "analytic" as const,
          antiderivative: analytic.F,
          ...(analytic.exact !== null && toText(analytic.exact).length < 80 ? { exact: analytic.exact, exactText: toText(analytic.exact) } : {}),
          steps,
        };
      }
    }
    if (!finiteNum || !num.converged) return fail("divergent", "the integral does not converge");
    return {
      ok: true as const,
      value: numberText(num.value),
      method: "numeric" as const,
      steps: [{ rule: "arith" as const, before: `∫ ${toText(expr)} d${variable}  [${toText(nodeA)}, ${toText(nodeB)}]`, after: numberText(num.value), note: "Gauss–Kronrod" }],
    };
  });
}

function bNode(d: Decimal): Node {
  return { type: "num", value: d, raw: d.toString(), pos: 0, end: 0 };
}

/** True when the sampled function has no poles on [a, b]. */
function noPoles(f: (x: number) => number, a: number, b: number): boolean {
  const s = sampleFunction(f, Math.min(a, b), Math.max(a, b), 240);
  if (s.points.length < 100) return false;
  return s.breaks.length === 0;
}

/** Solve a polynomial equation ("x^2-5x+6=0", "2x+3=7", "x^3=8") with steps. */
export function solveEquation(input: Node | string, variable = "x"): SymbolicResult<EquationSolution> {
  return guard(() => ({ ok: true as const, ...solveEquationNode(input, variable) }));
}

/** Solve a 2x2 linear system by Cramer's rule: solveSystem(['2x+3y=7','x-y=1']). */
export function solveSystem(equations: Array<Node | string>, variables?: [string, string]): SymbolicResult<SystemSolution> {
  return guard(() => ({ ok: true as const, ...solveSystemNodes(equations, variables) }));
}

/** Evaluate an arithmetic expression in the order of operations, one operation group per step (default <= 12). */
export function explainArithmetic(ast: Node | string, opts: ArithOptions = {}): SymbolicResult<ArithOutcome> {
  return guard(() => ({ ok: true as const, ...explainArithmeticNode(parseExpression(ast), opts) }));
}

