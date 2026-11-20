// Pratt parser producing a stable, open AST (consumed by the evaluator and by the symbolic solver).
//
// Precedence (low -> high): + -  <  * / mod of  <  implicit multiplication  <  unary + -  <  ^ **  <  ! %(postfix)
//   -2^2 = -4, 2^3^2 = 2^(3^2), 1/2pi = 1/(2*pi)

import type { Decimal } from "./decimal";
import { CalcError } from "./errors";
import { tokenize, type Token } from "./lexer";

export const MAX_DEPTH = 64;

interface Span {
  /** Start offset in the input. */
  pos: number;
  /** End offset (exclusive). */
  end: number;
}

export interface Num extends Span {
  type: "num";
  value: Decimal;
  raw: string;
}
export interface Ident extends Span {
  type: "ident";
  name: string;
}
export interface Unary extends Span {
  type: "unary";
  op: "-" | "+";
  arg: Node;
}
export type BinaryOp = "+" | "-" | "*" | "/" | "^" | "mod" | "of";
export interface Binary extends Span {
  type: "binary";
  op: BinaryOp;
  left: Node;
  right: Node;
}
/** Juxtaposition: 2pi, 2(3+4), (1+2)(3+4), 3x. */
export interface ImplicitMul extends Span {
  type: "implicit";
  left: Node;
  right: Node;
}
export interface Call extends Span {
  type: "call";
  name: string;
  args: Node[];
}
/** `x%` (percent: x/100) and `x!` (factorial). */
export interface Postfix extends Span {
  type: "postfix";
  op: "percent" | "factorial";
  arg: Node;
}
export interface Assign extends Span {
  type: "assign";
  name: string;
  value: Node;
}
export type Node = Num | Ident | Unary | Binary | ImplicitMul | Call | Postfix | Assign;

export interface Program {
  type: "program";
  body: Node[];
}

const BP_ADD = 10;
const BP_MUL = 20;
const BP_IMPLICIT = 22;
const BP_UNARY = 30;
const BP_POW = 40;
const BP_POSTFIX = 50;
const BP_SQRT = 45;

function describe(t: Token): string {
  if (t.type === "eof") return "end of input";
  if (t.type === "num") return `number ${t.text}`;
  return `"${t.text.length > 20 ? t.text.slice(0, 20) + "..." : t.text}"`;
}

function isWordOp(t: Token): boolean {
  if (t.type !== "ident") return false;
  const l = t.text.toLowerCase();
  return l === "mod" || l === "of";
}

class Parser {
  private p = 0;
  private depth = 0;

  constructor(private readonly toks: Token[]) {}

  private peek(off = 0): Token {
    return this.toks[Math.min(this.p + off, this.toks.length - 1)];
  }

  private next(): Token {
    const t = this.toks[this.p];
    if (this.p < this.toks.length - 1) this.p++;
    return t;
  }

  private fail(t: Token, what?: string): never {
    throw new CalcError("syntax", `unexpected ${what ?? describe(t)}`, { pos: t.pos });
  }

  program(): Program {
    const body: Node[] = [];
    for (;;) {
      while (this.peek().type === "semi") this.next();
      if (this.peek().type === "eof") break;
      body.push(this.statement());
      const t = this.peek();
      if (t.type !== "semi" && t.type !== "eof") this.fail(t);
    }
    if (body.length === 0) throw new CalcError("syntax", "empty expression", { pos: this.peek().pos });
    return { type: "program", body };
  }

  private statement(): Node {
    const t = this.peek();
    if (t.type === "ident" && this.peek(1).type === "assign") {
      this.next();
      this.next();
      const value = this.expr(0);
      return { type: "assign", name: t.text, value, pos: t.pos, end: value.end };
    }
    return this.expr(0);
  }

  /** Does the token after a '%' start an operand (then '%' is the modulo operator)? */
  private percentIsModulo(): boolean {
    const t = this.peek(1);
    if (t.type === "num" || t.type === "lparen") return true;
    if (t.type === "op" && t.text === "√") return true;
    if (t.type === "ident") return t.text.toLowerCase() !== "of";
    return false;
  }

