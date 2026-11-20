// Equation solving: polynomials up to degree 4 (biquadratic) plus rational-root deflation and x^n = a,
// and 2x2 linear systems (Cramer). Every answer comes with a step trace.

import { CalcError } from "../errors";
import { parse, type Node } from "../parser";
import { add, call, freeIdents, ident, mul, nodeQ, numN, pow, sub, substitute } from "./ast";
import { Q0, Q1, gcd, q, qabs, qadd, qdiv, qeq, qisInt, qmul, qneg, qsub, qToNumber, type Q } from "./rational";
import { simplifyStrict, toSum, type Sum } from "./simplify";
import { toText } from "./text";
import { SymbolicError, type Step } from "./types";

export interface Root {
  kind: "real" | "complex";
  /** Display text, e.g. "3", "(1 + √5)/2", "1/2 − (√3/2)i", "1.3247". */
  text: string;
  /** Exact value (real roots only, when closed form is available), otherwise null. */
  exact: Node | null;
  re: number;
  im: number;
}

export interface EquationSolution {
  /** roots: finite list; all: every number is a solution; none: no solution. */
  kind: "roots" | "all" | "none";
  roots: Root[];
  degree: number;
  variable: string;
  /** "x = 2, x = 3". */
  text: string;
  steps: Step[];
}

const SUP_MAP: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };

/** Parse user text (superscripts allowed) into an AST. Throws SymbolicError('parse'). */
export function parseExpression(input: string | Node): Node {
  if (typeof input !== "string") return input;
  const t = input.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (m) => "^" + Array.from(m, (c) => SUP_MAP[c]).join(""));
  try {
    return parse(t);
  } catch (e) {
    if (e instanceof CalcError) throw new SymbolicError(e.code === "too_long" || e.code === "too_deep" ? "too_complex" : "parse", e.message);
    throw e;
  }
}

/** Split "a = b" into [a, b]. A text without "=" is "expr = 0". */
function parseEquation(input: string | Node): [Node, Node] {
  if (typeof input !== "string") {
    if (input.type === "assign") return [ident(input.name), input.value];
    return [input, numN(0)];
  }
  if (/[<>≤≥≠]/.test(input)) throw new SymbolicError("unsupported", "inequalities are not supported");
  const i = input.indexOf("=");
  if (i < 0) return [parseExpression(input), numN(0)];
  if (input.indexOf("=", i + 1) >= 0) throw new SymbolicError("parse", "more than one '='");
  return [parseExpression(input.slice(0, i)), parseExpression(input.slice(i + 1))];
}

// ---------- helpers ----------

const fmtQ = (x: Q): string => toText(nodeQ(x));

function polyNode(c: Q[], v: string): Node {
  let acc: Node | null = null;
  for (let k = c.length - 1; k >= 0; k--) {
    if (c[k].n === 0n) continue;
    const t = k === 0 ? nodeQ(c[k]) : mul(nodeQ(c[k]), k === 1 ? ident(v) : pow(ident(v), numN(k)));
    acc = acc === null ? t : add(acc, t);
  }
  return simplifyStrict(acc ?? numN(0), { check: false });
}

const eqText = (c: Q[], v: string): string => `${toText(polyNode(c, v))} = 0`;

function coeffsOf(s: Sum, v: string): Q[] | null {
  const out: Q[] = [];
  for (const t of s) {
    let deg = 0;
    if (t.fs.length === 1 && t.fs[0].b.type === "ident" && t.fs[0].b.name === v && qisInt(t.fs[0].e) && t.fs[0].e.n > 0n && t.fs[0].e.n <= 64n) {
      deg = Number(t.fs[0].e.n);
    } else if (t.fs.length !== 0) return null;
    while (out.length <= deg) out.push(Q0);
    out[deg] = qadd(out[deg], t.c);
  }
  while (out.length > 0 && out[out.length - 1].n === 0n) out.pop();
  return out;
}

function realRoot(text: string, exact: Node | null, re: number): Root {
  return { kind: "real", text, exact, re, im: 0 };
}

function numText(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  const s = Number(x.toPrecision(10));
  const t = Object.is(s, -0) ? "0" : String(s);
  return t.replace("-", "−");
}

