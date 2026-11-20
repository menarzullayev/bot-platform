// Indefinite integration: table, linear substitution, u-substitution, by parts, simple partial fractions.
// Works on the canonical Sum form; every result is verified numerically against the integrand before it is returned.

import type { Node } from "../parser";
import { add, assertSize, call, dependsOn, div, ident, key, mul, neg, nodeQ, normalizeNode, numN, pow, replaceKey, size, sub, substitute, ONE, ZERO } from "./ast";
import { derivativeNode } from "./deriv";
import { compileFast } from "./numeric";
import { Q0, Q1, QM1, q, qabs, qadd, qdiv, qeq, qisInt, qmul, qneg, qpow, qsub, type Q } from "./rational";
import { buildSum, buildTerm, mkFac, simplifyStrict, toSum, type Fac, type Sum, type Term } from "./simplify";
import { toText } from "./text";
import { MAX_STEPS, SymbolicError, type Step, type StepRule } from "./types";

const TWO = numN(2);
const HALF = div(ONE, TWO);

function termNode(t: Term): Node {
  const b = buildTerm(t);
  return b.neg ? neg(b.node) : b.node;
}

/** Linear form a*v + b: a is exact, b exact when the constant part is numeric. */
interface Lin {
  a: Q;
  b: Q | null;
}

function linParts(s: Sum, v: string): Lin | null {
  let a: Q | null = null;
  let b: Q | null = Q0;
  for (const t of s) {
    if (t.fs.length === 0) {
      if (b !== null) b = qadd(b, t.c);
    } else if (t.fs.length === 1 && t.fs[0].b.type === "ident" && t.fs[0].b.name === v && qeq(t.fs[0].e, Q1)) {
      a = t.c;
    } else if (t.fs.some((f) => dependsOn(f.b, v))) return null;
    else b = null;
  }
  if (a === null || a.n === 0n) return null;
  return { a, b };
}

/** Polynomial coefficients (index = degree) with rational values, or null. */
function polyQ(s: Sum, v: string): Q[] | null {
  const out: Q[] = [];
  for (const t of s) {
    let deg = 0;
    if (t.fs.length === 1 && t.fs[0].b.type === "ident" && t.fs[0].b.name === v && qisInt(t.fs[0].e) && t.fs[0].e.n > 0n && t.fs[0].e.n < 50n) {
      deg = Number(t.fs[0].e.n);
    } else if (t.fs.length !== 0) return null;
    while (out.length <= deg) out.push(Q0);
    out[deg] = qadd(out[deg], t.c);
  }
  return out;
}

function binom(n: number, k: number): bigint {
  let r = 1n;
  for (let i = 1; i <= k; i++) r = (r * BigInt(n - k + i)) / BigInt(i);
  return r;
}

function sinPow(n: number, L: Node): Node {
  if (n === 0) return L;
  if (n === 1) return neg(call("cos", L));
  const head = neg(div(mul(pow(call("sin", L), numN(n - 1)), call("cos", L)), numN(n)));
  return add(head, mul(div(numN(n - 1), numN(n)), sinPow(n - 2, L)));
}

function cosPow(n: number, L: Node): Node {
  if (n === 0) return L;
  if (n === 1) return call("sin", L);
  const head = div(mul(pow(call("cos", L), numN(n - 1)), call("sin", L)), numN(n));
  return add(head, mul(div(numN(n - 1), numN(n)), cosPow(n - 2, L)));
}

