// Canonical-form simplifier.
//
// An expression is kept as a Sum of Terms; a Term is a rational coefficient times a sorted list of factors
// base^exponent (exponent rational). Like terms are merged, constants folded exactly (BigInt rationals,
// radicals of integers pulled apart into prime bases), and the result is rebuilt into a stable AST.
//
// Distribution policy: products are expanded when this keeps the expression small and polynomial-like
// (x(x+1) -> x^2+x, (x+1)(x+2) -> x^2+3x+2) but sums that sit next to a denominator or a power of a sum stay
// factored ((x^2+1)^2 * 2x is not expanded). `expand: true` expands everything within a size cap.

import type { Node } from "../parser";
import {
  add,
  assertSize,
  call,
  constName,
  div,
  ident,
  key,
  mul,
  neg,
  nodeQ,
  normalizeNode,
  numN,
  pow,
  sub,
} from "./ast";
import {
  Q0,
  Q1,
  QHALF,
  QM1,
  iroot,
  q,
  qFromDecimal,
  qabs,
  qadd,
  qeq,
  qfloor,
  qisInt,
  qmul,
  qneg,
  qpow,
  qsub,
  qToNumber,
  type Q,
} from "./rational";
import { SymbolicError } from "./types";

export interface Fac {
  /** Base node (canonical). */
  b: Node;
  /** key(b). */
  k: string;
  /** Rational exponent. */
  e: Q;
  /** Rank for ordering: -1 radical number, 0 constant, 1 variable, 2 call, 3 other, 4 sum atom. */
  r: number;
}
export interface Term {
  c: Q;
  fs: Fac[];
}
export type Sum = Term[];

export interface SimplifyOptions {
  /** Expand products and integer powers of sums (within a size cap). */
  expand?: boolean;
}

export interface Ctx {
  expand: boolean;
  work: number;
}

const WORK_LIMIT = 80_000;
const CAP = 80;

function tick(ctx: Ctx, n = 1): void {
  ctx.work += n;
  if (ctx.work > WORK_LIMIT) throw new SymbolicError("too_complex", "expression is too complex");
}

export const newCtx = (expand = false): Ctx => ({ expand, work: 0 });

// ---------- factors ----------

function rankOf(b: Node): number {
  switch (b.type) {
    case "num":
      return -1;
    case "ident":
      return constName(b.name) !== null ? 0 : 1;
    case "call":
      return 2;
    case "binary":
      return b.op === "+" || b.op === "-" ? 4 : 3;
    default:
      return 3;
  }
}

export function mkFac(b: Node, e: Q): Fac {
  return { b, k: key(b), e, r: rankOf(b) };
}

function cmpFac(a: Fac, b: Fac): number {
  if (a.r !== b.r) return a.r - b.r;
  return a.k < b.k ? -1 : a.k > b.k ? 1 : 0;
}

/** Merge two sorted factor lists, folding numeric bases with integer exponents into the coefficient. */
function mergeFacs(a: Fac[], b: Fac[]): { c: Q; fs: Fac[] } {
  const out: Fac[] = [];
  let c = Q1;
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    let f: Fac;
    if (j >= b.length) f = a[i++];
    else if (i >= a.length) f = b[j++];
    else {
      const cmp = cmpFac(a[i], b[j]);
      if (cmp < 0) f = a[i++];
      else if (cmp > 0) f = b[j++];
      else {
        f = { ...a[i], e: qadd(a[i].e, b[j].e) };
        i++;
        j++;
      }
    }
    if (f.b.type === "num") {
      const pv = qFromDecimal(f.b.value);
      if (pv !== null) {
        const fl = qfloor(f.e);
        if (fl !== 0n) {
          c = qmul(c, qpow(pv, fl));
          f = { ...f, e: qsub(f.e, q(fl)) };
        }
      }
    }
    if (f.e.n !== 0n) out.push(f);
  }
  return { c, fs: out };
}

function mulTerm(a: Term, b: Term): Term {
  const m = mergeFacs(a.fs, b.fs);
  return { c: qmul(qmul(a.c, b.c), m.c), fs: m.fs };
}

function termKey(t: Term): string {
  let s = "";
  for (const f of t.fs) s += `${f.k}^${f.e.n}/${f.e.d}|`;
  return s;
}

function degreeOf(t: Term): number {
  let d = 0;
  for (const f of t.fs) if (f.r === 1) d += qToNumber(f.e);
  return d;
}

