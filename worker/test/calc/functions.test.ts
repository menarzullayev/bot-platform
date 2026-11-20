import { describe, expect, it } from "vitest";
import { evaluate, getConstant, callFunction, Decimal } from "../../src/calc";
import { err, sig, val } from "./util";

const DEG = { angle: "deg" as const };

describe("constants", () => {
  it("pi, e, tau, phi to 34 digits", () => {
    expect(getConstant("pi").toString()).toBe("3.141592653589793238462643383279503");
    expect(getConstant("e").toString()).toBe("2.718281828459045235360287471352662");
    expect(getConstant("tau").toString()).toBe("6.283185307179586476925286766559006");
    expect(getConstant("phi").toString()).toBe("1.618033988749894848204586834365638");
    expect(val("pi")).toBe("3.141592653589793238462643383279503");
    expect(val("π")).toBe("3.141592653589793238462643383279503");
  });
});

describe("trigonometry, radians", () => {
  it("sin / cos / tan of 1", () => {
    expect(val("sin(1)")).toBe("0.841470984807896506652502321630299");
    expect(val("cos(1)")).toBe("0.5403023058681397174009366074429766");
    expect(val("tan(1)")).toBe("1.55740772465490223050697480745836");
  });
  it("sin(pi) is exactly zero (below the argument's resolution), cos(pi) = -1", () => {
    expect(val("sin(pi)")).toBe("0");
    expect(val("cos(pi)")).toBe("-1");
    expect(val("sin(2*pi)")).toBe("0");
    expect(val("cos(pi/2)")).toBe("0");
    expect(val("sin(pi/2)")).toBe("1");
    expect(val("sin(0)")).toBe("0");
    expect(val("cos(0)")).toBe("1");
  });
  it("is correct to 34 digits when the argument is not a multiple of pi", () => {
    // 34-digit argument that differs from pi by 7e-33: sin is about -7.1e-33 and must have full precision.
    expect(val("sin(3.14159265358979323846264338327951)")).toBe("-0.000000000000000000000000000000007115802830600624894179025055407692");
    expect(val("sin(1e10)")).toBe("-0.487506025087510691527794294348106");
    expect(val("sin(0.000001)")).toBe("0.0000009999999999998333333333333416666667");
  });
  it("tan(pi/2) is undefined", () => {
    expect(err("tan(pi/2)").code).toBe("domain");
  });
  it("inverse functions", () => {
    expect(val("atan(1)")).toBe("0.7853981633974483096156608458198757");
    expect(val("asin(0.5)")).toBe("0.5235987755982988730771072305465838");
    expect(val("atan2(1, -1)")).toBe("2.356194490192344928846982537459627");
    expect(val("asin(1)")).toBe("1.570796326794896619231321691639751");
    expect(val("acos(1)")).toBe("0");
    expect(val("atan(1e5000)")).toBe("1.570796326794896619231321691639751");
  });
});

describe("trigonometry, degrees", () => {
  it("sin(30) = 0.5, cos(60) = 0.5, tan(45) = 1 exactly", () => {
    expect(val("sin(30)", DEG)).toBe("0.5");
    expect(val("cos(60)", DEG)).toBe("0.5");
    expect(val("tan(45)", DEG)).toBe("1");
    expect(val("sin(90)", DEG)).toBe("1");
    expect(val("cos(90)", DEG)).toBe("0");
    expect(val("sin(180)", DEG)).toBe("0");
    expect(val("cos(180)", DEG)).toBe("-1");
    expect(val("sin(-30)", DEG)).toBe("-0.5");
    expect(val("sin(390)", DEG)).toBe("0.5");
    expect(val("sin(1e20 + 30)", DEG)).toBe(val("sin(30 + 1e20 mod 360)", DEG));
  });
  it("cos(30), sin(1)", () => {
    expect(sig("cos(30)", 20, DEG)).toBe("0.86602540378443864676");
    expect(val("sin(1)", DEG)).toBe("0.01745240643728351281941897851631619");
    expect(val("cos(1)", DEG)).toBe("0.9998476951563912391570115588139149");
    expect(val("tan(10)", DEG)).toBe("0.176326980708464973471090386868619");
  });
  it("tan(90) is a domain error", () => {
    expect(err("tan(90)", DEG).code).toBe("domain");
  });
  it("inverse functions return degrees", () => {
    expect(val("asin(0.5)", DEG)).toBe("30");
    expect(val("acos(0.5)", DEG)).toBe("60");
    expect(val("atan(1)", DEG)).toBe("45");
    expect(val("atan2(1, -1)", DEG)).toBe("135");
    expect(val("asin(1)", DEG)).toBe("90");
  });
  it("round trip", () => {
    expect(val("round(sin(asin(0.3)), 20)", DEG)).toBe("0.3");
  });
});