/** Antiderivative of f(L)^e with respect to u = L (unit slope); null when there is no rule. */
function tableInU(name: string, L: Node, e: Q): Node | null {
  const isE = (n: number): boolean => qeq(e, q(n));
  const abs = (n: Node): Node => call("abs", n);
  if (isE(1)) {
    switch (name) {
      case "sin":
        return neg(call("cos", L));
      case "cos":
        return call("sin", L);
      case "tan":
        return neg(call("ln", abs(call("cos", L))));
      case "cot":
        return call("ln", abs(call("sin", L)));
      case "sec":
        return call("ln", abs(add(call("sec", L), call("tan", L))));
      case "csc":
        return neg(call("ln", abs(add(call("csc", L), call("cot", L)))));
      case "sinh":
        return call("cosh", L);
      case "cosh":
        return call("sinh", L);
      case "tanh":
        return call("ln", call("cosh", L));
      case "ln":
        return sub(mul(L, call("ln", L)), L);
      case "atan":
        return sub(mul(L, call("atan", L)), mul(HALF, call("ln", add(ONE, pow(L, TWO)))));
      case "asin":
        return add(mul(L, call("asin", L)), call("sqrt", sub(ONE, pow(L, TWO))));
      case "acos":
        return sub(mul(L, call("acos", L)), call("sqrt", sub(ONE, pow(L, TWO))));
      case "abs":
        return div(mul(L, abs(L)), TWO);
      default:
        return null;
    }
  }
  if (isE(2)) {
    switch (name) {
      case "sin":
        return sub(div(L, TWO), div(call("sin", mul(TWO, L)), numN(4)));
      case "cos":
        return add(div(L, TWO), div(call("sin", mul(TWO, L)), numN(4)));
      case "tan":
        return sub(call("tan", L), L);
      case "cot":
        return sub(neg(call("cot", L)), L);
      case "sec":
        return call("tan", L);
      case "csc":
        return neg(call("cot", L));
      case "sinh":
        return sub(div(call("sinh", mul(TWO, L)), numN(4)), div(L, TWO));
      case "cosh":
        return add(div(call("sinh", mul(TWO, L)), numN(4)), div(L, TWO));
      default:
        return null;
    }
  }
  if (isE(-2)) {
    if (name === "cos") return call("tan", L);
    if (name === "sin") return neg(call("cot", L));
    if (name === "cosh") return call("tanh", L);
    return null;
  }
  if (isE(-1)) {
    if (name === "cos") return call("ln", abs(add(call("sec", L), call("tan", L))));
    if (name === "sin") return neg(call("ln", abs(add(call("csc", L), call("cot", L)))));
    return null;
  }
  if (qisInt(e) && e.n >= 3n && e.n <= 8n) {
    if (name === "sin") return sinPow(Number(e.n), L);
    if (name === "cos") return cosPow(Number(e.n), L);
  }
  return null;
}

interface Expo {
  base: Node;
  expo: Node;
  a: Q;
}

class Integ {
  readonly steps: Step[] = [];
  private readonly X: Node;

  constructor(
    private readonly v: string,
    private readonly depth: number,
    private readonly uName: string,
  ) {
    this.X = ident(v);
  }

  private simp(n: Node): Node {
    return simplifyStrict(n, { check: false });
  }

  private push(rule: StepRule, integrand: Node | string, F: Node | string, note?: string): void {
    if (this.steps.length >= MAX_STEPS) return;
    const before = `∫ ${typeof integrand === "string" ? integrand : toText(integrand)} d${this.v}`;
    const after = typeof F === "string" ? F : toText(this.simp(F));
    this.steps.push({ rule, before, after, ...(note !== undefined ? { note } : {}) });
  }

  private attempt<T>(fn: () => T | null): T | null {
    const mark = this.steps.length;
    const r = fn();
    if (r === null) this.steps.length = mark;
    return r;
  }

  // ----- entry points -----

  integrateSum(s: Sum): Node | null {
    if (s.length === 0) return ZERO;
    if (s.length === 1) return this.integrateTerm(s[0]);
    const slot = this.steps.length;
    const parts = s.map((t) => {
      const b = buildTerm(t);
      return { neg: b.neg, text: `∫ ${toText(b.node)} d${this.v}` };
    });
    const whole = buildSum(s);
    this.steps.push({
      rule: "sum",
      before: `∫ (${toText(whole)}) d${this.v}`,
      after: parts.map((p, i) => (i === 0 ? (p.neg ? "−" : "") : p.neg ? " − " : " + ") + p.text).join(""),
    });
    let acc: Node | null = null;
    for (const t of s) {
      const F = this.integrateTerm(t);
      if (F === null) {
        this.steps.length = slot;
        return null;
      }
      acc = acc === null ? F : add(acc, F);
    }
    return acc;
  }

  integrateNode(n: Node): Node | null {
    return this.integrateSum(toSum(n, false, false));
  }

