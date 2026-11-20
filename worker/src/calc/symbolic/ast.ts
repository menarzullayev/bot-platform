// AST construction helpers, structural keys and the input normalizer.

import { Decimal } from "../decimal";
import { FUNCTION_NAMES, isConstant, normalizeFunctionName } from "../functions";
import type { Node } from "../parser";
import { qabs, type Q } from "./rational";
import { MAX_NODES, SymbolicError } from "./types";

const Z = { pos: 0, end: 0 };

export function numN(n: bigint | number): Node {
  const b = typeof n === "bigint" ? n : BigInt(n);
  if (b < 0n) return neg(numN(-b));
  return { type: "num", value: Decimal.make(b, 0), raw: b.toString(), ...Z };
}

/** Rational as a node: integer, or a/b; negative values are wrapped in a unary minus. */
export function nodeQ(x: Q): Node {
  const a = qabs(x);
  const body = a.d === 1n ? numN(a.n) : bin("/", numN(a.n), numN(a.d));
  return x.n < 0n ? neg(body) : body;
}

export const ident = (name: string): Node => ({ type: "ident", name, ...Z });
export const neg = (arg: Node): Node => ({ type: "unary", op: "-", arg, ...Z });
export const bin = (op: "+" | "-" | "*" | "/" | "^", left: Node, right: Node): Node => ({ type: "binary", op, left, right, ...Z });
export const add = (a: Node, b: Node): Node => bin("+", a, b);
export const sub = (a: Node, b: Node): Node => bin("-", a, b);
export const mul = (a: Node, b: Node): Node => bin("*", a, b);
export const div = (a: Node, b: Node): Node => bin("/", a, b);
export const pow = (a: Node, b: Node): Node => bin("^", a, b);
export const call = (name: string, ...args: Node[]): Node => ({ type: "call", name, args, ...Z });
export const ZERO = numN(0);
export const ONE = numN(1);

/** Constant name normalization (pi, tau, phi, e). Returns null for non-constants. */
export function constName(name: string): string | null {
  if (!isConstant(name)) return null;
  const l = name.toLowerCase();
  if (l === "π") return "pi";
  if (l === "τ") return "tau";
  if (l === "φ") return "phi";
  return l;
}

const EXTRA_FUNCTIONS = ["sec", "csc"];
const KNOWN = new Set<string>([...FUNCTION_NAMES, ...EXTRA_FUNCTIONS].map((s) => s.toLowerCase()));

export function isKnownFunction(name: string): boolean {
  return KNOWN.has(name.toLowerCase());
}

/** Canonical function name: lower case, aliases resolved (tg -> tan, lg -> log10, arcsin -> asin). */
export function canonFn(name: string): string {
  return normalizeFunctionName(name);
}

// ---------- structural queries ----------

export function key(n: Node): string {
  switch (n.type) {
    case "num":
      return n.value.toString();
    case "ident":
      return n.name;
    case "unary":
      return `(u${n.op} ${key(n.arg)})`;
    case "binary":
      return `(${n.op} ${key(n.left)} ${key(n.right)})`;
    case "implicit":
      return `(i ${key(n.left)} ${key(n.right)})`;
    case "call":
      return `${n.name}(${n.args.map(key).join(",")})`;
    case "postfix":
      return `(${n.op} ${key(n.arg)})`;
    case "assign":
      return `(= ${n.name} ${key(n.value)})`;
  }
}

export function size(n: Node): number {
  switch (n.type) {
    case "num":
    case "ident":
      return 1;
    case "unary":
    case "postfix":
      return 1 + size(n.arg);
    case "binary":
    case "implicit":
      return 1 + size(n.left) + size(n.right);
    case "call":
      return 1 + n.args.reduce((s, a) => s + size(a), 0);
    case "assign":
      return 1 + size(n.value);
  }
}

export function dependsOn(n: Node, v: string): boolean {
  switch (n.type) {
    case "num":
      return false;
    case "ident":
      return n.name === v;
    case "unary":
    case "postfix":
      return dependsOn(n.arg, v);
    case "binary":
    case "implicit":
      return dependsOn(n.left, v) || dependsOn(n.right, v);
    case "call":
      return n.args.some((a) => dependsOn(a, v));
    case "assign":
      return dependsOn(n.value, v);
  }
}