describe("exp, ln, log", () => {
  it("exp", () => {
    expect(val("exp(1)")).toBe("2.718281828459045235360287471352662");
    expect(val("exp(10)")).toBe("22026.46579480671651695790064528424");
    expect(val("exp(-1)")).toBe("0.3678794411714423215955237701614609");
    expect(val("exp(0)")).toBe("1");
    expect(sig("exp(100)", 34)).toBe("26881171418161354484126255515800140000000000");
    expect(err("exp(30000)").code).toBe("overflow");
  });
  it("ln", () => {
    expect(val("ln(10)")).toBe("2.302585092994045684017991454684364");
    expect(val("ln(2)")).toBe("0.6931471805599453094172321214581766");
    expect(val("ln(5)")).toBe("1.609437912434100374600759333226188");
    expect(val("ln(1)")).toBe("0");
    expect(val("round(ln(e), 30)")).toBe("1"); // e is rounded to 34 digits, so ln(e) is 1 - 1.8e-34
    expect(val("ln(1.0000001)")).toBe("0.00000009999999500000033333330833333533333");
    expect(val("ln(1e-5000)*-1")).toBe(sig("5000*ln(10)", 34));
  });
  it("log is base 10 by default, log(x, b) takes a base", () => {
    expect(val("log(1000)")).toBe("3");
    expect(val("log10(0.001)")).toBe("-3");
    expect(val("log(5)")).toBe("0.698970004336018804786261105275507");
    expect(val("log(8, 2)")).toBe("3");
    expect(val("log2(1024)")).toBe("10");
    expect(val("log(125, 5)")).toBe("3");
    expect(val("lg(100)")).toBe("2");
  });
  it("domain errors", () => {
    expect(err("ln(0)").code).toBe("domain");
    expect(err("ln(-1)").code).toBe("domain");
    expect(err("log(10, 1)").code).toBe("domain");
    expect(err("log(10, -2)").code).toBe("domain");
  });
});

describe("hyperbolic", () => {
  it("values", () => {
    expect(val("sinh(1)")).toBe("1.175201193643801456882381850595601");
    expect(val("cosh(1)")).toBe("1.543080634815243778477905620757062");
    expect(val("tanh(1)")).toBe("0.7615941559557648881194582826047936");
    expect(val("sinh(0.1)")).toBe("0.100166750019844025823729383521905");
    expect(val("tanh(0.5)")).toBe("0.4621171572600097585023184836436725");
    expect(val("sinh(-1)")).toBe("-1.175201193643801456882381850595601");
    expect(val("tanh(1000)")).toBe("1");
    expect(val("tanh(-1000)")).toBe("-1");
    expect(val("sinh(0)")).toBe("0");
    expect(val("cosh(0)")).toBe("1");
  });
});

