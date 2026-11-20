// AST -> human readable unicode text (x², √, minimal parentheses). ascii mode produces text the calc parser accepts.

import type { Node } from "../parser";
import { constName } from "./ast";

export interface TextOptions {
  /** Plain ASCII output re-parsable by src/calc/parser.ts (x^2, sqrt(x), *, pi). */
  ascii?: boolean;
  /** Arithmetic style: explicit "×" and "÷" between operands. */
  arith?: boolean;
  /** Round numbers to this many significant digits. */
  digits?: number;
}

const P_ADD = 1;
const P_MUL = 2;
const P_UNARY = 3;
const P_POW = 4;
const P_POST = 5;
const P_ATOM = 6;

const SUP: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "-": "⁻",
};
const SUB: Record<string, string> = { "2": "₂", "10": "₁₀" };

interface Out {
  s: string;
  p: number;
}

function isIntNum(n: Node): n is Extract<Node, { type: "num" }> {
  return n.type === "num" && n.value.isInteger() && !n.value.isNegative() && n.value.nd <= 6;
}

function isHalf(n: Node): boolean {
  return n.type === "binary" && n.op === "/" && n.left.type === "num" && n.right.type === "num" && n.left.raw === "1" && n.right.raw === "2";
}

function numText(n: Extract<Node, { type: "num" }>, o: TextOptions): string {
  let v = n.value;
  if (o.digits !== undefined && v.nd > o.digits) v = v.roundSig(o.digits);
  return v.toString();
}

function identText(name: string, o: TextOptions): string {
  const c = constName(name);
  if (c === null) return name;
  if (o.ascii) return c;
  return c === "pi" ? "π" : c === "tau" ? "τ" : c === "phi" ? "φ" : "e";
}

function emit(n: Node, o: TextOptions): Out {
  const A = o.ascii === true;
  switch (n.type) {
    case "num":
      return { s: numText(n, o), p: n.value.isNegative() ? P_UNARY : P_ATOM };
    case "ident":
      return { s: identText(n.name, o), p: P_ATOM };
    case "unary": {
      const a = emit(n.arg, o);
      const sign = n.op === "-" ? (A ? "-" : "−") : "+";
      return { s: sign + (a.p < P_MUL ? `(${a.s})` : a.s), p: P_UNARY };
    }
    case "postfix": {
      const a = emit(n.arg, o);
      const s = a.p < P_POST ? `(${a.s})` : a.s;
      return { s: s + (n.op === "factorial" ? "!" : "%"), p: P_POST };
    }
    case "assign":
      return { s: `${n.name} = ${emit(n.value, o).s}`, p: 0 };
    case "call":
      return emitCall(n, o);
    case "implicit":
      return emitMul(n.left, n.right, o);
    case "binary":
      break;
  }
  const b = n;
  switch (b.op) {
    case "+":
    case "-": {
      const l = emit(b.left, o);
      const ls = l.p < P_ADD ? `(${l.s})` : l.s;
      const minus = A ? " - " : " − ";
      let op = b.op;
      let rn = b.right;
      if (rn.type === "unary" && rn.op === "-") {
        op = op === "+" ? "-" : "+";
        rn = rn.arg;
      }
      const r = emit(rn, o);
      const rs = r.p <= P_ADD && (op === "-" || r.p < P_ADD) ? `(${r.s})` : r.s;
      return { s: `${ls}${op === "+" ? " + " : minus}${rs}`, p: P_ADD };
    }
    case "*":
    case "of":
      return emitMul(b.left, b.right, o);
    case "/": {
      const l = emit(b.left, o);
      const r = emit(b.right, o);
      const ls = l.p < P_MUL ? `(${l.s})` : l.s;
      const rs = r.p <= P_MUL ? `(${r.s})` : r.p === P_UNARY && !r.s.startsWith("√") ? `(${r.s})` : r.s;
      const sep = o.arith === true ? (A ? " / " : " ÷ ") : "/";
      return { s: `${ls}${sep}${rs}`, p: P_MUL };
    }
    case "mod": {
      const l = emit(b.left, o);
      const r = emit(b.right, o);
      return { s: `${l.p < P_MUL ? `(${l.s})` : l.s} mod ${r.p <= P_MUL ? `(${r.s})` : r.s}`, p: P_MUL };
    }
    case "^":
      return emitPow(b.left, b.right, o);
  }
}

