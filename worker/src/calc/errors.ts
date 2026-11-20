// Error type shared by every calculator module. Nothing in src/calc lets a raw exception escape evaluate().

export type CalcErrorCode =
  | "syntax"
  | "div0"
  | "domain"
  | "overflow"
  | "unknown_ident"
  | "arg_count"
  | "too_long"
  | "too_deep";

export interface CalcErrorExtra {
  /** Zero-based UTF-16 offset in the input (syntax errors). */
  pos?: number;
  /** Unknown identifier (unknown_ident). */
  ident?: string;
  /** Function name (arg_count, domain). */
  fn?: string;
}

export class CalcError extends Error {
  readonly code: CalcErrorCode;
  readonly pos?: number;
  readonly ident?: string;
  readonly fn?: string;

  constructor(code: CalcErrorCode, message?: string, extra: CalcErrorExtra = {}) {
    super(message ?? code);
    this.name = "CalcError";
    this.code = code;
    if (extra.pos !== undefined) this.pos = extra.pos;
    if (extra.ident !== undefined) this.ident = extra.ident;
    if (extra.fn !== undefined) this.fn = extra.fn;
  }

  toJSON(): Record<string, unknown> {
    return { code: this.code, message: this.message, pos: this.pos, ident: this.ident, fn: this.fn };
  }
}
