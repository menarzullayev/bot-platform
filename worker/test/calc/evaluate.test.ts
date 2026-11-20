import { describe, expect, it } from "vitest";
import { Decimal, evaluate, parse, parseProgram, tokenize } from "../../src/calc";
import { err, val } from "./util";

describe("basic arithmetic", () => {
  it("0.1 + 0.2 = 0.3 and friends", () => {
    expect(val("0.1+0.2")).toBe("0.3");
    expect(val("0.3-0.1")).toBe("0.2");
    expect(val("1.1*1.1")).toBe("1.21");
    expect(val("2+3*4")).toBe("14");
    expect(val("(2+3)*4")).toBe("20");
    expect(val("10-4-3")).toBe("3");
    expect(val("100/10/5")).toBe("2");
    expect(val("12345.678*9876.543")).toBe("121932619.631154");
  });
  it("1/3 keeps 34 digits", () => {
    expect(val("1/3")).toBe("0.3333333333333333333333333333333333");
    expect(val("2/3")).toBe("0.6666666666666666666666666666666667");
    expect(val("1/3*3")).toBe("0.9999999999999999999999999999999999");
  });
  it("unicode operators", () => {
    expect(val("6×7")).toBe("42");
    expect(val("84÷2")).toBe("42");
    expect(val("84:2")).toBe("42");
    expect(val("5−2")).toBe("3");
    expect(val("3·4")).toBe("12");
    expect(val("2**10")).toBe("1024");
    expect(val("2^10")).toBe("1024");
    expect(val("√16")).toBe("4");
    expect(val("√(9+16)")).toBe("5");
  });
  it("powers: precedence and associativity", () => {
    expect(val("-2^2")).toBe("-4");
    expect(val("(-2)^2")).toBe("4");
    expect(val("2^3^2")).toBe("512");
    expect(val("2^-2")).toBe("0.25");
    expect(val("2^0.5")).toBe("1.414213562373095048801688724209698");
    expect(val("-2^-2")).toBe("-0.25");
    expect(val("10^3")).toBe("1000");
    expect(err("2^10!").code).toBe("overflow"); // 2^3628800
  });
  it("10!", () => {
    expect(val("10!")).toBe("3628800");
    expect(val("5!+1")).toBe("121");
    expect(val("-3!")).toBe("-6");
    expect(val("(2+1)!")).toBe("6");
    expect(val("2^3!")).toBe("64");
    expect(val("0!")).toBe("1");
  });
  it("mod", () => {
    expect(val("50 mod 7")).toBe("1");
    expect(val("50 MOD 7")).toBe("1");
    expect(val("-7 mod 3")).toBe("2");
    expect(val("7.5 mod 2")).toBe("1.5");
    expect(val("17 % 5")).toBe("2");
    expect(val("2+17%5*3")).toBe("8");
    expect(err("5 mod 0").code).toBe("div0");
  });
});

describe("percent semantics", () => {
  it("relative to the left operand for + and -", () => {
    expect(val("200+15%")).toBe("230");
    expect(val("200-15%")).toBe("170");
    expect(val("200+15%+10%")).toBe("253");
    expect(val("100+50%")).toBe("150");
    expect(val("80-12.5%")).toBe("70");
  });
  it("plain fraction for * and /", () => {
    expect(val("200*15%")).toBe("30");
    expect(val("200/50%")).toBe("400");
    expect(val("15%")).toBe("0.15");
    expect(val("-15%")).toBe("-0.15");
    expect(val("50%*50%")).toBe("0.25");
  });
  it("'of'", () => {
    expect(val("15% of 200")).toBe("30");
    expect(val("20% of 50% of 80")).toBe("8");
    expect(val("15 % of 200")).toBe("30");
    expect(val("200+15% of 80")).toBe("212");
    expect(val("(10+5)% of 200")).toBe("30");
  });
  it("percent versus modulo", () => {
    expect(val("50 mod 7")).toBe("1");
    expect(val("50%7")).toBe("1");
    expect(val("50% + 1")).toBe("1.5");
    expect(val("(50%)")).toBe("0.5");
    expect(val("max(5%, 3%)")).toBe("0.05");
  });
});