function varVector(t: Term): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of t.fs) if (f.r === 1) m.set(f.k, qToNumber(f.e));
  return m;
}

function sortTerms(ts: Term[]): Term[] {
  const dec = ts.map((t) => ({ t, deg: degreeOf(t), k: termKey(t), isConst: t.fs.length === 0, vec: varVector(t) }));
  dec.sort((x, y) => {
    if (x.deg !== y.deg) return y.deg - x.deg;
    if (x.isConst !== y.isConst) return x.isConst ? 1 : -1;
    // graded lexicographic: the alphabetically first variable with a larger exponent comes first
    if (x.vec.size > 0 || y.vec.size > 0) {
      const names = [...new Set([...x.vec.keys(), ...y.vec.keys()])].sort();
      for (const n of names) {
        const ex = x.vec.get(n) ?? 0;
        const ey = y.vec.get(n) ?? 0;
        if (ex !== ey) return ey - ex;
      }
    }
    return x.k < y.k ? -1 : x.k > y.k ? 1 : 0;
  });
  return dec.map((d) => d.t);
}

// ---------- sums ----------

const one = (): Sum => [{ c: Q1, fs: [] }];
const constSum = (c: Q): Sum => (c.n === 0n ? [] : [{ c, fs: [] }]);

export function constOf(s: Sum): Q | null {
  if (s.length === 0) return Q0;
  if (s.length === 1 && s[0].fs.length === 0) return s[0].c;
  return null;
}

function negSum(s: Sum): Sum {
  return s.map((t) => ({ c: qneg(t.c), fs: t.fs }));
}

function collect(terms: Term[]): Sum {
  const map = new Map<string, Term>();
  for (const t of terms) {
    const k = termKey(t);
    const ex = map.get(k);
    if (ex) {
      const c = qadd(ex.c, t.c);
      if (c.n === 0n) map.delete(k);
      else map.set(k, { c, fs: ex.fs });
    } else if (t.c.n !== 0n) map.set(k, t);
  }
  return sortTerms([...map.values()]);
}

function addSums(a: Sum, b: Sum, ctx: Ctx): Sum {
  tick(ctx, a.length + b.length);
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const r = collect([...a, ...b]);
  if (r.length > 200) throw new SymbolicError("too_complex");
  return r;
}

function atomTerm(m: Sum): Term {
  return { c: Q1, fs: [mkFac(buildSum(m), Q1)] };
}

const sticky = (t: Term): boolean => t.fs.some((f) => f.r === 4 || f.e.n < 0n);

function distribute(a: Sum, b: Sum, ctx: Ctx): Sum {
  const out: Term[] = [];
  for (const x of a) for (const y of b) out.push(mulTerm(x, y));
  tick(ctx, out.length);
  const r = collect(out);
  if (r.length > 200) throw new SymbolicError("too_complex");
  return r;
}

function mulSums(a: Sum, b: Sum, ctx: Ctx): Sum {
  if (a.length === 0 || b.length === 0) return [];
  tick(ctx, a.length * b.length);
  if (a.length === 1 && b.length === 1) return [mulTerm(a[0], b[0])];
  if (a.length === 1 || b.length === 1) {
    const s = a.length === 1 ? a[0] : b[0];
    const m = a.length === 1 ? b : a;
    if (s.fs.length === 0 || ctx.expand || !sticky(s)) {
      if (m.length <= CAP) return distribute([s], m, ctx);
    }
    return [mulTerm(s, atomTerm(m))];
  }
  const limit = ctx.expand ? CAP : 16;
  if (a.length * b.length <= limit && (ctx.expand || (!a.some(sticky) && !b.some(sticky)))) return distribute(a, b, ctx);
  return [mulTerm(atomTerm(a), atomTerm(b))];
}

// ---------- powers ----------

const SMALL_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];

function factorSmall(n: bigint): Array<[bigint, number]> {
  const out: Array<[bigint, number]> = [];
  for (const p of SMALL_PRIMES) {
    const P = BigInt(p);
    if (P * P > n) break;
    let m = 0;
    while (n % P === 0n) {
      n /= P;
      m++;
    }
    if (m > 0) out.push([P, m]);
  }
  if (n > 1n) out.push([n, 1]);
  return out;
}