function emitCall(n: Extract<Node, { type: "call" }>, o: TextOptions): Out {
  const A = o.ascii === true;
  const name = n.name.toLowerCase();
  if (name === "sqrt" && n.args.length === 1 && !A) return emitRoot(n.args[0], o);
  if (name === "abs" && n.args.length === 1 && !A) return { s: `|${emit(n.args[0], o).s}|`, p: P_ATOM };
  if (!A && name === "ln" && n.args.length === 1 && n.args[0].type === "call" && n.args[0].name.toLowerCase() === "abs") {
    return { s: `ln${emit(n.args[0], o).s}`, p: P_ATOM };
  }
  let shown = n.name;
  if (!A && n.args.length === 1) {
    if (name === "log10") shown = "log" + SUB["10"];
    else if (name === "log2") shown = "log" + SUB["2"];
  }
  return { s: `${shown}(${n.args.map((a) => emit(a, o).s).join(", ")})`, p: P_ATOM };
}

function emitRoot(arg: Node, o: TextOptions): Out {
  const a = emit(arg, o);
  const simple = arg.type === "ident" || (arg.type === "num" && !arg.value.isNegative() && a.s.length <= 6 && !a.s.includes("."));
  return { s: simple ? `√${a.s}` : `√(${a.s})`, p: P_UNARY };
}

function emitPow(base: Node, ex: Node, o: TextOptions): Out {
  const A = o.ascii === true;
  if (isHalf(ex)) {
    if (A) return { s: `sqrt(${emit(base, o).s})`, p: P_ATOM };
    return emitRoot(base, o);
  }
  const l = emit(base, o);
  const ls = l.p < P_ATOM ? `(${l.s})` : l.s;
  // superscript digits for small non-negative or negative integer exponents
  if (!A) {
    let neg = false;
    let en: Node = ex;
    if (en.type === "unary" && en.op === "-") {
      neg = true;
      en = en.arg;
    }
    if (isIntNum(en)) {
      const digits = en.value.toString();
      return { s: ls + (neg ? SUP["-"] : "") + Array.from(digits, (d) => SUP[d]).join(""), p: P_POW };
    }
  }
  const r = emit(ex, o);
  const simple = ex.type === "ident" || (ex.type === "num" && !ex.value.isNegative());
  return { s: `${ls}^${simple ? r.s : `(${r.s})`}`, p: P_POW };
}

function startsDigit(s: string): boolean {
  return /^[0-9.]/.test(s);
}

function emitMul(left: Node, right: Node, o: TextOptions): Out {
  const A = o.ascii === true;
  const l = emit(left, o);
  const r = emit(right, o);
  const lDiv = left.type === "binary" && left.op === "/";
  const rDiv = right.type === "binary" && right.op === "/";
  let ls = l.p < P_MUL || lDiv || (left.type === "binary" && (left.op === "mod" || left.op === "of")) ? `(${l.s})` : l.s;
  let rs = r.p < P_MUL || right.type === "unary" || (right.type === "binary" && (right.op === "mod" || right.op === "of")) ? `(${r.s})` : r.s;
  if (rDiv && o.arith !== true) rs = r.s;
  if (lDiv && o.arith === true) ls = l.s.includes(" ") || l.p < P_MUL ? `(${l.s})` : l.s;
  let sep: string;
  if (A) sep = "*";
  else if (o.arith === true) sep = " × ";
  else if (startsDigit(rs)) sep = " × ";
  else if (left.type === "num" && !lDiv) sep = "";
  else if (rs.startsWith("(")) sep = ls.startsWith("(") || /[)\p{L}²³⁰-⁹]$/u.test(ls) ? "" : " ";
  else if (/^(?!e)\p{L}(?!\p{L})/u.test(rs) && /[\p{L}²³⁰-⁹]$/u.test(ls)) sep = "";
  else sep = " ";
  return { s: ls + sep + rs, p: P_MUL };
}

/** Human readable text of an AST. Never throws. */
export function toText(ast: Node, opts: TextOptions = {}): string {
  try {
    return emit(ast, opts).s;
  } catch {
    return "?";
  }
}
