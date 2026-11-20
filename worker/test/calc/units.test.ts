import { describe, expect, it } from "vitest";
import { convertUnit, Decimal, findUnit, listUnits, unitAliasConflicts, UnitError } from "../../src/calc";

const conv = (v: string, a: string, b: string): Decimal => {
  const f = findUnit(a);
  const t = findUnit(b);
  if (!f || !t) throw new Error(`unknown unit ${a} or ${b}`);
  return convertUnit(Decimal.parse(v), f, t);
};

describe("units: table", () => {
  it("has no alias collisions between different units", () => {
    expect(unitAliasConflicts()).toEqual([]);
  });
  it("covers all required categories", () => {
    const cats = new Set(listUnits().map((u) => u.category));
    for (const c of ["length", "mass", "volume", "area", "temperature", "speed", "time", "data", "pressure", "energy", "angle", "power"]) {
      expect(cats.has(c as never)).toBe(true);
    }
  });
});

describe("units: conversions", () => {
  const rows: [string, string, string, string][] = [
    ["1", "km", "m", "1000"],
    ["5", "km", "cm", "500000"],
    ["1", "mi", "m", "1609.344"],
    ["1", "ft", "in", "12"],
    ["1", "yd", "ft", "3"],
    ["1", "in", "mm", "25.4"],
    ["2", "kg", "g", "2000"],
    ["1", "lb", "oz", "16"],
    ["1", "t", "kg", "1000"],
    ["1", "l", "ml", "1000"],
    ["1", "gal", "l", "3.785411784"],
    ["1", "m3", "l", "1000"],
    ["1", "ha", "m2", "10000"],
    ["1", "sotix", "m2", "100"],
    ["1", "km2", "ha", "100"],
    ["1", "h", "min", "60"],
    ["1", "d", "h", "24"],
    ["1", "wk", "d", "7"],
    ["1", "KB", "B", "1000"],
    ["1", "KiB", "B", "1024"],
    ["1", "GiB", "MiB", "1024"],
    ["1", "GB", "MB", "1000"],
    ["8", "bit", "B", "1"],
    ["1", "atm", "pa", "101325"],
    ["1", "bar", "kpa", "100"],
    ["1", "kwh", "j", "3600000"],
    ["1", "kcal", "cal", "1000"],
    ["180", "deg", "turn", "0.5"],
    ["1", "kw", "w", "1000"],
    ["3.6", "km/h", "m/s", "1"],
  ];
  for (const [v, a, b, want] of rows) {
    it(`${v} ${a} -> ${b}`, () => {
      expect(conv(v, a, b).toString()).toBe(want);
    });
  }

  it("1 mi in km rounds correctly", () => {
    expect(conv("1", "mi", "km").toString()).toBe("1.609344");
  });
  it("mph and knots", () => {
    expect(conv("60", "mph", "km/h").toFixed(4)).toBe("96.5606");
    expect(conv("1", "kn", "km/h").toFixed(3)).toBe("1.852");
  });
  it("radians", () => {
    expect(conv("180", "deg", "rad").toFixed(10)).toBe("3.1415926536");
    expect(conv("1", "rad", "deg").toFixed(6)).toBe("57.295780");
  });
  it("temperature is affine", () => {
    expect(conv("100", "c", "f").toString()).toBe("212");
    expect(conv("0", "c", "f").toString()).toBe("32");
    expect(conv("-40", "c", "f").toString()).toBe("-40");
    expect(conv("32", "f", "c").toString()).toBe("0");
    expect(conv("212", "f", "c").toString()).toBe("100");
    expect(conv("0", "c", "k").toString()).toBe("273.15");
    expect(conv("273.15", "k", "c").toString()).toBe("0");
    expect(conv("0", "k", "f").toFixed(2)).toBe("-459.67");
    expect(conv("98.6", "f", "c").toFixed(2)).toBe("37.00");
  });
  it("identity conversion returns the value", () => {
    expect(conv("5", "km", "km").toString()).toBe("5");
  });
  it("round trips are accurate", () => {
    const back = conv(conv("123.456", "mi", "km").toString(), "km", "mi");
    expect(back.toFixed(10)).toBe("123.4560000000");
  });
  it("throws units_mismatch for different categories", () => {
    const f = findUnit("kg") as NonNullable<ReturnType<typeof findUnit>>;
    const t = findUnit("km") as NonNullable<ReturnType<typeof findUnit>>;
    try {
      convertUnit(Decimal.ONE, f, t);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(UnitError);
      expect((e as UnitError).code).toBe("units_mismatch");
    }
  });
  it("ambiguous 'gradus' acts as Celsius next to a temperature", () => {
    expect(conv("100", "gradus", "f").toString()).toBe("212");
    expect(conv("100", "c", "gradus").toString()).toBe("100");
    expect(conv("180", "gradus", "rad").toFixed(4)).toBe("3.1416");
  });
});