/** c^e for a positive rational c and a non-integer rational e: coefficient and prime radicals. */
function numPow(c: Q, e: Q): { c: Q; fs: Fac[] } {
  let coef = Q1;
  const fs: Fac[] = [];
  const parts: Array<[bigint, Q]> = [];
  for (const [p, m] of factorSmall(c.n)) parts.push([p, qmul(e, q(m))]);
  for (const [p, m] of factorSmall(c.d)) parts.push([p, qmul(e, q(-m))]);
  for (let [p, t] of parts) {
    // A leftover large factor may itself be a perfect power.
    if (p > 10000n && e.d <= 6n) {
      const r = iroot(p, Number(e.d));
      if (r ** e.d === p) {
        p = r;
        t = qmul(t, q(e.d));
      }
    }
    const ip = qfloor(t);
    const frac = qsub(t, q(ip));
    if (ip !== 0n) coef = qmul(coef, qpow(q(p), ip));
    if (frac.n !== 0n) fs.push(mkFac(numN(p), frac));
  }
  fs.sort(cmpFac);
  return { c: coef, fs };
}

function termNode(t: Term): Node {
  const b = buildTerm(t);
  return b.neg ? neg(b.node) : b.node;
}

function powTerm(t: Term, e: Q, ctx: Ctx): Sum {
  tick(ctx);
  let c: Q;
  let fs: Fac[] = [];
  if (qisInt(e)) {
    c = qpow(t.c, e.n);
  } else {
    if (t.c.n < 0n) return [{ c: Q1, fs: [mkFac(termNode(t), e)] }];
    const np = numPow(t.c, e);
    c = np.c;
    fs = np.fs;
  }
  const tail: Fac[] = [];
  for (const f of t.fs) {
    const ne = qmul(f.e, e);
    if (!qisInt(e) && qisInt(f.e) && f.e.n % 2n === 0n && e.d % 2n === 0n && f.r !== -1) {
      tail.push(mkFac(call("abs", f.b), ne));
    } else tail.push({ ...f, e: ne });
  }
  tail.sort(cmpFac);
  const m1 = mergeFacs(fs, tail);
  return [{ c: qmul(c, m1.c), fs: m1.fs }];
}

function powConst(a: Sum, e: Q, ctx: Ctx): Sum {
  tick(ctx);
  if (e.n === 0n) return one();
  if (qeq(e, Q1)) return a;
  if (a.length === 0) {
    if (e.n < 0n) throw new SymbolicError("div_zero", "division by zero");
    return [];
  }
  if (a.length === 1) return powTerm(a[0], e, ctx);
  if (ctx.expand && qisInt(e) && e.n > 1n && e.n <= 12n) {
    let r = a;
    for (let i = 1n; i < e.n; i++) r = mulSums(r, a, ctx);
    return r;
  }
  return [{ c: Q1, fs: [mkFac(buildSum(a), e)] }];
}

const E_SUM = (): Sum => [{ c: Q1, fs: [mkFac(ident("e"), Q1)] }];

function isConstE(a: Sum): boolean {
  return a.length === 1 && qeq(a[0].c, Q1) && a[0].fs.length === 1 && a[0].fs[0].k === "e" && qeq(a[0].fs[0].e, Q1);
}

function powSums(a: Sum, ex: Sum, ctx: Ctx): Sum {
  const eq = constOf(ex);
  if (eq !== null) return powConst(a, eq, ctx);
  const ac = constOf(a);
  if (ac !== null && qeq(ac, Q1)) return one();
  if (isConstE(a) && ex.length === 1 && ex[0].fs.length === 1 && ex[0].fs[0].b.type === "call" && ex[0].fs[0].b.name === "ln" && qeq(ex[0].fs[0].e, Q1)) {
    // e^(c ln u) = u^c
    const u = ex[0].fs[0].b.args[0];
    return powConst(fromNode(u, ctx), ex[0].c, ctx);
  }
  return [{ c: Q1, fs: [mkFac(pow(buildSum(a), buildSum(ex)), Q1)] }];
}

// ---------- functions ----------

const SIXTH: Array<[number, number]> = [
  // [rational numerator over 2, radical (0 none, 3 = sqrt 3)]
  [0, 0],
  [1, 0],
  [1, 3],
  [2, 0],
  [1, 3],
  [1, 0],
  [0, 0],
  [-1, 0],
  [-1, 3],
  [-2, 0],
  [-1, 3],
  [-1, 0],
];
const FOURTH: Array<[number, number]> = [
  [0, 0],
  [1, 2],
  [2, 0],
  [1, 2],
  [0, 0],
  [-1, 2],
  [-2, 0],
  [-1, 2],
];