function complexRoot(re: number, im: number): Root {
  const r = Math.abs(re) < 1e-12 ? 0 : re;
  const reText = r === 0 ? "" : numText(r);
  const imAbs = numText(Math.abs(im));
  const body = imAbs === "1" ? "i" : `${imAbs}i`;
  const text = r === 0 ? (im < 0 ? `−${body}` : body) : `${reText} ${im < 0 ? "−" : "+"} ${body}`;
  return { kind: "complex", text, exact: null, re: r, im };
}

function factorize(n: bigint): Array<[bigint, number]> {
  const out: Array<[bigint, number]> = [];
  let m = n;
  for (let p = 2n; p * p <= m && p < 200000n; p += p === 2n ? 1n : 2n) {
    let e = 0;
    while (m % p === 0n) {
      m /= p;
      e++;
    }
    if (e > 0) out.push([p, e]);
  }
  if (m > 1n) out.push([m, 1]);
  return out;
}

/** sqrt(D) = s * sqrt(m) with m square free (as far as factoring reaches); D > 0 rational. */
function sqrtParts(D: Q): { s: Q; m: bigint } {
  const N = D.n * D.d;
  let s = 1n;
  let m = 1n;
  for (const [p, e] of factorize(N)) {
    s *= p ** BigInt(Math.floor(e / 2));
    if (e % 2 === 1) m *= p;
  }
  return { s: q(s, D.d), m };
}

function radText(p: Q, c: Q, m: bigint, sgn: 1 | -1): string {
  // value p + sgn * c * sqrt(m), c > 0
  const den = (p.d * c.d) / gcd(p.d, c.d);
  const P = p.n * (den / p.d);
  const C = c.n * (den / c.d);
  const rad = `${C === 1n ? "" : C}√${m}`;
  const mark = sgn < 0 ? "−" : "+";
  if (P === 0n) {
    const body = `${sgn < 0 ? "−" : ""}${rad}`;
    return den === 1n ? body : `${body}/${den}`;
  }
  const inner = `${P < 0n ? "−" + -P : P} ${mark} ${rad}`;
  return den === 1n ? inner : `(${inner})/${den}`;
}

function radNode(p: Q, c: Q, m: bigint, sgn: 1 | -1): Node {
  const r = mul(nodeQ(sgn < 0 ? qneg(c) : c), call("sqrt", numN(m)));
  return simplifyStrict(p.n === 0n ? r : add(nodeQ(p), r), { check: false });
}

// ---------- polynomial solving ----------

class Solver {
  readonly steps: Step[] = [];
  readonly roots: Root[] = [];

  constructor(private readonly v: string) {}

  private addRational(x: Q): void {
    this.roots.push(realRoot(fmtQ(x), nodeQ(x), qToNumber(x)));
  }

  private check(c: Q[], x: Q): void {
    if (this.steps.length > 30) return;
    const P = polyNode(c, this.v);
    const sub1 = substitute(P, this.v, nodeQ(x));
    try {
      const r = simplifyStrict(sub1, { check: false });
      if (r.type === "num" && r.value.isZero()) this.steps.push({ rule: "check", before: toText(sub1), after: "0" });
    } catch {
      /* ignore */
    }
  }

  linear(c: Q[]): void {
    const x = qneg(qdiv(c[0], c[1]));
    const note = c[0].n === 0n ? undefined : `${toText(simplifyStrict(mul(nodeQ(c[1]), ident(this.v)), { check: false }))} = ${fmtQ(qneg(c[0]))}`;
    this.steps.push({ rule: "linear", before: eqText(c, this.v), after: `${this.v} = ${fmtQ(x)}`, ...(note ? { note } : {}) });
    this.addRational(x);
    this.check(c, x);
  }

