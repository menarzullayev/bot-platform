// Shared types of the symbolic module. Pure TypeScript: no DOM, no Node APIs (bundle-friendly for the Mini App).

import type { Node } from "../parser";

/** The AST produced by src/calc/parser.ts (results of this module use the same shape with pos/end = 0). */
export type Ast = Node;

export type StepRule =
  | "const"
  | "power"
  | "const_mult"
  | "sum"
  | "product"
  | "quotient"
  | "chain"
  | "exp"
  | "log"
  | "trig"
  | "invtrig"
  | "hyper"
  | "abs"
  | "simplify"
  | "table"
  | "substitute"
  | "by_parts"
  | "partial_fractions"
  | "rewrite"
  | "linear"
  | "discriminant"
  | "root"
  | "cubic"
  | "cramer"
  | "check"
  | "arith";

export const STEP_RULES: readonly StepRule[] = [
  "const",
  "power",
  "const_mult",
  "sum",
  "product",
  "quotient",
  "chain",
  "exp",
  "log",
  "trig",
  "invtrig",
  "hyper",
  "abs",
  "simplify",
  "table",
  "substitute",
  "by_parts",
  "partial_fractions",
  "rewrite",
  "linear",
  "discriminant",
  "root",
  "cubic",
  "cramer",
  "check",
  "arith",
];

export interface Step {
  rule: StepRule;
  /** Expression (or equation) before the step, as plain unicode text. */
  before: string;
  /** Result of the step, as plain unicode text. */
  after: string;
  /** Optional language-neutral detail (a substitution, a formula instance, ...). */
  note?: string;
}

export type SymErrorCode =
  | "parse"
  | "unsupported"
  | "too_complex"
  | "unknown_function"
  | "div_zero"
  | "domain"
  | "divergent"
  | "invalid";

export interface Failure {
  ok: false;
  error: SymErrorCode;
  message?: string;
}

export type Result<T> = ({ ok: true } & T) | Failure;

export class SymbolicError extends Error {
  readonly code: SymErrorCode;
  constructor(code: SymErrorCode, message?: string) {
    super(message ?? code);
    this.name = "SymbolicError";
    this.code = code;
  }
}

/** Hard limit on the number of AST nodes of an input expression. */
export const MAX_NODES = 200;
/** Steps beyond this count are dropped (derivatives of huge expressions). */
export const MAX_STEPS = 40;

export function fail(error: SymErrorCode, message?: string): Failure {
  return message === undefined ? { ok: false, error } : { ok: false, error, message };
}
