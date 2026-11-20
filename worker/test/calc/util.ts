import { evaluate, type CalcError, type EvalOptions } from "../../src/calc";

/** Evaluate and return the exact value as a plain string; throws if evaluation failed. */
export function val(input: string, opts?: EvalOptions): string {
  const r = evaluate(input, opts);
  if (!r.ok) throw new Error(`"${input}" failed: ${r.error.code} ${r.error.message}`);
  return r.value.toString();
}

/** Evaluate and return the error; throws if it unexpectedly succeeded. */
export function err(input: string, opts?: EvalOptions): CalcError {
  const r = evaluate(input, opts);
  if (r.ok) throw new Error(`"${input}" unexpectedly succeeded: ${r.value.toString()}`);
  return r.error;
}

/** Value rounded to n significant digits (for "shown rounded" assertions). */
export function sig(input: string, n: number, opts?: EvalOptions): string {
  const r = evaluate(input, opts);
  if (!r.ok) throw new Error(`"${input}" failed: ${r.error.code} ${r.error.message}`);
  return r.value.toSignificant(n);
}