  quadratic(c: Q[]): void {
    const [c0, c1, c2] = c;
    const D = qsub(qmul(c1, c1), qmul(q(4), qmul(c2, c0)));
    const dNode = sub(mul(pow(nodeQ(c1), numN(2)), numN(1)), mul(mul(numN(4), nodeQ(c2)), nodeQ(c0)));
    this.steps.push({
      rule: "discriminant",
      before: `D = ${toText(dNode)}`,
      after: `D = ${fmtQ(D)}`,
      note: `a = ${fmtQ(c2)}, b = ${fmtQ(c1)}, c = ${fmtQ(c0)}`,
    });
    const v = this.v;
    const twoA = qmul(q(2), c2);
    const p = qneg(qdiv(c1, twoA));
    if (D.n === 0n) {
      this.steps.push({ rule: "root", before: `${v} = −b / (2a)`, after: `${v} = ${fmtQ(p)}` });
      this.addRational(p);
      this.check(c, p);
      return;
    }
    if (D.n > 0n) {
      const { s, m } = sqrtParts(D);
      const cq = qabs(qdiv(s, twoA));
      if (m === 1n) {
        const x1 = qadd(p, cq);
        const x2 = qsub(p, cq);
        const [lo, hi] = qToNumber(x1) <= qToNumber(x2) ? [x1, x2] : [x2, x1];
        this.steps.push({
          rule: "root",
          before: `${v} = (−b ± √D) / (2a)`,
          after: `${v}₁ = ${fmtQ(lo)}, ${v}₂ = ${fmtQ(hi)}`,
        });
        this.addRational(lo);
        this.addRational(hi);
        this.check(c, lo);
        this.check(c, hi);
        return;
      }
      const num = Math.sqrt(qToNumber(D)) / (2 * qToNumber(c2));
      const pn = qToNumber(p);
      const rs: Root[] = [1, -1].map((sg) => realRoot(radText(p, cq, m, sg as 1 | -1), radNode(p, cq, m, sg as 1 | -1), pn + sg * Math.abs(num)));
      this.steps.push({
        rule: "root",
        before: `${v} = (−b ± √D) / (2a)`,
        after: `${v}₁ = ${rs[1].text}, ${v}₂ = ${rs[0].text}`,
        note: `√${fmtQ(D)} = ${toText(simplifyStrict(call("sqrt", nodeQ(D)), { check: false }))}`,
      });
      this.roots.push(rs[1], rs[0]);
      return;
    }
    // D < 0: complex pair
    const { s, m } = sqrtParts(qneg(D));
    const cq = qabs(qdiv(s, twoA));
    const imNum = Math.sqrt(-qToNumber(D)) / (2 * Math.abs(qToNumber(c2)));
    const reNum = qToNumber(p);
    const imPart = m === 1n ? fmtQ(cq) : radText(Q0, cq, m, 1);
    const imShown = imPart === "1" ? "i" : m === 1n ? `${imPart}i` : `(${imPart})i`;
    const reShown = p.n === 0n ? "" : fmtQ(p);
    const mk = (sg: 1 | -1): Root => {
      const text = reShown === "" ? (sg < 0 ? `−${imShown}` : imShown) : `${reShown} ${sg < 0 ? "−" : "+"} ${imShown}`;
      return { kind: "complex", text, exact: null, re: reNum, im: sg * imNum };
    };
    const r1 = mk(1);
    const r2 = mk(-1);
    this.steps.push({
      rule: "root",
      before: `${v} = (−b ± i√(−D)) / (2a)`,
      after: `${v}₁ = ${r1.text}, ${v}₂ = ${r2.text}`,
      note: "D < 0",
    });
    this.roots.push(r1, r2);
  }

  /** Divisors-based rational root search on integer scaled coefficients. */
  private rationalRoots(c: Q[]): Q[] {
    let L = 1n;
    for (const x of c) L = (L * x.d) / gcd(L, x.d);
    const ic = c.map((x) => (x.n * L) / x.d);
    const a0 = ic[0] < 0n ? -ic[0] : ic[0];
    const an = ic[ic.length - 1] < 0n ? -ic[ic.length - 1] : ic[ic.length - 1];
    if (a0 === 0n || a0 > 10n ** 10n || an > 10n ** 10n) return [];
    const divs = (n: bigint): bigint[] => {
      const out: bigint[] = [];
      for (let d = 1n; d * d <= n; d++) {
        if (n % d === 0n) {
          out.push(d);
          if (d * d !== n) out.push(n / d);
        }
      }
      return out;
    };
    const ps = divs(a0);
    const qs = divs(an);
    if (ps.length * qs.length > 4000) return [];
    const found: Q[] = [];
    const seen = new Set<string>();
    for (const p of ps) {
      for (const d of qs) {
        for (const sg of [1n, -1n]) {
          const cand = q(sg * p, d);
          const k = `${cand.n}/${cand.d}`;
          if (seen.has(k)) continue;
          seen.add(k);
          let acc = Q0;
          for (let i = c.length - 1; i >= 0; i--) acc = qadd(qmul(acc, cand), c[i]);
          if (acc.n === 0n) found.push(cand);
        }
      }
    }
    return found;
  }