describe("implicit multiplication", () => {
  it("numbers, constants, functions, parentheses", () => {
    expect(val("2pi")).toBe("6.283185307179586476925286766559006");
    expect(val("2(3+4)")).toBe("14");
    expect(val("(1+2)(3+4)")).toBe("21");
    expect(val("2sqrt(9)")).toBe("6");
    expect(val("3x", { vars: { x: Decimal.from(5) } })).toBe("15");
    expect(val("x(2+3)", { vars: { x: Decimal.from(4) } })).toBe("20");
    expect(val("2 pi")).toBe("6.283185307179586476925286766559006");
    expect(val("3(4)(5)")).toBe("60");
    expect(val("2π")).toBe("6.283185307179586476925286766559006");
    expect(val("5 e")).toBe("13.59140914229522617680143735676331");
  });
  it("binds tighter than division, looser than powers", () => {
    expect(val("1/2pi")).toBe(val("1/(2*pi)"));
    expect(val("2x^2", { vars: { x: Decimal.from(3) } })).toBe("18");
    expect(val("-2x", { vars: { x: Decimal.from(3) } })).toBe("-6");
    expect(val("12/3(2)")).toBe("2");
  });
  it("two adjacent numbers are not multiplied", () => {
    expect(err("2 3").code).toBe("syntax");
    expect(err("(1)2").code).toBe("syntax");
  });
});

describe("number literals", () => {
  it("underscores, space and comma thousands", () => {
    expect(val("1_000")).toBe("1000");
    expect(val("1_000_000+1")).toBe("1000001");
    expect(val("1 000 000")).toBe("1000000");
    expect(val("1 000 000 + 1")).toBe("1000001");
    expect(val("12 345.5")).toBe("12345.5");
    expect(val("1,234,567")).toBe("1234567");
    expect(val("1,234,567.89")).toBe("1234567.89");
    expect(val("1,234")).toBe("1234");
  });
  it("decimal comma versus thousands comma", () => {
    expect(val("1,5")).toBe("1.5");
    expect(val("0,5")).toBe("0.5");
    expect(val("0,500")).toBe("0.5");
    expect(val("1,2345")).toBe("1.2345");
    expect(val("12,5+0,5")).toBe("13");
    expect(val("3,14159*2")).toBe("6.28318");
    expect(val("1.5")).toBe("1.5");
    expect(val(".5+.5")).toBe("1");
  });
  it("commas inside function calls are always argument separators", () => {
    expect(val("max(1,5)")).toBe("5");
    expect(val("max(1,500)")).toBe("500");
    expect(val("gcd(12,18)")).toBe("6");
    expect(val("max((1,5), 2)")).toBe("2");
  });
  it("scientific and radix literals", () => {
    expect(val("1e3")).toBe("1000");
    expect(val("1.5e-3")).toBe("0.0015");
    expect(val("2E+2")).toBe("200");
    expect(val("0xFF")).toBe("255");
    expect(val("0b101")).toBe("5");
    expect(val("0o17")).toBe("15");
    expect(val("0xff+1")).toBe("256");
    expect(val("2e")).toBe("5.436563656918090470720574942705324");
    expect(val("1e3+1e-3")).toBe("1000.001");
  });
  it("arabic-indic digits are accepted on input", () => {
    expect(val("١٢+٣")).toBe("15");
  });
});

describe("variables and statements", () => {
  it("assignment and sequences", () => {
    expect(val("x = 5")).toBe("5");
    expect(val("x = 5; x*2")).toBe("10");
    expect(val("a = 2; b = 3; a^b")).toBe("8");
    expect(val("x = 1; x = x + 1; x = x * 10")).toBe("20");
    expect(val("1; 2; 3;")).toBe("3");
    const r = evaluate("x = 4; y = x^2");
    expect(r.ok && r.vars.y.toString()).toBe("16");
    expect(r.ok && r.vars.x.toString()).toBe("4");
  });
  it("ans and _", () => {
    const first = evaluate("6*7");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(val("ans+1", { vars: first.vars })).toBe("43");
    expect(val("_*2", { vars: first.vars })).toBe("84");
    expect(val("ans", { vars: { ans: Decimal.from(9) } })).toBe("9");
  });
  it("cannot assign to constants or functions", () => {
    expect(err("pi = 3").code).toBe("syntax");
    expect(err("sin = 3").code).toBe("syntax");
  });
  it("caller's vars are not mutated", () => {
    const vars = { x: Decimal.from(1) };
    evaluate("x = 2", { vars });
    expect(vars.x.toString()).toBe("1");
  });
});