describe("roots, rounding, misc", () => {
  it("sqrt / cbrt / abs / sign / hypot", () => {
    expect(val("sqrt(16)")).toBe("4");
    expect(val("sqrt(2)")).toBe("1.414213562373095048801688724209698");
    expect(val("cbrt(-8)")).toBe("-2");
    expect(val("abs(-3.5)")).toBe("3.5");
    expect(val("sign(-9)")).toBe("-1");
    expect(val("hypot(3, 4)")).toBe("5");
    expect(val("2^0.5")).toBe("1.414213562373095048801688724209698");
  });
  it("floor / ceil / round / trunc", () => {
    expect(val("floor(-2.5)")).toBe("-3");
    expect(val("ceil(2.1)")).toBe("3");
    expect(val("trunc(-2.9)")).toBe("-2");
    expect(val("round(2.5)")).toBe("3");
    expect(val("round(3.14159, 2)")).toBe("3.14");
    expect(val("round(1234.5, -2)")).toBe("1200");
    expect(err("round(1, 1.5)").code).toBe("domain");
  });
  it("factorial and combinatorics", () => {
    expect(val("fact(10)")).toBe("3628800");
    expect(val("10!")).toBe("3628800");
    expect(val("fact(0)")).toBe("1");
    expect(val("fact(25)")).toBe("15511210043330985984000000");
    expect(val("ncr(10, 3)")).toBe("120");
    expect(val("npr(10, 3)")).toBe("720");
    expect(val("ncr(52, 5)")).toBe("2598960");
    expect(val("ncr(100, 50)")).toBe("100891344545564193334812497256");
    expect(err("fact(-1)").code).toBe("domain");
    expect(err("fact(2.5)").code).toBe("domain");
    expect(err("fact(1001)").code).toBe("overflow");
    expect(err("ncr(3, 5)").code).toBe("domain");
  });
  it("fact(1000) is rounded to the working precision (exact value has 2568 digits)", () => {
    const r = evaluate("fact(1000)");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.exponent).toBe(2567);
      expect(r.value.toSignificant(10)).toBe("4.023872601".replace(".", "") + "0".repeat(2567 - 9));
    }
    expect(val("fact(100)")).toBe("93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000");
  });
  it("gcd / lcm / min / max / sum / avg / mod", () => {
    expect(val("gcd(12, 18)")).toBe("6");
    expect(val("gcd(12, 18, 8)")).toBe("2");
    expect(val("lcm(4, 6)")).toBe("12");
    expect(val("lcm(4, 6, 10)")).toBe("60");
    expect(val("min(3, 1, 2)")).toBe("1");
    expect(val("max(3, 1, 2)")).toBe("3");
    expect(val("sum(1, 2, 3.5)")).toBe("6.5");
    expect(val("avg(1, 2, 4)")).toBe("2.333333333333333333333333333333333");
    expect(val("mod(-7, 3)")).toBe("2");
    expect(val("mod(10, 4)")).toBe("2");
    expect(err("gcd(1.5, 2)").code).toBe("domain");
  });
  it("argument count", () => {
    expect(err("sin()").code).toBe("arg_count");
    expect(err("sin(1, 2)").code).toBe("arg_count");
    expect(err("sqrt()").code).toBe("arg_count");
    expect(err("atan2(1)").code).toBe("arg_count");
    expect(err("min()").code).toBe("arg_count");
    expect(err("log(1,2,3)").code).toBe("arg_count");
    expect(err("sin(1,2)").fn).toBe("sin");
  });
  it("names are case-insensitive and have aliases", () => {
    expect(val("SIN(30)", DEG)).toBe("0.5");
    expect(val("Sqrt(9)")).toBe("3");
    expect(val("tg(45)", DEG)).toBe("1");
    expect(val("ctg(45)", DEG)).toBe("1");
    expect(val("arctan(1)", DEG)).toBe("45");
  });
  it("callFunction works directly", () => {
    expect(callFunction("max", [Decimal.from(1), Decimal.from(5)], { angle: "rad", digits: 34 }).toString()).toBe("5");
    expect(() => callFunction("nope", [], { angle: "rad", digits: 34 })).toThrow(/unknown function/);
  });
  it("working precision is configurable", () => {
    expect(val("pi", { digits: 20 })).toBe("3.1415926535897932385");
    expect(val("1/3", { digits: 12 })).toBe("0.333333333333");
    expect(val("sqrt(2)", { digits: 50 })).toBe("1.4142135623730950488016887242096980785696718753769");
  });
});