  private deflate(c: Q[], r: Q): Q[] {
    // synthetic division of c (ascending) by (x - r)
    const n = c.length - 1;
    const out: Q[] = new Array(n).fill(Q0);
    let carry = Q0;
    for (let i = n; i >= 1; i--) {
      carry = qadd(c[i], qmul(carry, r));
      out[i - 1] = carry;
    }
    return out;
  }

  cubic(c: Q[]): void {
    const a = c[3];
    const A = qdiv(c[2], a);
    const B = qdiv(c[1], a);
    const C = qdiv(c[0], a);
    const p = qsub(B, qdiv(qmul(A, A), q(3)));
    const qq = qadd(qsub(qdiv(qmul(q(2), qmul(A, qmul(A, A))), q(27)), qdiv(qmul(A, B), q(3))), C);
    const half = qdiv(qq, q(2));
    const third = qdiv(p, q(3));
    const disc = qadd(qmul(half, half), qmul(third, qmul(third, third))); // (q/2)^2 + (p/3)^3
    const shift = qToNumber(A) / 3;
    const pn = qToNumber(p);
    const qn = qToNumber(qq);
    const reals: number[] = [];
    let cplx: [number, number] | null = null;
    if (disc.n < 0n) {
      const m = 2 * Math.sqrt(-pn / 3);
      const arg = Math.max(-1, Math.min(1, ((3 * qn) / (2 * pn)) * Math.sqrt(-3 / pn)));
      const th = Math.acos(arg) / 3;
      for (let k = 0; k < 3; k++) reals.push(m * Math.cos(th - (2 * Math.PI * k) / 3) - shift);
    } else if (disc.n === 0n) {
      if (pn === 0) reals.push(-shift);
      else {
        reals.push((3 * qn) / pn - shift);
        reals.push((-3 * qn) / (2 * pn) - shift);
      }
    } else {
      const sd = Math.sqrt(qToNumber(disc));
      const u = Math.cbrt(-qn / 2 + sd);
      const w = Math.cbrt(-qn / 2 - sd);
      const t1 = u + w;
      reals.push(t1 - shift);
      cplx = [-(u + w) / 2 - shift, (Math.sqrt(3) / 2) * (u - w)];
    }
    // Newton polishing on the original polynomial
    const cn = c.map(qToNumber);
    const evalP = (x: number): number => cn.reduceRight((acc, k) => acc * x + k, 0);
    const evalD = (x: number): number => {
      let acc = 0;
      for (let i = cn.length - 1; i >= 1; i--) acc = acc * x + i * cn[i];
      return acc;
    };
    const polished = reals.map((x0) => {
      let x = x0;
      for (let k = 0; k < 4; k++) {
        const d = evalD(x);
        if (d === 0) break;
        const nx = x - evalP(x) / d;
        if (!Number.isFinite(nx)) break;
        x = nx;
      }
      return x;
    });
    const out: Root[] = [];
    const uniq: number[] = [];
    for (const x of polished.sort((m1, m2) => m1 - m2)) if (!uniq.some((y) => Math.abs(y - x) < 1e-9 * (1 + Math.abs(x)))) uniq.push(x);
    for (const x of uniq) out.push(realRoot(numText(x), null, x));
    if (cplx !== null) {
      // refine the complex pair from the deflated quadratic x^2 + s x + t with real root r: s = A + r, t = ...
      const r = polished[0];
      const s1 = qToNumber(A) + r;
      const t1 = qToNumber(B) + r * s1;
      const dd = s1 * s1 - 4 * t1;
      const im = Math.sqrt(Math.max(0, -dd)) / 2;
      out.push(complexRoot(-s1 / 2, im), complexRoot(-s1 / 2, -im));
    }
    this.steps.push({
      rule: "cubic",
      before: eqText(c, this.v),
      after: out.map((r, i) => `${this.v}${i === 0 ? "₁" : i === 1 ? "₂" : "₃"} ≈ ${r.text}`).join(", "),
      note: `p = ${fmtQ(p)}, q = ${fmtQ(qq)}, Δ = ${fmtQ(qneg(qmul(q(108), disc)))}`,
    });
    this.roots.push(...out);
  }

