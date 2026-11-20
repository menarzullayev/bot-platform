// Step-by-step evaluation of an arithmetic expression in the order of operations.

import { Decimal } from "../decimal";
import type { Node } from "../parser";
import { assertSize, constName, ident, normalizeNode } from "./ast";
import { evalDecimal } from "./decimalEval";
import { toText } from "./text";
import { SymbolicError, type Step } from "./types";

export interface ArithOptions {
  /** Maximum number of steps (default 12); the last step jumps straight to the value. */
  maxSteps?: number;
  /** Significant digits shown (default 12). */
  digits?: number;
}

export interface ArithOutcome {
  /** Final value rounded for display. */
  result: string;
  /** Final value with working precision. */
  value: string;
  /** True when the shown numbers were rounded. */
  approx: boolean;
  steps: Step[];
}

const numNode = (d: Decimal): Node => ({ type: "num", value: d, raw: d.toString(), pos: 0, end: 0 });

function leafValue(n: Node): Decimal | null {
  if (n.type === "num") return n.value;
  if (n.type === "unary") {
    const a = leafValue(n.arg);
    if (a === null) return null;
    return n.op === "-" ? a.neg() : a;
  }
  return null;
}

const isLeaf = (n: Node): boolean => leafValue(n) !== null;

interface Cand {
  path: number[];
  node: Node;
  depth: number;
  prec: number;
  order: number;
}

function precOf(n: Node): number {
  switch (n.type) {
    case "call":
      return 7;
    case "postfix":
      return 5;
    case "binary":
      return n.op === "^" ? 4 : n.op === "+" || n.op === "-" ? 1 : 2;
    case "unary":
      return 3;
    default:
      return 8;
  }
}

/** Child positions of a node: [child, extra parenthesis depth, isRight]. */
function children(n: Node): Array<[Node, number]> {
  switch (n.type) {
    case "unary":
      return [[n.arg, precOf(n.arg) < 2 ? 1 : 0]];
    case "postfix":
      return [[n.arg, precOf(n.arg) < 5 && !isLeaf(n.arg) ? 1 : 0]];
    case "call":
      return n.args.map((a): [Node, number] => [a, 1]);
    case "binary": {
      const lp = precOf(n.left);
      const rp = precOf(n.right);
      switch (n.op) {
        case "+":
          return [
            [n.left, 0],
            [n.right, rp < 1 ? 1 : 0],
          ];
        case "-":
          return [
            [n.left, 0],
            [n.right, rp <= 1 ? 1 : 0],
          ];
        case "*":
        case "of":
          return [
            [n.left, lp < 2 ? 1 : 0],
            [n.right, rp <= 1 || n.right.type === "unary" ? 1 : 0],
          ];
        case "/":
        case "mod":
          return [
            [n.left, lp < 2 ? 1 : 0],
            [n.right, rp <= 2 ? 1 : 0],
          ];
        case "^":
          return [
            [n.left, isLeaf(n.left) ? 0 : 1],
            [n.right, isLeaf(n.right) ? 0 : 1],
          ];
      }
      return [];
    }
    default:
      return [];
  }
}

function isRedex(n: Node): boolean {
  if (isLeaf(n)) return false;
  switch (n.type) {
    case "unary":
    case "postfix":
      return isLeaf(n.arg);
    case "call":
      return n.args.every(isLeaf);
    case "binary":
      if ((n.op === "+" || n.op === "-") && n.right.type === "postfix" && n.right.op === "percent") return isLeaf(n.left) && isLeaf(n.right.arg);
      return isLeaf(n.left) && isLeaf(n.right);
    default:
      return false;
  }
}

function collect(n: Node, depth: number, path: number[], out: Cand[], counter: { i: number }, skipPercent: boolean): void {
  const ch = children(n);
  const isPercentRedexParent = n.type === "binary" && (n.op === "+" || n.op === "-") && n.right.type === "postfix" && n.right.op === "percent" && isLeaf(n.left) && isLeaf(n.right.arg);
  if (!isPercentRedexParent) {
    ch.forEach(([c, extra], i) => {
      const sp = n.type === "binary" && (n.op === "+" || n.op === "-") && i === 1 && c.type === "postfix" && c.op === "percent";
      collect(c, depth + extra, [...path, i], out, counter, sp);
    });
  }
  if (skipPercent && n.type === "postfix" && n.op === "percent" && !isLeaf(n)) {
    // percent operand under +/- : reduced through its parent once the parent becomes a redex
  } else if (isRedex(n)) out.push({ path, node: n, depth, prec: precOf(n), order: counter.i++ });
}