describe("units: names in 7 languages", () => {
  const same: string[][] = [
    ["km", "kilometer", "kilometre", "kilometr", "километр", "километров", "км", "kilómetro", "KM", "Kilometers"],
    ["m", "meter", "metr", "метр", "metro", "Metre"],
    ["kg", "kilogram", "kilogramm", "килограмм", "килограммов", "kilogramo", "kilo", "KG", "kgs"],
    ["l", "litr", "литр", "литров", "litre", "litro", "L", "Liters"],
    ["mi", "mile", "miles", "mil", "миль", "milla"],
    ["ft", "foot", "feet", "fut", "фут", "футов", "pie"],
    ["c", "°C", "celsius", "selsiy", "цельсия", "градусов цельсия", "derece celsius", "grados celsius", "Degc"],
    ["f", "°F", "fahrenheit", "farengeyt", "фаренгейта"],
    ["h", "soat", "час", "hora", "saat", "hours"],
    ["min", "daqiqa", "минута", "dakika", "minuto", "minutes"],
    ["m2", "m²", "kvadrat metr", "кв м", "sqm", "metrekare"],
    ["GB", "gb", "gigabayt", "гигабайт", "gigabyte"],
    ["kmh", "km/h", "km/soat", "км/ч", "kph"],
    ["lb", "funt", "фунт", "pound mass", "lbs"],
    ["oz", "unsiya", "унция", "ounce", "onza"],
  ];
  for (const group of same) {
    it(`${group[0]} aliases`, () => {
      for (const a of group) {
        const u = findUnit(a);
        expect(u, a).not.toBeNull();
        expect(u?.code, a).toBe(group[0]);
      }
    });
  }
  it("apostrophes, accents and dots are ignored", () => {
    expect(findUnit("kv.m")?.code).toBe("m2");
    expect(findUnit("Kilómetros")?.code).toBe("km");
  });
  it("Uzbek suffixes after the unit", () => {
    expect(findUnit("kilometrga")?.code).toBe("km");
    expect(findUnit("kilometrlar")?.code).toBe("km");
  });
  it("rejects non-units", () => {
    for (const s of ["", " ", "hello", "to", "xyzzy", "123", "a", "$"]) expect(findUnit(s), s).toBeNull();
  });
});

describe("units: fuzz", () => {
  it("never throws on garbage", () => {
    const chars = "abcxyz09 .,/-+*()°$€²³'`\u0000‮\uD800ёўқғ";
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 3000; i++) {
      let s = "";
      const n = Math.floor(rnd() * 60);
      for (let j = 0; j < n; j++) s += chars[Math.floor(rnd() * chars.length)];
      expect(() => findUnit(s)).not.toThrow();
    }
    expect(findUnit("x".repeat(10000))).toBeNull();
    expect(() => findUnit(undefined as unknown as string)).not.toThrow();
  });
});
