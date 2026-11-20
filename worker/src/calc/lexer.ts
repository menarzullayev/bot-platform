// Tokenizer. Positions are UTF-16 offsets into the original input string.

import { Decimal } from "./decimal";
import { CalcError } from "./errors";

export const MAX_INPUT_LENGTH = 500;
export const MAX_TOKENS = 300;

export type TokenType = "num" | "ident" | "op" | "lparen" | "rparen" | "comma" | "semi" | "assign" | "eof";

export interface Token {
  type: TokenType;
  /** Source text (normalized for operators: "*", "/", "^", "+", "-", "!", "%", "√"). */
  text: string;
  pos: number;
  end: number;
  /** Parsed value for numeric tokens. */
  value?: Decimal;
}

const SPACE_RE = /[\s  -   　]/;
// Zero-width and bidi control characters are ignored (they are invisible and must not change the result).
const IGNORABLE_RE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿؜]/;
const LETTER_RE = /[\p{L}_]/u;
const IDENT_CONT_RE = /[\p{L}\p{N}\p{M}_]/u;
const SINGLE_GREEK = "πτφ";

const OP_MAP: Record<string, string> = {
  "+": "+",
  "-": "-",
  "−": "-",
  "–": "-",
  "*": "*",
  "×": "*",
  "·": "*",
  "⋅": "*",
  "∙": "*",
  "/": "/",
  "÷": "/",
  ":": "/",
  "^": "^",
  "!": "!",
  "%": "%",
  "٪": "%",
  "√": "√",
};

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9";
}

function hexName(c: string): string {
  return "U+" + (c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0");
}

/** Map Arabic-Indic / Persian digits to ASCII (same UTF-16 length, so positions are preserved). */
function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (c) => {
    const code = c.charCodeAt(0);
    return String.fromCharCode(48 + (code >= 0x06f0 ? code - 0x06f0 : code - 0x0660));
  });
}

function isSpaceChar(c: string | undefined): boolean {
  return c === " " || c === " " || c === " " || c === " ";
}