  binomial(c: Q[]): boolean {
    const n = c.length - 1;
    if (n < 3 || n > 12) return false;
    for (let k = 1; k < n; k++) if (c[k].n !== 0n) return false;
    const r = qneg(qdiv(c[0], c[n]));
    const v = this.v;
    const rn = qToNumber(r);
    this.steps.push({ rule: "root", before: eqText(c, v), after: `${v}^${n} = ${fmtQ(r)}` });
    const rho = Math.pow(Math.abs(rn), 1 / n);
    const exactAbs = (): Node => simplifyStrict(pow(nodeQ(qabs(r)), nodeQ(q(1, n))), { check: false });
    const reals: Root[] = [];
    if (r.n === 0n) {
      this.addRational(Q0);
      return true;
    }
    if (n % 2 === 1) {
      const x = exactAbs();
      const node = r.n < 0n ? simplifyStrict(mul(numN(-1), x), { check: false }) : x;
      reals.push(realRoot(toText(node), node, (r.n < 0n ? -1 : 1) * rho));
    } else if (r.n > 0n) {
      const x = exactAbs();
      const m = simplifyStrict(mul(numN(-1), x), { check: false });
      reals.push(realRoot(`−${toText(x)}`, m, -rho), realRoot(toText(x), x, rho));
    }
    const out: Root[] = [...reals];
    for (let k = 0; k < n; k++) {
      const th = ((r.n < 0n ? Math.PI : 0) + 2 * Math.PI * k) / n;
      const re = rho * Math.cos(th);
      const im = rho * Math.sin(th);
      if (Math.abs(im) < 1e-9 * (1 + rho)) continue;
      out.push(complexRoot(re, im));
    }
    this.steps.push({ rule: "root", before: `${v}^${n} = ${fmtQ(r)}`, after: out.map((x) => `${v} = ${x.text}`).join(", "), note: "n-th root" });
    this.roots.push(...out);
    return true;
  }

  biquadratic(c: Q[]): boolean {
    if (c.length !== 5 || c[1].n !== 0n || c[3].n !== 0n) return false;
    const v = this.v;
    this.steps.push({ rule: "root", before: eqText(c, v), after: `${c[4].n === 1n ? "" : fmtQ(c[4])}t² ${c[2].n < 0n ? "−" : "+"} ${fmtQ(qabs(c[2]))}t ${c[0].n < 0n ? "−" : "+"} ${fmtQ(qabs(c[0]))} = 0`, note: `t = ${v}²` });
    const inner = new Solver("t");
    inner.quadratic([c[0], c[2], c[4]]);
    this.steps.push(...inner.steps);
    const out: Root[] = [];
    for (const t of inner.roots) {
      if (t.kind === "real") {
        if (t.re > 0) {
          const s = Math.sqrt(t.re);
          const ex = t.exact === null ? null : simplifyStrict(call("sqrt", t.exact), { check: false });
          const txt = ex !== null ? toText(ex) : `√(${t.text})`;
          const wrapped = !txt.startsWith("√") && /[+−\s/]/.test(txt) ? `(${txt})` : txt;
          out.push(realRoot(`−${wrapped}`, ex === null ? null : simplifyStrict(mul(numN(-1), ex), { check: false }), -s));
          out.push(realRoot(txt, ex, s));
        } else if (t.re === 0) out.push(realRoot("0", numN(0), 0));
        else {
          const s = Math.sqrt(-t.re);
          out.push(complexRoot(0, -s), complexRoot(0, s));
        }
      } else {
        // sqrt of a complex number
        const mod = Math.hypot(t.re, t.im);
        const re = Math.sqrt((mod + t.re) / 2);
        const im = Math.sign(t.im || 1) * Math.sqrt((mod - t.re) / 2);
        out.push(complexRoot(re, im), complexRoot(-re, -im));
      }
    }
    this.roots.push(...out);
    return true;
  }

  solve(c0: Q[]): void {
    let c = c0.slice();
    // zero roots
    let zeros = 0;
    while (c.length > 1 && c[0].n === 0n) {
      c = c.slice(1);
      zeros++;
    }
    if (zeros > 0) {
      this.steps.push({ rule: "root", before: eqText(c0, this.v), after: `${this.v}${zeros > 1 ? `^${zeros}` : ""} · (${toText(polyNode(c, this.v))}) = 0`, note: `${this.v} = 0` });
      this.addRational(Q0);
    }
    this.solveNonZero(c);
  }