function tableSum(entry: [number, number]): Sum {
  const [h, rad] = entry;
  if (h === 0) return [];
  if (rad === 0) return constSum(q(h, 2));
  return [{ c: q(h, 2), fs: [mkFac(numN(rad), QHALF)] }];
}

function mod(a: number, m: number): number {
  return ((a % m) + m) % m;
}

function trigSpecial(name: string, a: Sum, ctx: Ctx): Sum | null {
  const c0 = constOf(a);
  if (c0 !== null && c0.n === 0n) {
    switch (name) {
      case "sin":
      case "tan":
      case "asin":
      case "atan":
      case "sinh":
      case "tanh":
        return [];
      case "cos":
      case "cosh":
      case "sec":
        return one();
      case "acos":
        return [{ c: QHALF, fs: [mkFac(ident("pi"), Q1)] }];
      default:
        return null;
    }
  }
  if (c0 !== null && qeq(c0, Q1)) {
    if (name === "asin") return [{ c: QHALF, fs: [mkFac(ident("pi"), Q1)] }];
    if (name === "atan") return [{ c: q(1, 4), fs: [mkFac(ident("pi"), Q1)] }];
    if (name === "acos") return [];
  }
  if (!(a.length === 1 && a[0].fs.length === 1 && a[0].fs[0].k === "pi" && qeq(a[0].fs[0].e, Q1))) return null;
  if (!["sin", "cos", "tan", "cot", "sec", "csc"].includes(name)) return null;
  const c = a[0].c;
  const k6 = qmul(c, q(6));
  const k4 = qmul(c, q(4));
  let sinS: Sum;
  let cosS: Sum;
  if (qisInt(k6)) {
    const m = mod(Number(k6.n % 12n), 12);
    sinS = tableSum(SIXTH[m]);
    cosS = tableSum(SIXTH[(m + 3) % 12]);
  } else if (qisInt(k4)) {
    const m = mod(Number(k4.n % 8n), 8);
    sinS = tableSum(FOURTH[m]);
    cosS = tableSum(FOURTH[(m + 2) % 8]);
  } else return null;
  switch (name) {
    case "sin":
      return sinS;
    case "cos":
      return cosS;
    case "tan":
      return cosS.length === 0 ? null : mulSums(sinS, powConst(cosS, QM1, ctx), ctx);
    case "cot":
      return sinS.length === 0 ? null : mulSums(cosS, powConst(sinS, QM1, ctx), ctx);
    case "sec":
      return cosS.length === 0 ? null : powConst(cosS, QM1, ctx);
    default:
      return sinS.length === 0 ? null : powConst(sinS, QM1, ctx);
  }
}

const ODD = new Set(["sin", "tan", "cot", "csc", "asin", "atan", "sinh", "tanh"]);
const EVEN = new Set(["cos", "sec", "cosh"]);
const ARITY1 = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc", "asin", "acos", "atan", "sinh", "cosh", "tanh", "ln", "log10", "log2", "sqrt", "cbrt",
  "exp", "abs", "floor", "ceil", "trunc", "sign", "fact",
]);

function atomCall(name: string, args: Sum[]): Sum {
  return [{ c: Q1, fs: [mkFac(call(name, ...args.map(buildSum)), Q1)] }];
}