export function tokenize(input: string): Token[] {
  if (typeof input !== "string") throw new CalcError("syntax", "input must be a string", { pos: 0 });
  if (input.length > MAX_INPUT_LENGTH) {
    throw new CalcError("too_long", `input is longer than ${MAX_INPUT_LENGTH} characters`);
  }
  const src = normalizeDigits(input);
  const n = src.length;
  const tokens: Token[] = [];
  const parenStack: boolean[] = []; // true = function call parentheses
  let i = 0;

  const push = (t: Token): void => {
    if (tokens.length >= MAX_TOKENS) throw new CalcError("too_long", `more than ${MAX_TOKENS} tokens`, { pos: t.pos });
    tokens.push(t);
  };

  while (i < n) {
    const c = src[i];
    if (SPACE_RE.test(c) || IGNORABLE_RE.test(c)) {
      i++;
      continue;
    }
    const code = c.charCodeAt(0);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      throw new CalcError("syntax", `unexpected control character ${hexName(c)}`, { pos: i });
    }
    if (isDigit(c) || (c === "." && isDigit(src[i + 1]))) {
      const callCtx = parenStack.length > 0 && parenStack[parenStack.length - 1];
      const { token, next } = readNumber(src, i, callCtx);
      push(token);
      i = next;
      continue;
    }
    if (LETTER_RE.test(c) || (code >= 0xd800 && code <= 0xdbff && LETTER_RE.test(String.fromCodePoint(src.codePointAt(i) ?? 0)))) {
      const start = i;
      const first = String.fromCodePoint(src.codePointAt(i) ?? 0);
      i += first.length;
      if (!SINGLE_GREEK.includes(first)) {
        while (i < n) {
          const ch = String.fromCodePoint(src.codePointAt(i) ?? 0);
          if (!IDENT_CONT_RE.test(ch) || SINGLE_GREEK.includes(ch)) break;
          i += ch.length;
        }
      }
      push({ type: "ident", text: src.slice(start, i), pos: start, end: i });
      continue;
    }
    if (c === "*" && src[i + 1] === "*") {
      push({ type: "op", text: "^", pos: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (c === "(") {
      const prev = tokens[tokens.length - 1];
      parenStack.push(prev !== undefined && prev.type === "ident");
      push({ type: "lparen", text: "(", pos: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === ")") {
      parenStack.pop();
      push({ type: "rparen", text: ")", pos: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === "," || c === "،") {
      push({ type: "comma", text: ",", pos: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === ";" || c === "؛") {
      push({ type: "semi", text: ";", pos: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === "=") {
      push({ type: "assign", text: "=", pos: i, end: i + 1 });
      i++;
      continue;
    }
    const op = OP_MAP[c];
    if (op !== undefined) {
      push({ type: "op", text: op, pos: i, end: i + 1 });
      i++;
      continue;
    }
    throw new CalcError("syntax", `unexpected character ${hexName(c)}`, { pos: i });
  }
  push({ type: "eof", text: "", pos: n, end: n });
  return tokens;
}

function readNumber(src: string, start: number, callCtx: boolean): { token: Token; next: number } {
  const n = src.length;
  let i = start;

  // 0x / 0b / 0o literals
  if (src[i] === "0" && i + 2 <= n) {
    const p = src[i + 1].toLowerCase();
    const re = p === "x" ? /[0-9a-fA-F_]/ : p === "b" ? /[01_]/ : p === "o" ? /[0-7_]/ : null;
    if (re) {
      let j = i + 2;
      while (j < n && re.test(src[j])) j++;
      const body = src.slice(i + 2, j).replace(/_/g, "");
      // a following digit/letter would make this a different token (e.g. "0b2"), so fall through then
      if (body.length > 0 && !/[\p{L}\p{N}]/u.test(src[j] ?? "")) {
        if (body.length > 600) throw new CalcError("overflow", "number literal is too long", { pos: start });
        const radix = p === "x" ? "0x" : p === "b" ? "0b" : "0o";
        const value = Decimal.make(BigInt(radix + body), 0);
        return { token: { type: "num", text: src.slice(start, j), pos: start, end: j, value }, next: j };
      }
    }
  }

  // integer part with optional underscores
  let intStr = "";
  let j = i;
  if (src[j] !== ".") {
    while (j < n && (isDigit(src[j]) || (src[j] === "_" && isDigit(src[j - 1]) && isDigit(src[j + 1])))) {
      if (src[j] !== "_") intStr += src[j];
      j++;
    }
  }
  let grouped = false;

  if (intStr.length >= 1 && intStr.length <= 3 && !src.slice(i, j).includes("_")) {
    // thousands grouped by spaces: "1 000 000"
    while (isSpaceChar(src[j]) && isDigit(src[j + 1]) && isDigit(src[j + 2]) && isDigit(src[j + 3]) && !isDigit(src[j + 4]) && src[j + 4] !== "_") {
      intStr += src.slice(j + 1, j + 4);
      j += 4;
      grouped = true;
    }
    // thousands grouped by commas: "1,234,567" (not inside function-call parentheses; "0,500" is a decimal)
    if (!grouped && !callCtx && intStr !== "0") {
      while (src[j] === "," && isDigit(src[j + 1]) && isDigit(src[j + 2]) && isDigit(src[j + 3]) && !isDigit(src[j + 4])) {
        intStr += src.slice(j + 1, j + 4);
        j += 4;
        grouped = true;
      }
    }
  }

  let fracStr = "";
  if (src[j] === ".") {
    let k = j + 1;
    while (isDigit(src[k])) k++;
    if (k > j + 1) {
      fracStr = src.slice(j + 1, k);
      j = k;
    }
  } else if (!grouped && !callCtx && src[j] === "," && isDigit(src[j + 1])) {
    let k = j + 1;
    while (isDigit(src[k])) k++;
    fracStr = src.slice(j + 1, k);
    j = k;
  }

  // exponent: e3, E-5, e+2 (only when digits follow)
  let expStr = "";
  if (src[j] === "e" || src[j] === "E") {
    let k = j + 1;
    if (src[k] === "+" || src[k] === "-") k++;
    if (isDigit(src[k])) {
      const ds = k;
      while (isDigit(src[k])) k++;
      if (k - ds > 6) throw new CalcError("overflow", "exponent is too large", { pos: start });
      expStr = "e" + src.slice(j + 1, k);
      j = k;
    }
  }

  if (intStr.length + fracStr.length === 0) {
    throw new CalcError("syntax", "invalid number", { pos: start });
  }
  let value: Decimal;
  try {
    value = Decimal.parse((intStr || "0") + (fracStr ? "." + fracStr : "") + expStr);
  } catch (e) {
    if (e instanceof CalcError && e.pos === undefined) throw new CalcError(e.code, e.message, { pos: start });
    throw e;
  }
  return { token: { type: "num", text: src.slice(start, j), pos: start, end: j, value }, next: j };
}