  private integrateTerm(t: Term): Node | null {
    const v = this.v;
    const dep = t.fs.filter((f) => dependsOn(f.b, v));
    const cs = t.fs.filter((f) => !dependsOn(f.b, v));
    const coefTerm: Term = { c: t.c, fs: cs };
    const hasCoef = !(qeq(t.c, Q1) && cs.length === 0);
    const integrand = termNode(t);
    if (dep.length === 0) {
      const F = mul(integrand, this.X);
      this.push("const", integrand, F);
      return F;
    }
    const mark = this.steps.length;
    let slot = -1;
    if (hasCoef && this.steps.length < MAX_STEPS) {
      slot = this.steps.length;
      this.steps.push({ rule: "const_mult", before: `∫ ${toText(integrand)} d${v}`, after: "" });
    }
    const unit = this.unitIntegral(dep);
    if (unit === null) {
      this.steps.length = mark;
      return null;
    }
    const coef = termNode(coefTerm);
    if (slot >= 0) {
      const depNode = termNode({ c: Q1, fs: dep });
      this.steps[slot].after = `${toText(coef)} · ∫ ${toText(depNode)} d${v}`;
    }
    return hasCoef ? mul(coef, unit) : unit;
  }

  private unitIntegral(dep: Fac[]): Node | null {
    let r = this.attempt(() => (dep.length === 1 ? this.single(dep[0]) : this.multi(dep)));
    if (r === null) r = this.attempt(() => this.substitution(dep));
    return r;
  }

  private facNode(f: Fac): Node {
    return qeq(f.e, Q1) ? f.b : pow(f.b, nodeQ(f.e));
  }

  // ----- single factor -----

  private single(f: Fac): Node | null {
    const v = this.v;
    const { b, e } = f;
    const integrand = this.facNode(f);
    if (b.type === "ident" && b.name === v) {
      if (qeq(e, QM1)) {
        const F = call("ln", call("abs", this.X));
        this.push("table", integrand, F);
        return F;
      }
      const e1 = qadd(e, Q1);
      const F = div(pow(this.X, nodeQ(e1)), nodeQ(e1));
      this.push("power", integrand, F);
      return F;
    }
    if (b.type === "call" && b.args.length === 1) {
      const L = b.args[0];
      const lin = linParts(toSum(L, false, false), v);
      if (lin === null) return null;
      const F0 = tableInU(b.name, L, e);
      if (F0 === null) return null;
      const F = qeq(lin.a, Q1) ? F0 : div(F0, nodeQ(lin.a));
      this.push("table", integrand, F, qeq(lin.a, Q1) ? undefined : `u = ${toText(L)}`);
      return F;
    }
    if (f.r === 4) {
      const S = toSum(b, false, false);
      const lin = linParts(S, v);
      if (lin !== null) {
        if (qeq(e, QM1)) {
          const F = div(call("ln", call("abs", b)), nodeQ(lin.a));
          this.push("table", integrand, F, `u = ${toText(b)}`);
          return F;
        }
        const e1 = qadd(e, Q1);
        const F = div(pow(b, nodeQ(e1)), nodeQ(qmul(lin.a, e1)));
        this.push("power", integrand, F, `u = ${toText(b)}`);
        return F;
      }
      const poly = polyQ(S, v);
      if (poly !== null && poly.length === 3) return this.quadratic(poly, e, b, integrand);
      return null;
    }
    const ex = this.expo(f);
    if (ex !== null) {
      const base = ex.base;
      const isE = base.type === "ident" && base.name === "e";
      const G = pow(base, ex.expo);
      const F = isE ? div(G, nodeQ(ex.a)) : div(G, mul(nodeQ(ex.a), call("ln", base)));
      this.push("table", integrand, F);
      return F;
    }
    return null;
  }

  /** base^L with a constant base and a linear exponent, as a canonical description. */
  private expo(f: Fac): Expo | null {
    const b = f.b;
    if (!(b.type === "binary" && b.op === "^" && !dependsOn(b.left, this.v) && dependsOn(b.right, this.v))) return null;
    let expo = b.right;
    if (!qeq(f.e, Q1)) expo = this.simp(mul(nodeQ(f.e), expo));
    const lin = linParts(toSum(expo, false, false), this.v);
    if (lin === null) return null;
    return { base: b.left, expo, a: lin.a };
  }