function fnSum(name: string, as: Sum[], ctx: Ctx): Sum {
  tick(ctx);
  if (ARITY1.has(name) && as.length !== 1) throw new SymbolicError("invalid", `${name} expects 1 argument`);
  const a = as[0];
  switch (name) {
    case "sqrt":
      return powConst(a, QHALF, ctx);
    case "cbrt":
      return powConst(a, q(1, 3), ctx);
    case "exp":
      return powSums(E_SUM(), a, ctx);
    case "pow":
      if (as.length !== 2) throw new SymbolicError("invalid", "pow expects 2 arguments");
      return powSums(as[0], as[1], ctx);
    case "log":
      if (as.length === 1) return fnSum("log10", as, ctx);
      if (as.length === 2) return mulSums(fnSum("ln", [as[0]], ctx), powConst(fnSum("ln", [as[1]], ctx), QM1, ctx), ctx);
      throw new SymbolicError("invalid", "log expects 1 or 2 arguments");
    case "ln": {
      const c = constOf(a);
      if (c !== null) {
        if (c.n <= 0n) throw new SymbolicError("domain", "ln of a non-positive number");
        if (qeq(c, Q1)) return [];
      }
      if (a.length === 1 && qeq(a[0].c, Q1) && a[0].fs.length === 1) {
        const f = a[0].fs[0];
        if (f.k === "e") return constSum(f.e);
        if (f.b.type === "binary" && f.b.op === "^" && f.b.left.type === "ident" && f.b.left.name === "e") {
          return mulSums(constSum(f.e), fromNode(f.b.right, ctx), ctx);
        }
      }
      return atomCall("ln", [a]);
    }
    case "abs": {
      const c = constOf(a);
      if (c !== null) return constSum(qabs(c));
      if (a.length === 1) {
        if (a[0].c.n < 0n) return fnSum("abs", [negSum(a)], ctx);
        if (qeq(a[0].c, Q1) && a[0].fs.length === 1 && a[0].fs[0].b.type === "call" && a[0].fs[0].b.name === "abs" && qeq(a[0].fs[0].e, Q1)) return a;
      }
      return atomCall("abs", [a]);
    }
    case "floor":
    case "ceil":
    case "trunc":
    case "sign": {
      const c = constOf(a);
      if (c !== null) {
        if (name === "floor") return constSum(q(qfloor(c)));
        if (name === "ceil") return constSum(q(-qfloor(qneg(c))));
        if (name === "trunc") return constSum(q(c.n / c.d));
        return constSum(q(c.n < 0n ? -1 : c.n > 0n ? 1 : 0));
      }
      return atomCall(name, [a]);
    }
    case "fact": {
      const c = constOf(a);
      if (c !== null && qisInt(c) && c.n >= 0n && c.n <= 25n) {
        let r = 1n;
        for (let i = 2n; i <= c.n; i++) r *= i;
        return constSum(q(r));
      }
      return atomCall("fact", [a]);
    }
    default:
  }
  if (ODD.has(name) && a.length === 1 && a[0].c.n < 0n) return negSum(fnSum(name, [negSum(a)], ctx));
  if (EVEN.has(name) && a.length === 1 && a[0].c.n < 0n) return fnSum(name, [negSum(a)], ctx);
  if (as.length === 1) {
    const sp = trigSpecial(name, a, ctx);
    if (sp !== null) return sp;
  }
  return atomCall(name, as);
}

// ---------- tree -> Sum ----------

function gather(n: Node, s: 1 | -1, out: Array<[Node, 1 | -1]>): void {
  if (n.type === "binary" && (n.op === "*" || n.op === "of")) {
    gather(n.left, s, out);
    gather(n.right, s, out);
  } else if (n.type === "implicit") {
    gather(n.left, s, out);
    gather(n.right, s, out);
  } else if (n.type === "binary" && n.op === "/") {
    gather(n.left, s, out);
    gather(n.right, s === 1 ? -1 : 1, out);
  } else out.push([n, s]);
}