describe("error codes", () => {
  it("div0", () => {
    expect(err("1/0").code).toBe("div0");
    expect(err("0/0").code).toBe("div0");
    expect(err("1/(2-2)").code).toBe("div0");
    expect(err("0^-1").code).toBe("div0");
  });
  it("domain", () => {
    expect(err("sqrt(-1)").code).toBe("domain");
    expect(err("(-8)^(1/3)").code).toBe("domain");
    expect(err("asin(2)").code).toBe("domain");
    expect(err("(-1)!").code).toBe("domain");
  });
  it("overflow", () => {
    expect(err("2^100000").code).toBe("overflow");
    expect(err("10^10001").code).toBe("overflow");
    expect(err("9^9^9").code).toBe("overflow");
    expect(err("1e99999").code).toBe("overflow");
    expect(evaluate("1000!").ok).toBe(true);
    expect(err("1001!").code).toBe("overflow");
    expect(val("10^10000").length).toBe(10001);
    expect(err("fact(1000)^4").code).toBe("overflow");
  });
  it("unknown_ident carries the name", () => {
    const e = err("abc");
    expect(e.code).toBe("unknown_ident");
    expect(e.ident).toBe("abc");
    expect(err("2+foo").ident).toBe("foo");
    expect(err("foo(3)").code).toBe("unknown_ident");
    expect(err("3x").ident).toBe("x");
  });
  it("syntax errors carry the position", () => {
    const e = err("2+");
    expect(e.code).toBe("syntax");
    expect(e.pos).toBe(2);
    expect(err("2+*3").pos).toBe(2);
    expect(err("(2+3").pos).toBe(4);
    expect(err("2+3)").pos).toBe(3);
    expect(err("2 $ 3").pos).toBe(2);
    expect(err("").code).toBe("syntax");
    expect(err("   ").code).toBe("syntax");
    expect(err(";").code).toBe("syntax");
    expect(err("1..2").code).toBe("syntax");
    expect(err("sin(1,)").code).toBe("syntax");
    expect(err("5 +\n *").pos).toBe(5);
  });
  it("arg_count", () => {
    expect(err("sqrt(1,2)").code).toBe("arg_count");
    expect(err("pi(1,2)").code).toBe("arg_count");
  });
});

describe("limits", () => {
  it("too_long input", () => {
    expect(err("1+".repeat(300) + "1").code).toBe("too_long");
    expect(err("1".repeat(501)).code).toBe("too_long");
    expect(val("1".repeat(500)).length).toBe(500);
  });
  it("too many tokens", () => {
    expect(err("1+".repeat(160) + "1").code).toBe("too_long"); // 321 tokens
    expect(val("1+".repeat(100) + "1")).toBe("101");
  });
  it("too_deep nesting", () => {
    expect(err("(".repeat(100) + "1" + ")".repeat(100)).code).toBe("too_deep");
    expect(err("-".repeat(100) + "1").code).toBe("too_deep");
    expect(err("2^".repeat(100) + "2").code).toBe("too_deep");
    expect(val("(".repeat(50) + "1" + ")".repeat(50))).toBe("1");
    expect(err("sin(".repeat(70) + "1" + ")".repeat(70)).code).toBe("too_deep");
  });
});

describe("AST shape (stable, consumed by the symbolic solver)", () => {
  it("parse() exposes typed nodes with positions", () => {
    const n = parse("2x+sin(pi)!");
    expect(n.type).toBe("binary");
    if (n.type !== "binary") return;
    expect(n.op).toBe("+");
    expect(n.left.type).toBe("implicit");
    expect(n.right.type).toBe("postfix");
    if (n.right.type === "postfix") {
      expect(n.right.op).toBe("factorial");
      expect(n.right.arg.type).toBe("call");
    }
    expect(n.pos).toBe(0);
    expect(n.end).toBe(11);
  });
  it("unary, percent, assign and program nodes", () => {
    const u = parse("-x");
    expect(u).toMatchObject({ type: "unary", op: "-", arg: { type: "ident", name: "x" } });
    expect(parse("15%")).toMatchObject({ type: "postfix", op: "percent", arg: { type: "num", raw: "15" } });
    expect(parse("y = 1")).toMatchObject({ type: "assign", name: "y" });
    expect(parseProgram("1;2").body).toHaveLength(2);
    expect(parse("15% of 200")).toMatchObject({ type: "binary", op: "of" });
    expect(parse("50 mod 7")).toMatchObject({ type: "binary", op: "mod" });
    expect(parse("2^3^2")).toMatchObject({ type: "binary", op: "^", right: { type: "binary", op: "^" } });
  });
  it("evaluate returns the last statement's AST and is JSON friendly", () => {
    const r = evaluate("x = 1; x + 2");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ast.type).toBe("binary");
      expect(JSON.stringify(r.ast)).toContain('"type":"binary"');
      expect(r.program.body).toHaveLength(2);
    }
  });
  it("tokenizer positions", () => {
    const t = tokenize("12 + x");
    expect(t.map((x) => [x.type, x.pos])).toEqual([
      ["num", 0],
      ["op", 3],
      ["ident", 5],
      ["eof", 6],
    ]);
  });
});