  private quadratic(c: Q[], e: Q, S: Node, integrand: Node): Node | null {
    const [c0, c1, c2] = c;
    const D = qsub(qmul(c1, c1), qmul(q(4), qmul(c2, c0)));
    const lin = add(mul(nodeQ(qmul(q(2), c2)), this.X), nodeQ(c1));
    if (qeq(e, QM1)) {
      if (D.n < 0n) {
        const sd = call("sqrt", nodeQ(qneg(D)));
        const F = mul(div(TWO, sd), call("atan", div(lin, sd)));
        this.push("table", integrand, F);
        return F;
      }
      if (D.n === 0n) {
        const F = neg(div(TWO, lin));
        this.push("table", integrand, F);
        return F;
      }
      const sd = call("sqrt", nodeQ(D));
      const F = div(call("ln", call("abs", div(sub(lin, sd), add(lin, sd)))), sd);
      this.push("partial_fractions", integrand, F);
      return F;
    }
    if (qeq(e, q(-1, 2)) && c1.n === 0n) {
      if (c2.n > 0n) {
        const sa = call("sqrt", nodeQ(c2));
        const F = div(call("ln", call("abs", add(mul(sa, this.X), call("sqrt", S)))), sa);
        this.push("table", integrand, F);
        return F;
      }
      if (c2.n < 0n && c0.n > 0n) {
        const sa = call("sqrt", nodeQ(qneg(c2)));
        const F = div(call("asin", div(mul(sa, this.X), call("sqrt", nodeQ(c0)))), sa);
        this.push("table", integrand, F);
        return F;
      }
    }
    return null;
  }

  // ----- products -----

  private isVar(f: Fac): boolean {
    return f.b.type === "ident" && f.b.name === this.v;
  }

  private linFac(f: Fac): { L: Node; lin: Lin } | null {
    if (this.isVar(f)) return { L: this.X, lin: { a: Q1, b: Q0 } };
    if (f.r !== 4) return null;
    const lin = linParts(toSum(f.b, false, false), this.v);
    return lin === null ? null : { L: f.b, lin };
  }

  private multi(D: Fac[]): Node | null {
    const v = this.v;
    const integrand = termNode({ c: Q1, fs: D });
    if (D.length === 2) {
      const [f1, f2] = D;
      // x^k * (a x + b)^q  -> substitution u = a x + b
      for (const [p, r] of [
        [f1, f2],
        [f2, f1],
      ]) {
        if (this.isVar(p) && qisInt(p.e) && p.e.n >= 1n && p.e.n <= 8n && r.r === 4) {
          const lf = this.linFac(r);
          if (lf !== null && lf.lin.b !== null) {
            const k = Number(p.e.n);
            const { a, b } = lf.lin;
            const bb = b as Q;
            let F: Node | null = null;
            for (let j = 0; j <= k; j++) {
              const coef = qdiv(qmul(q(binom(k, j)), qpow(qneg(bb), k - j)), qpow(a, k + 1));
              if (coef.n === 0n) continue;
              const ex = qadd(q(j), r.e);
              let term: Node;
              if (qeq(ex, QM1)) term = mul(nodeQ(coef), call("ln", call("abs", lf.L)));
              else {
                const ex1 = qadd(ex, Q1);
                term = mul(nodeQ(coef), div(pow(lf.L, nodeQ(ex1)), nodeQ(ex1)));
              }
              F = F === null ? term : add(F, term);
            }
            if (F === null) return ZERO;
            this.push("substitute", integrand, F, `u = ${toText(lf.L)}`);
            return F;
          }
        }
      }
      // 1/((a x + b)(c x + d))
      if (qeq(f1.e, QM1) && qeq(f2.e, QM1)) {
        const l1 = this.linFac(f1);
        const l2 = this.linFac(f2);
        if (l1 !== null && l2 !== null && l1.lin.b !== null && l2.lin.b !== null) {
          const delta = qsub(qmul(l1.lin.a, l2.lin.b), qmul(l2.lin.a, l1.lin.b));
          if (delta.n !== 0n) {
            const F = div(sub(call("ln", call("abs", l1.L)), call("ln", call("abs", l2.L))), nodeQ(delta));
            this.push("partial_fractions", integrand, F);
            return F;
          }
        }
      }
      // x / (a x^2 + b x + c)
      for (const [p, r] of [
        [f1, f2],
        [f2, f1],
      ]) {
        if (this.isVar(p) && qeq(p.e, Q1) && r.r === 4 && qeq(r.e, QM1)) {
          const poly = polyQ(toSum(r.b, false, false), v);
          if (poly !== null && poly.length === 3) {
            const a2 = qmul(q(2), poly[2]);
            const J = this.single(r);
            if (J === null) return null;
            const F = sub(div(call("ln", call("abs", r.b)), nodeQ(a2)), mul(nodeQ(qdiv(poly[1], a2)), J));
            this.steps.pop();
            this.push("substitute", integrand, F, `u = ${toText(r.b)}`);
            return F;
          }
        }
      }
      // x^k * G with G = e^L, sin L, cos L  (by parts, repeated)
      for (const [p, r] of [
        [f1, f2],
        [f2, f1],
      ]) {
        if (this.isVar(p) && qisInt(p.e) && p.e.n >= 1n && p.e.n <= 8n) {
          const F = this.byParts(Number(p.e.n), r, integrand);
          if (F !== null) return F;
        }
      }
      // x^n ln x
      for (const [p, r] of [
        [f1, f2],
        [f2, f1],
      ]) {
        if (this.isVar(p) && r.b.type === "call" && r.b.name === "ln" && qeq(r.e, Q1) && key(r.b.args[0]) === v) {
          const n1 = qadd(p.e, Q1);
          let F: Node;
          if (n1.n === 0n) F = div(pow(call("ln", this.X), TWO), TWO);
          else F = sub(mul(div(pow(this.X, nodeQ(n1)), nodeQ(n1)), call("ln", this.X)), div(pow(this.X, nodeQ(n1)), nodeQ(qmul(n1, n1))));
          this.push("by_parts", integrand, F, `u = ln ${v}`);
          return F;
        }
      }
      // e^(L1) * sin/cos(L2)
      for (const [p, r] of [
        [f1, f2],
        [f2, f1],
      ]) {
        const ex = this.expo(p);
        if (ex !== null && r.b.type === "call" && (r.b.name === "sin" || r.b.name === "cos") && qeq(r.e, Q1) && ex.base.type === "ident" && ex.base.name === "e") {
          const L2 = r.b.args[0];
          const l2 = linParts(toSum(L2, false, false), v);
          if (l2 !== null) {
            const a1 = ex.a;
            const a2 = l2.a;
            const den = nodeQ(qadd(qmul(a1, a1), qmul(a2, a2)));
            const E = pow(ex.base, ex.expo);
            const inner =
              r.b.name === "sin"
                ? sub(mul(nodeQ(a1), call("sin", L2)), mul(nodeQ(a2), call("cos", L2)))
                : add(mul(nodeQ(a1), call("cos", L2)), mul(nodeQ(a2), call("sin", L2)));
            const F = div(mul(E, inner), den);
            this.push("by_parts", integrand, F, "∫ e^u sin / cos (twice by parts)");
            return F;
          }
        }
      }
    }
    return null;
  }