  private solveNonZero(c: Q[]): void {
    const n = c.length - 1;
    if (n <= 0) return;
    if (n === 1) return this.linear(c);
    if (n === 2) return this.quadratic(c);
    if (this.binomial(c)) return;
    if (n === 4 && this.biquadratic(c)) return;
    const rr = this.rationalRoots(c);
    if (rr.length > 0) {
      const r = rr[0];
      this.steps.push({
        rule: "root",
        before: eqText(c, this.v),
        after: `(${this.v} ${r.n < 0n ? "+" : "−"} ${fmtQ(qabs(r))}) · (${toText(polyNode(this.deflate(c, r), this.v))}) = 0`,
        note: `${this.v} = ${fmtQ(r)}`,
      });
      this.addRational(r);
      this.check(c, r);
      return this.solveNonZero(this.deflate(c, r));
    }
    if (n === 3) return this.cubic(c);
    throw new SymbolicError("unsupported", "polynomial of this degree has no supported solution method");
  }
}

function finish(v: string, degree: number, solver: Solver, steps: Step[]): EquationSolution {
  const seen = new Set<string>();
  const roots = solver.roots.filter((r) => {
    const k = r.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  roots.sort((a, b) => (a.kind !== b.kind ? (a.kind === "real" ? -1 : 1) : a.re !== b.re ? a.re - b.re : a.im - b.im));
  const text = roots.map((r) => `${v} = ${r.text}`).join(", ");
  return { kind: "roots", roots, degree, variable: v, text, steps: [...steps, ...solver.steps] };
}

/** Solve a polynomial equation in one variable. Throws SymbolicError. */
export function solveEquationNode(input: string | Node, variable: string): EquationSolution {
  const [l, r] = parseEquation(input);
  const sumL = toSum(l, true);
  const sumR = toSum(r, true);
  const ids = freeIdents(l, freeIdents(r));
  if (ids.some((n) => n !== variable)) throw new SymbolicError("unsupported", "only one unknown is supported");
  const diff = toSum({ type: "binary", op: "-", left: l, right: r, pos: 0, end: 0 }, true);
  void sumL;
  void sumR;
  const c = coeffsOf(diff, variable);
  if (c === null) throw new SymbolicError("unsupported", "not a polynomial equation");
  const steps: Step[] = [];
  const rhsZero = r.type === "num" && r.value.isZero();
  if (!rhsZero && c.length > 0) {
    steps.push({ rule: "rewrite", before: `${toText(simplifyStrict(l, { check: false }))} = ${toText(simplifyStrict(r, { check: false }))}`, after: eqText(c, variable) });
  }
  if (c.length === 0) return { kind: "all", roots: [], degree: 0, variable, text: "∞", steps: [{ rule: "simplify", before: toText(l) + " = " + toText(r), after: "0 = 0" }] };
  if (c.length === 1) {
    return { kind: "none", roots: [], degree: 0, variable, text: "∅", steps: [{ rule: "simplify", before: toText(l) + " = " + toText(r), after: `${fmtQ(c[0])} = 0`, note: "false" }] };
  }
  const solver = new Solver(variable);
  solver.solve(c);
  return finish(variable, c.length - 1, solver, steps);
}

// ---------- 2x2 linear systems ----------

export interface SystemSolution {
  kind: "unique" | "infinite" | "none";
  variables: [string, string];
  values: Record<string, Node>;
  texts: Record<string, string>;
  steps: Step[];
}

interface Lin2 {
  a: Q;
  b: Q;
  c: Q;
}

function linearForm(eq: string | Node, vx: string, vy: string): Lin2 {
  const [l, r] = parseEquation(eq);
  const diff = toSum({ type: "binary", op: "-", left: l, right: r, pos: 0, end: 0 }, true);
  let a = Q0;
  let b = Q0;
  let k = Q0;
  for (const t of diff) {
    if (t.fs.length === 0) k = qadd(k, t.c);
    else if (t.fs.length === 1 && qeq(t.fs[0].e, Q1) && t.fs[0].b.type === "ident" && t.fs[0].b.name === vx) a = qadd(a, t.c);
    else if (t.fs.length === 1 && qeq(t.fs[0].e, Q1) && t.fs[0].b.type === "ident" && t.fs[0].b.name === vy) b = qadd(b, t.c);
    else throw new SymbolicError("unsupported", "the system must be linear with rational coefficients");
  }
  return { a, b, c: qneg(k) };
}

/** Solve two linear equations in two unknowns by Cramer's rule. Throws SymbolicError. */
export function solveSystemNodes(eqs: Array<string | Node>, vars?: [string, string]): SystemSolution {
  if (eqs.length !== 2) throw new SymbolicError("unsupported", "exactly two equations are required");
  let names: string[];
  if (vars !== undefined) names = [...vars];
  else {
    names = [];
    for (const e of eqs) {
      const [l, r] = parseEquation(e);
      freeIdents(l, names);
      freeIdents(r, names);
    }
    names.sort();
  }
  if (names.length !== 2) throw new SymbolicError("unsupported", "exactly two unknowns are required");
  const [x, y] = names;
  const e1 = linearForm(eqs[0], x, y);
  const e2 = linearForm(eqs[1], x, y);
  const std = (e: Lin2): string => {
    const lhs = simplifyStrict(add(mul(nodeQ(e.a), ident(x)), mul(nodeQ(e.b), ident(y))), { check: false });
    return `${toText(lhs)} = ${fmtQ(e.c)}`;
  };
  const steps: Step[] = [
    {
      rule: "rewrite",
      before: eqs.map((e) => (typeof e === "string" ? e : toText(e))).join(";  "),
      after: `${std(e1)};  ${std(e2)}`,
    },
  ];
  const qn = (v: Q): Node => nodeQ(v);
  const det = (p: Q, qq: Q, r: Q, s: Q): { v: Q; text: string } => {
    const node = sub(mul(qn(p), qn(s)), mul(qn(qq), qn(r)));
    return { v: qsub(qmul(p, s), qmul(qq, r)), text: toText(node) };
  };
  const D = det(e1.a, e1.b, e2.a, e2.b);
  const Dx = det(e1.c, e1.b, e2.c, e2.b);
  const Dy = det(e1.a, e1.c, e2.a, e2.c);
  const empty = (e: Lin2): boolean => e.a.n === 0n && e.b.n === 0n;
  if ((empty(e1) && e1.c.n !== 0n) || (empty(e2) && e2.c.n !== 0n)) {
    return { kind: "none", variables: [x, y], values: {}, texts: {}, steps };
  }
  steps.push({ rule: "cramer", before: `D = ${D.text}`, after: fmtQ(D.v), note: "D = a₁b₂ − a₂b₁" });
  if (D.v.n === 0n) {
    steps.push({ rule: "cramer", before: `D${x} = ${Dx.text}`, after: fmtQ(Dx.v) }, { rule: "cramer", before: `D${y} = ${Dy.text}`, after: fmtQ(Dy.v) });
    const kind = Dx.v.n === 0n && Dy.v.n === 0n ? "infinite" : "none";
    return { kind, variables: [x, y], values: {}, texts: {}, steps };
  }
  steps.push({ rule: "cramer", before: `D${x} = ${Dx.text}`, after: fmtQ(Dx.v), note: `D${x} = c₁b₂ − c₂b₁` });
  steps.push({ rule: "cramer", before: `D${y} = ${Dy.text}`, after: fmtQ(Dy.v), note: `D${y} = a₁c₂ − a₂c₁` });
  const vx = qdiv(Dx.v, D.v);
  const vy = qdiv(Dy.v, D.v);
  steps.push({ rule: "root", before: `${x} = D${x} / D,  ${y} = D${y} / D`, after: `${x} = ${fmtQ(vx)},  ${y} = ${fmtQ(vy)}` });
  for (const e of [e1, e2]) {
    const lhs = add(mul(qn(e.a), qn(vx)), mul(qn(e.b), qn(vy)));
    const text = toText(lhs);
    const res = simplifyStrict(lhs, { check: false });
    if (res.type === "num" || (res.type === "unary" && res.arg.type === "num") || res.type === "binary") {
      steps.push({ rule: "check", before: text, after: fmtQ(e.c) });
    }
  }
  return {
    kind: "unique",
    variables: [x, y],
    values: { [x]: nodeQ(vx), [y]: nodeQ(vy) },
    texts: { [x]: fmtQ(vx), [y]: fmtQ(vy) },
    steps,
  };
}