/** Free identifiers that are not constants, in order of appearance. */
export function freeIdents(n: Node, out: string[] = []): string[] {
  switch (n.type) {
    case "ident":
      if (constName(n.name) === null && !out.includes(n.name)) out.push(n.name);
      break;
    case "unary":
    case "postfix":
      freeIdents(n.arg, out);
      break;
    case "binary":
    case "implicit":
      freeIdents(n.left, out);
      freeIdents(n.right, out);
      break;
    case "call":
      for (const a of n.args) freeIdents(a, out);
      break;
    case "assign":
      freeIdents(n.value, out);
      break;
    default:
  }
  return out;
}

/** Replace every identifier `name` by `value`. */
export function substitute(n: Node, name: string, value: Node): Node {
  switch (n.type) {
    case "num":
      return n;
    case "ident":
      return n.name === name ? value : n;
    case "unary":
    case "postfix":
      return { ...n, arg: substitute(n.arg, name, value) } as Node;
    case "binary":
    case "implicit":
      return { ...n, left: substitute(n.left, name, value), right: substitute(n.right, name, value) } as Node;
    case "call":
      return { ...n, args: n.args.map((a) => substitute(a, name, value)) };
    case "assign":
      return { ...n, value: substitute(n.value, name, value) };
  }
}

/** Replace every subtree whose key equals `k` by `value`. */
export function replaceKey(n: Node, k: string, value: Node): Node {
  if (key(n) === k) return value;
  switch (n.type) {
    case "num":
    case "ident":
      return n;
    case "unary":
    case "postfix":
      return { ...n, arg: replaceKey(n.arg, k, value) } as Node;
    case "binary":
    case "implicit":
      return { ...n, left: replaceKey(n.left, k, value), right: replaceKey(n.right, k, value) } as Node;
    case "call":
      return { ...n, args: n.args.map((a) => replaceKey(a, k, value)) };
    case "assign":
      return { ...n, value: replaceKey(n.value, k, value) };
  }
}

// ---------- normalization of parser output ----------

/**
 * Rewrites parser quirks into plain structure: "sin x" (implicit with a function name) becomes a call,
 * "x(x+1)" with a single-letter name becomes a product, unknown functions are rejected.
 */
export function normalizeNode(n: Node): Node {
  switch (n.type) {
    case "num":
    case "ident":
      return n;
    case "unary":
    case "postfix":
      return { ...n, arg: normalizeNode(n.arg) } as Node;
    case "binary":
      return { ...n, left: normalizeNode(n.left), right: normalizeNode(n.right) };
    case "assign":
      throw new SymbolicError("unsupported", "assignments are not supported");
    case "call": {
      const args = n.args.map(normalizeNode);
      if (isKnownFunction(n.name)) return { ...n, name: canonFn(n.name), args };
      const l = n.name.toLowerCase();
      if (args.length === 1 && (Array.from(n.name).length === 1 || constName(n.name) !== null) && !"fgh".includes(l)) {
        return mul(ident(n.name), args[0]);
      }
      throw new SymbolicError("unknown_function", `unknown function ${n.name}`);
    }
    case "implicit": {
      const ops: Node[] = [];
      const collect = (m: Node): void => {
        if (m.type === "implicit") {
          collect(m.left);
          collect(m.right);
        } else ops.push(normalizeNode(m));
      };
      collect(n);
      const out: Node[] = [];
      let i = 0;
      while (i < ops.length) {
        const o = ops[i];
        if (o.type === "ident" && isKnownFunction(o.name) && constName(o.name) === null && i + 1 < ops.length) {
          let a = ops[i + 1];
          i += 2;
          if (a.type === "num") {
            while (i < ops.length) {
              const nx = ops[i];
              if (nx.type === "ident" && !isKnownFunction(nx.name)) {
                a = mul(a, nx);
                i++;
              } else break;
            }
          }
          out.push(call(canonFn(o.name), a));
        } else {
          out.push(o);
          i++;
        }
      }
      let acc = out[0];
      for (let k = 1; k < out.length; k++) acc = mul(acc, out[k]);
      return acc;
    }
  }
}

/** Throws too_complex when the tree is larger than MAX_NODES. */
export function assertSize(n: Node): void {
  if (size(n) > MAX_NODES) throw new SymbolicError("too_complex", `more than ${MAX_NODES} nodes`);
}