  private byParts(k: number, g: Fac, integrand: Node): Node | null {
    const v = this.v;
    let Gi: Node;
    let next: Fac;
    let coef: Q;
    const ex = this.expo(g);
    if (ex !== null && ex.base.type === "ident" && ex.base.name === "e") {
      // e^L: antiderivative e^L / a
      Gi = div(pow(ex.base, ex.expo), nodeQ(ex.a));
      next = mkFac(pow(ex.base, ex.expo), Q1);
      coef = qdiv(Q1, ex.a);
    } else if (g.b.type === "call" && g.b.args.length === 1 && qeq(g.e, Q1) && (g.b.name === "sin" || g.b.name === "cos")) {
      const L = g.b.args[0];
      const lin = linParts(toSum(L, false, false), v);
      if (lin === null) return null;
      if (g.b.name === "sin") {
        Gi = neg(div(call("cos", L), nodeQ(lin.a)));
        next = mkFac(call("cos", L), Q1);
        coef = qneg(qdiv(Q1, lin.a));
      } else {
        Gi = div(call("sin", L), nodeQ(lin.a));
        next = mkFac(call("sin", L), Q1);
        coef = qdiv(Q1, lin.a);
      }
    } else return null;
    if (this.depth > 6) return null;
    const rest: Fac[] = k - 1 === 0 ? [next] : [mkFac(this.X, q(k - 1)), next];
    rest.sort((x, y) => (x.r !== y.r ? x.r - y.r : x.k < y.k ? -1 : 1));
    const slot = this.steps.length;
    this.push("by_parts", integrand, "", `u = ${v}^${k}`);
    const J = this.integrateTerm({ c: coef, fs: rest });
    if (J === null) return null;
    const F = sub(mul(pow(this.X, numN(k)), Gi), mul(numN(k), J));
    if (this.steps[slot]) this.steps[slot].after = toText(this.simp(F));
    return F;
  }

  // ----- u-substitution -----