function replaceAt(n: Node, path: number[], repl: Node): Node {
  if (path.length === 0) return repl;
  const [i, ...rest] = path;
  switch (n.type) {
    case "unary":
    case "postfix":
      return { ...n, arg: replaceAt(n.arg, rest, repl) } as Node;
    case "call":
      return { ...n, args: n.args.map((a, k) => (k === i ? replaceAt(a, rest, repl) : a)) };
    case "binary":
      return i === 0 ? { ...n, left: replaceAt(n.left, rest, repl) } : { ...n, right: replaceAt(n.right, rest, repl) };
    default:
      return n;
  }
}

function checkNode(n: Node): void {
  switch (n.type) {
    case "num":
      return;
    case "ident":
      if (constName(n.name) === null) throw new SymbolicError("unsupported", `unknown identifier ${n.name}`);
      return;
    case "unary":
    case "postfix":
      checkNode(n.arg);
      return;
    case "binary":
      checkNode(n.left);
      checkNode(n.right);
      return;
    case "call":
      n.args.forEach(checkNode);
      return;
    default:
      throw new SymbolicError("unsupported", "not an arithmetic expression");
  }
}

function replaceConstants(n: Node, found: Map<string, Decimal>, P: number): Node {
  switch (n.type) {
    case "ident": {
      const c = constName(n.name);
      if (c === null) return n;
      const v = evalDecimal(ident(c), { digits: P });
      found.set(c, v);
      return numNode(v);
    }
    case "unary":
    case "postfix":
      return { ...n, arg: replaceConstants(n.arg, found, P) } as Node;
    case "binary":
      return { ...n, left: replaceConstants(n.left, found, P), right: replaceConstants(n.right, found, P) };
    case "call":
      return { ...n, args: n.args.map((a) => replaceConstants(a, found, P)) };
    default:
      return n;
  }
}

/** Explain how an arithmetic expression is evaluated. Throws SymbolicError. */
export function explainArithmeticNode(input: Node, opts: ArithOptions = {}): ArithOutcome {
  const digits = Math.min(30, Math.max(3, Math.floor(opts.digits ?? 12)));
  const limit = Math.max(1, Math.min(60, Math.floor(opts.maxSteps ?? 12)));
  const P = 40;
  let cur = normalizeNode(input);
  assertSize(cur);
  checkNode(cur);
  const finalValue = evalDecimal(cur, { digits: P });
  const steps: Step[] = [];
  let approx = false;
  const show = (n: Node): string => toText(n, { arith: true, digits });
  const noteRounded = (n: Node): void => {
    const scan = (m: Node): void => {
      if (m.type === "num" && m.value.nd > digits && m.value.s > 0) approx = true;
      else if (m.type === "unary" || m.type === "postfix") scan(m.arg);
      else if (m.type === "binary") {
        scan(m.left);
        scan(m.right);
      } else if (m.type === "call") m.args.forEach(scan);
    };
    scan(n);
  };

  const found = new Map<string, Decimal>();
  const withConsts = replaceConstants(cur, found, P);
  if (found.size > 0) {
    const note = [...found.entries()].map(([k, v]) => `${k === "pi" ? "π" : k === "tau" ? "τ" : k === "phi" ? "φ" : k} ≈ ${v.roundSig(Math.min(digits, 10)).toString()}`).join(", ");
    steps.push({ rule: "arith", before: show(cur), after: show(withConsts), note });
    cur = withConsts;
  }
  while (!isLeaf(cur)) {
    if (steps.length >= limit - 1) {
      const v = evalDecimal(cur, { digits: P });
      steps.push({ rule: "arith", before: show(cur), after: show(numNode(v)), note: "…" });
      noteRounded(numNode(v));
      cur = numNode(v);
      break;
    }
    const cands: Cand[] = [];
    collect(cur, 0, [], cands, { i: 0 }, false);
    if (cands.length === 0) throw new SymbolicError("unsupported", "cannot reduce the expression");
    let best = cands[0];
    for (const c of cands) {
      if (c.depth > best.depth || (c.depth === best.depth && c.prec > best.prec)) best = c;
    }
    const batch = cands.filter((c) => c.depth === best.depth && c.prec === best.prec);
    let next = cur;
    const notes: string[] = [];
    for (const c of batch) {
      const v = evalDecimal(c.node, { digits: P });
      notes.push(`${show(c.node)} = ${show(numNode(v))}`);
      next = replaceAt(next, c.path, numNode(v));
    }
    noteRounded(next);
    steps.push({ rule: "arith", before: show(cur), after: show(next), note: notes.join(";  ") });
    cur = next;
  }
  const v = leafValue(cur) ?? finalValue;
  noteRounded(numNode(v));
  const result = v.nd > digits ? v.roundSig(digits).toString() : v.toString();
  return { result, value: v.toString(), approx: approx || v.nd > digits, steps };
}