export function fromNode(n: Node, ctx: Ctx): Sum {
  tick(ctx);
  switch (n.type) {
    case "num": {
      const x = qFromDecimal(n.value);
      if (x !== null) return constSum(x);
      return [{ c: Q1, fs: [mkFac(n, Q1)] }];
    }
    case "ident": {
      const cn = constName(n.name);
      return [{ c: Q1, fs: [mkFac(cn !== null ? ident(cn) : n, Q1)] }];
    }
    case "unary":
      return n.op === "-" ? negSum(fromNode(n.arg, ctx)) : fromNode(n.arg, ctx);
    case "postfix": {
      const a = fromNode(n.arg, ctx);
      if (n.op === "percent") return mulSums(a, constSum(q(1, 100)), ctx);
      const c = constOf(a);
      if (c !== null && qisInt(c) && c.n >= 0n && c.n <= 25n) return fnSum("fact", [a], ctx);
      return [{ c: Q1, fs: [mkFac({ type: "postfix", op: "factorial", arg: buildSum(a), pos: 0, end: 0 }, Q1)] }];
    }
    case "binary": {
      switch (n.op) {
        case "+":
          return addSums(fromNode(n.left, ctx), fromNode(n.right, ctx), ctx);
        case "-":
          return addSums(fromNode(n.left, ctx), negSum(fromNode(n.right, ctx)), ctx);
        case "^":
          return powSums(fromNode(n.left, ctx), fromNode(n.right, ctx), ctx);
        case "mod": {
          const l = fromNode(n.left, ctx);
          const r = fromNode(n.right, ctx);
          const lc = constOf(l);
          const rc = constOf(r);
          if (lc !== null && rc !== null && qisInt(lc) && qisInt(rc) && lc.n >= 0n && rc.n > 0n) return constSum(q(lc.n % rc.n));
          return [{ c: Q1, fs: [mkFac({ type: "binary", op: "mod", left: buildSum(l), right: buildSum(r), pos: 0, end: 0 }, Q1)] }];
        }
        default: {
          const fac: Array<[Node, 1 | -1]> = [];
          gather(n, 1, fac);
          let acc = one();
          for (const [f, s] of fac) {
            let F = fromNode(f, ctx);
            if (s < 0) F = powConst(F, QM1, ctx);
            acc = mulSums(acc, F, ctx);
          }
          return acc;
        }
      }
    }
    case "implicit": {
      const fac: Array<[Node, 1 | -1]> = [];
      gather(n, 1, fac);
      let acc = one();
      for (const [f, s] of fac) {
        let F = fromNode(f, ctx);
        if (s < 0) F = powConst(F, QM1, ctx);
        acc = mulSums(acc, F, ctx);
      }
      return acc;
    }
    case "call":
      return fnSum(
        n.name.toLowerCase(),
        n.args.map((a) => fromNode(a, ctx)),
        ctx,
      );
    case "assign":
      throw new SymbolicError("unsupported", "assignments are not supported");
  }
}

// ---------- Sum -> tree ----------

function facNode(f: Fac, e: Q): Node {
  const b = f.b;
  if (qeq(e, Q1)) return b;
  if (b.type === "binary" && b.op === "^" && f.r === 3 && b.right.type !== "num") {
    // (a^x)^k -> a^(k x)
    const ex = buildSum(mulSums(fromNode(b.right, newCtx()), constSum(e), newCtx()));
    return pow(b.left, ex);
  }
  return pow(b, nodeQ(e));
}

export function buildTerm(t: Term): { neg: boolean; node: Node } {
  const pos: Node[] = [];
  const den: Node[] = [];
  for (const f of t.fs) {
    if (f.e.n > 0n) pos.push(facNode(f, f.e));
    else den.push(facNode(f, qabs(f.e)));
  }
  const cn = t.c.n < 0n ? -t.c.n : t.c.n;
  const numer: Node[] = [];
  if (cn !== 1n || pos.length === 0) numer.push(numN(cn));
  numer.push(...pos);
  const denom: Node[] = [];
  if (t.c.d !== 1n) denom.push(numN(t.c.d));
  denom.push(...den);
  const fold = (xs: Node[]): Node => xs.reduce((a, b) => mul(a, b));
  let node = fold(numer);
  if (denom.length > 0) node = div(node, fold(denom));
  return { neg: t.c.n < 0n, node };
}

export function buildSum(s: Sum): Node {
  if (s.length === 0) return numN(0);
  let acc: Node | null = null;
  for (const t of s) {
    const { neg: isNeg, node } = buildTerm(t);
    if (acc === null) acc = isNeg ? neg(node) : node;
    else acc = isNeg ? sub(acc, node) : add(acc, node);
  }
  return acc as Node;
}

// ---------- public entry points ----------

/** Canonical form of an AST. Throws SymbolicError (div_zero, too_complex, unknown_function, ...). */
export function simplifyStrict(n: Node, opts: SimplifyOptions & { check?: boolean } = {}): Node {
  const norm = normalizeNode(n);
  if (opts.check !== false) assertSize(norm);
  return buildSum(fromNode(norm, newCtx(opts.expand === true)));
}

/** Canonical Sum of an AST (used by the integrator and the solver). */
export function toSum(n: Node, expand = false, check = true): Sum {
  const norm = normalizeNode(n);
  if (check) assertSize(norm);
  return fromNode(norm, newCtx(expand));
}

export function sumToNode(s: Sum): Node {
  return buildSum(s);
}

/** Do two canonical nodes have the same structure? */
export function sameNode(a: Node, b: Node): boolean {
  return key(a) === key(b);
}