  private expr(minBp: number): Node {
    if (++this.depth > MAX_DEPTH) {
      throw new CalcError("too_deep", `expression is nested deeper than ${MAX_DEPTH} levels`, { pos: this.peek().pos });
    }
    let left = this.nud();
    for (;;) {
      const t = this.peek();
      if (t.type === "op") {
        const op = t.text;
        if (op === "+" || op === "-") {
          if (BP_ADD <= minBp) break;
          this.next();
          const right = this.expr(BP_ADD);
          left = { type: "binary", op, left, right, pos: left.pos, end: right.end };
        } else if (op === "*" || op === "/") {
          if (BP_MUL <= minBp) break;
          this.next();
          const right = this.expr(BP_MUL);
          left = { type: "binary", op, left, right, pos: left.pos, end: right.end };
        } else if (op === "^") {
          if (BP_POW <= minBp) break;
          this.next();
          const right = this.expr(BP_POW - 1);
          left = { type: "binary", op: "^", left, right, pos: left.pos, end: right.end };
        } else if (op === "!") {
          if (BP_POSTFIX <= minBp) break;
          this.next();
          left = { type: "postfix", op: "factorial", arg: left, pos: left.pos, end: t.end };
        } else if (op === "%") {
          if (this.percentIsModulo()) {
            if (BP_MUL <= minBp) break;
            this.next();
            const right = this.expr(BP_MUL);
            left = { type: "binary", op: "mod", left, right, pos: left.pos, end: right.end };
          } else {
            if (BP_POSTFIX <= minBp) break;
            this.next();
            left = { type: "postfix", op: "percent", arg: left, pos: left.pos, end: t.end };
          }
        } else if (op === "√") {
          if (BP_IMPLICIT <= minBp) break;
          this.next();
          const arg = this.expr(BP_SQRT);
          const call: Call = { type: "call", name: "sqrt", args: [arg], pos: t.pos, end: arg.end };
          left = { type: "implicit", left, right: call, pos: left.pos, end: call.end };
        } else break;
      } else if (t.type === "ident") {
        if (isWordOp(t)) {
          if (BP_MUL <= minBp) break;
          this.next();
          const right = this.expr(BP_MUL);
          const word = t.text.toLowerCase() as "mod" | "of";
          left = { type: "binary", op: word, left, right, pos: left.pos, end: right.end };
        } else {
          if (BP_IMPLICIT <= minBp) break;
          const right = this.expr(BP_IMPLICIT);
          left = { type: "implicit", left, right, pos: left.pos, end: right.end };
        }
      } else if (t.type === "lparen") {
        if (BP_IMPLICIT <= minBp) break;
        const right = this.expr(BP_IMPLICIT);
        left = { type: "implicit", left, right, pos: left.pos, end: right.end };
      } else break;
    }
    this.depth--;
    return left;
  }

  private nud(): Node {
    const t = this.next();
    switch (t.type) {
      case "num":
        return { type: "num", value: t.value as Decimal, raw: t.text, pos: t.pos, end: t.end };
      case "ident": {
        // "mod(a, b)" is the function form of the infix word operator.
        if (isWordOp(t) && !(t.text.toLowerCase() === "mod" && this.peek().type === "lparen")) this.fail(t);
        if (this.peek().type === "lparen") return this.call(t);
        return { type: "ident", name: t.text, pos: t.pos, end: t.end };
      }
      case "lparen": {
        const inner = this.expr(0);
        const close = this.peek();
        if (close.type !== "rparen") this.fail(close);
        this.next();
        return { ...inner, pos: t.pos, end: close.end } as Node;
      }
      case "op": {
        if (t.text === "-" || t.text === "+") {
          const arg = this.expr(BP_UNARY);
          return { type: "unary", op: t.text, arg, pos: t.pos, end: arg.end };
        }
        if (t.text === "√") {
          const arg = this.expr(BP_SQRT);
          return { type: "call", name: "sqrt", args: [arg], pos: t.pos, end: arg.end };
        }
        return this.fail(t);
      }
      default:
        return this.fail(t);
    }
  }

  private call(nameTok: Token): Node {
    this.next(); // (
    const args: Node[] = [];
    if (this.peek().type === "rparen") {
      const close = this.next();
      return { type: "call", name: nameTok.text, args, pos: nameTok.pos, end: close.end };
    }
    for (;;) {
      args.push(this.expr(0));
      const t = this.peek();
      if (t.type === "comma") {
        this.next();
        continue;
      }
      if (t.type === "rparen") {
        this.next();
        return { type: "call", name: nameTok.text, args, pos: nameTok.pos, end: t.end };
      }
      return this.fail(t);
    }
  }
}

/** Parse one or more ';'-separated statements. Throws CalcError. */
export function parseProgram(input: string): Program {
  return new Parser(tokenize(input)).program();
}

/** Parse a single expression (or assignment). Throws CalcError. */
export function parse(input: string): Node {
  const prog = parseProgram(input);
  if (prog.body.length !== 1) throw new CalcError("syntax", "expected a single expression", { pos: 0 });
  return prog.body[0];
}

export type ParseResult = { ok: true; ast: Program } | { ok: false; error: CalcError };

/** Non-throwing variant of parseProgram. */
export function tryParse(input: string): ParseResult {
  try {
    return { ok: true, ast: parseProgram(input) };
  } catch (e) {
    if (e instanceof CalcError) return { ok: false, error: e };
    return { ok: false, error: new CalcError("syntax", "internal parser error", { pos: 0 }) };
  }
}