  private substitution(dep: Fac[]): Node | null {
    if (this.depth >= 2) return null;
    const v = this.v;
    const T = termNode({ c: Q1, fs: dep });
    const cands: Node[] = [];
    const seen = new Set<string>();
    const addCand = (u: Node): void => {
      const k = key(u);
      if (k === v || seen.has(k) || !dependsOn(u, v) || u.type === "num") return;
      seen.add(k);
      cands.push(u);
    };
    for (const f of dep) {
      if (f.b.type === "call") {
        for (const a of f.b.args) addCand(a);
        addCand(f.b);
      } else if (f.r === 4) addCand(f.b);
      else if (f.b.type === "binary" && f.b.op === "^") {
        addCand(f.b.right);
        addCand(f.b);
      } else if (this.isVar(f) && !qisInt(f.e)) addCand(pow(this.X, nodeQ(qabs(f.e))));
    }
    for (const u of cands.slice(0, 8)) {
      let q2: Node;
      try {
        const du = derivativeNode(u, v);
        if (du.type === "num" && du.value.isZero()) continue;
        q2 = this.simp(div(T, du));
      } catch (e) {
        if (e instanceof SymbolicError) continue;
        throw e;
      }
      const w = this.uName;
      const qs = replaceKey(q2, key(u), ident(w));
      if (dependsOn(qs, v)) continue;
      const sub1 = new Integ(w, this.depth + 1, w === "t" ? "s" : "t");
      const Fw = sub1.integrateNode(qs);
      if (Fw === null) continue;
      const F = substitute(Fw, w, u);
      this.push("substitute", T, F, `${w} = ${toText(u)}`);
      for (const st of sub1.steps) if (this.steps.length < MAX_STEPS) this.steps.push(st);
      return F;
    }
    return null;
  }
}

/** Pick a substitution variable that does not clash with identifiers of the input. */
function freshName(n: Node): string {
  for (const c of ["u", "w", "t", "s", "z"]) if (!dependsOn(n, c)) return c;
  return "u";
}

export interface IntegralOutcome {
  /** Antiderivative without the constant. */
  antiderivative: Node;
  /** Antiderivative + C. */
  result: Node;
  expression: Node;
  steps: Step[];
}

function verify(f: Node, F: Node, v: string): boolean {
  let fc: (x: number) => number;
  let Fc: (x: number) => number;
  try {
    fc = compileFast(f, v);
    Fc = compileFast(F, v);
  } catch {
    return true;
  }
  const pts = [0.37, 1.13, 2.21, 0.71, 3.3, -0.62, -1.7, 4.4];
  let valid = 0;
  for (const x of pts) {
    const h = 1e-5 * Math.max(1, Math.abs(x));
    const fx = fc(x);
    const d = (Fc(x + h) - Fc(x - h)) / (2 * h);
    if (!Number.isFinite(fx) || !Number.isFinite(d)) continue;
    // skip points next to a discontinuity of F (values at both sides differ wildly)
    if (Math.abs(Fc(x + h) - Fc(x)) > 1e3 * (Math.abs(fx) + 1) * h) continue;
    valid++;
    if (Math.abs(fx - d) > 1e-5 * (1 + Math.abs(fx))) return false;
  }
  return true;
}

/** Integrate; throws SymbolicError('unsupported') when no rule applies. */
export function integrateExpr(input: Node, variable: string): IntegralOutcome {
  const norm = normalizeNode(input);
  assertSize(norm);
  const uName = freshName(norm);
  const attempts: boolean[] = [false, true];
  let firstExpr: Node | null = null;
  for (const expand of attempts) {
    let S: Sum;
    try {
      S = toSum(norm, expand, false);
    } catch (e) {
      if (e instanceof SymbolicError && e.code === "too_complex" && expand) break;
      throw e;
    }
    const expr = buildSum(S);
    if (firstExpr === null) firstExpr = expr;
    const integ = new Integ(variable, 0, uName);
    let F: Node | null;
    try {
      F = integ.integrateSum(S);
    } catch (e) {
      if (e instanceof SymbolicError && e.code !== "too_complex") F = null;
      else throw e;
    }
    if (F === null) continue;
    let anti = simplifyStrict(F, { check: false });
    try {
      const alt = simplifyStrict(F, { check: false, expand: true });
      if (size(alt) < size(anti)) anti = alt;
    } catch {
      /* keep the compact form */
    }
    if (!verify(expr, anti, variable)) continue;
    const result = add(anti, ident("C"));
    return { antiderivative: anti, result, expression: firstExpr, steps: integ.steps };
  }
  throw new SymbolicError("unsupported", "no integration rule applies");
}

