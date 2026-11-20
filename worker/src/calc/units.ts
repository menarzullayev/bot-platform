// Unit table, alias lookup (7 languages) and exact Decimal conversion.
// Every unit has a canonical code; conversion goes value * fromFactor / toFactor (one division),
// temperature is affine and handled separately.

import { Decimal } from "./decimal";

export type UnitCategory =
  | "length"
  | "mass"
  | "volume"
  | "area"
  | "temperature"
  | "speed"
  | "time"
  | "data"
  | "pressure"
  | "energy"
  | "angle"
  | "power";

export interface UnitRef {
  /** Canonical unit code, e.g. "km", "c", "KiB". */
  readonly code: string;
  readonly category: UnitCategory;
  /** Alternative reading of an ambiguous word ("gradus", "degree" mean angle or Celsius). */
  readonly alt?: UnitRef;
}

export class UnitError extends Error {
  readonly code: "units_mismatch";
  readonly from: string;
  readonly to: string;
  constructor(from: string, to: string) {
    super(`cannot convert ${from} to ${to}`);
    this.name = "UnitError";
    this.code = "units_mismatch";
    this.from = from;
    this.to = to;
  }
}

const PI = "3.14159265358979323846264338327950288";

// [category, code, factor to the category base (decimal or "a/b"), aliases separated by "|"].
// Aliases are normalized by normalizeToken(), so case, accents, dots and apostrophes do not matter.
type Row = [UnitCategory, string, string, string];

const ROWS: Row[] = [
  // ---- length (base: metre) ----
  ["length", "m", "1", "m|meter|metre|meters|metres|metr|metro|метр|م|متر"],
  ["length", "km", "1000", "km|kilometer|kilometre|kilometers|kilometres|kilometr|kilometro|километр|км|كم|كيلومتر"],
  ["length", "cm", "0.01", "cm|centimeter|centimetre|santimetr|santimetre|centimetro|сантиметр|см|سم"],
  ["length", "mm", "0.001", "mm|millimeter|millimetre|millimetr|milimetro|milimetre|миллиметр|мм|ملم"],
  ["length", "um", "0.000001", "um|µm|μm|micron|micrometer|mikron|mikrometr|mkm|мкм|микрон"],
  ["length", "nm", "0.000000001", "nm|nanometer|nanometr|нм|нанометр"],
  ["length", "mi", "1609.344", "mi|mile|miles|mil|milya|milla|millas|миля|миль|мили|ميل"],
  ["length", "ft", "0.3048", "ft|foot|feet|fut|pie|pies|ayak|фут|футов|футы"],
  ["length", "in", "0.0254", "in|inch|inches|dyuym|duym|pulgada|pulgadas|inc|дюйм|дюймов|дюймы|بوصة"],
  ["length", "yd", "0.9144", "yd|yard|yards|yarda|yardas|ярд|ярдов|ярды"],
  ["length", "nmi", "1852", "nmi|nautical mile|dengiz mili|deniz mili|milla nautica|морская миля|морских миль"],
  // ---- mass (base: kilogram) ----
  ["mass", "kg", "1", "kg|kgs|kilogram|kilogramm|kilogramo|kilo|kilos|килограмм|кг|кило|كجم|كيلوغرام|كيلوجرام"],
  ["mass", "g", "0.001", "g|gr|gram|gramm|gramo|grams|грамм|грамм|г|غرام|جرام"],
  ["mass", "mg", "0.000001", "mg|milligram|milligramm|miligram|miligramo|миллиграмм|мг"],
  ["mass", "t", "1000", "t|tonne|tonnes|ton|tons|tonna|tonelada|metric ton|тонна|тонн|т|طن"],
  ["mass", "lb", "0.45359237", "lb|lbs|pound|pounds|pound mass|libra|libras|funt|фунт|фунтов|фунты|رطل"],
  ["mass", "oz", "0.028349523125", "oz|ounce|ounces|unsiya|onza|onzas|ons|унция|унций|унции|أونصة"],
  // ---- volume (base: litre) ----
  ["volume", "l", "1", "l|liter|litre|liters|litres|litr|litro|litros|литр|л|لتر"],
  ["volume", "ml", "0.001", "ml|milliliter|millilitre|millilitr|mililitro|mililitre|миллилитр|мл|مل"],
  ["volume", "cl", "0.01", "cl|centiliter|centilitre|santilitr|сантилитр|сл"],
  ["volume", "dl", "0.1", "dl|deciliter|decilitre|detsilitr|децилитр|дл"],
  ["volume", "m3", "1000", "m3|m³|cubic meter|cubic metre|kub metr|kub m|kubometr|metro cubico|metreküp|metrekup|m kup|кубометр|куб м|м3|кубический метр"],
  ["volume", "cm3", "0.001", "cm3|cc|cubic centimeter|cubic centimetre|kub santimetr|см3|кубический сантиметр|куб см"],
  ["volume", "gal", "3.785411784", "gal|gallon|gallons|galon|galones|us gallon|галлон|галлонов|галлоны"],
  ["volume", "qt", "0.946352946", "qt|quart|quarts"],
  ["volume", "pt", "0.473176473", "pt|pint|pints"],
  ["volume", "cup", "0.2365882365", "cup|cups|chashka|чашка|чашек|taza|tazas|fincan"],
  ["volume", "floz", "0.0295735295625", "floz|fl oz|fluid ounce|fluid ounces"],
  ["volume", "tbsp", "0.01478676478125", "tbsp|tablespoon|osh qoshiq|столовая ложка|столовых ложек|cucharada"],
  ["volume", "tsp", "0.00492892159375", "tsp|teaspoon|choy qoshiq|чайная ложка|чайных ложек|cucharadita"],
  // ---- area (base: square metre) ----
  ["area", "m2", "1", "m2|m²|sqm|sq m|square meter|square metre|kv m|kvm|kvadrat metr|квм|кв м|м2|квадратный метр|квадратных метров|metro cuadrado|metrekare|m kare"],
  ["area", "km2", "1000000", "km2|sq km|sqkm|square kilometer|square kilometre|kv km|kvkm|kvadrat kilometr|км2|кв км|квкм|квадратный километр|kilometrekare|km kare"],
  ["area", "cm2", "0.0001", "cm2|sq cm|square centimeter|kv sm|см2|кв см|квадратный сантиметр"],
  ["area", "mm2", "0.000001", "mm2|sq mm|square millimeter|мм2|кв мм"],
  ["area", "ha", "10000", "ha|hectare|hectares|gektar|hektar|hectarea|гектар|га|гектаров|هكتار"],
  ["area", "acre", "4046.8564224", "acre|acres|ac|akr|акр|акров"],
  ["area", "ft2", "0.09290304", "ft2|ft²|sqft|sq ft|square foot|square feet|kv fut|кв фут|квадратный фут"],
  ["area", "in2", "0.00064516", "in2|sq in|sqin|square inch|square inches|кв дюйм"],
  ["area", "yd2", "0.83612736", "yd2|sq yd|square yard|square yards"],
  ["area", "mi2", "2589988.110336", "mi2|sq mi|square mile|square miles|кв миля|квадратная миля"],
  ["area", "sotix", "100", "sotix|sotih|sotka|sotka|sotki|сотка|сотки|соток"],
  // ---- temperature (affine, handled in convertUnit) ----
  [
    "temperature",
    "c",
    "1",
    "c|°c|c°|degc|celsius|celcius|selsiy|selsiya|tselsiy|cels|цельсий|цельсия|по цельсию|градус цельсия|градуса цельсия|градусов цельсия|degrees celsius|degree celsius|gradus selsiy|gradus tselsiy|derece celsius|santigrat|santigrat derece|grado celsius|grados celsius|درجة مئوية",
  ],
  [
    "temperature",
    "f",
    "1",
    "f|°f|f°|degf|fahrenheit|farengeyt|farangeyt|farenhayt|фаренгейт|фаренгейта|по фаренгейту|градус фаренгейта|градуса фаренгейта|градусов фаренгейта|degrees fahrenheit|degree fahrenheit|gradus farengeyt|derece fahrenheit|grado fahrenheit|grados fahrenheit|فهرنهايت",
  ],
  ["temperature", "k", "1", "k|°k|degk|kelvin|kelvins|келвин|кельвин|кельвина|кельвинов|كلفن"],
  // ---- speed (base: metre per second) ----
  ["speed", "m/s", "1", "m/s|mps|m s|metr/sekund|metro por segundo|м/с|m/sn|mt/s|meters per second|metres per second|метров в секунду"],
  [
    "speed",
    "kmh",
    "1000/3600",
    "kmh|km/h|kph|kmph|km/hr|km/soat|km/sa|km/saat|км/ч|кмч|km por hora|kilometers per hour|kilometres per hour|kilometr/soat|километров в час|километр в час|كم/س",
  ],
  ["speed", "mph", "1609.344/3600", "mph|mi/h|mi/hr|miles per hour|mil/soat|миль в час|миль/ч|милях в час|millas por hora"],
  ["speed", "kn", "1852/3600", "kn|kt|knot|knots|uzel|узел|узлов|узла|nudo|nudos"],
  ["speed", "ft/s", "0.3048", "ft/s|fts|feet per second|fut/s|фут/с"],
  // ---- time (base: second) ----
  ["time", "s", "1", "s|sec|secs|second|seconds|soniya|saniye|sn|segundo|segundos|секунда|секунд|секунды|сек|с|ثانية"],
  ["time", "ms", "0.001", "ms|msec|millisecond|milliseconds|millisekund|milisaniye|milisegundo|миллисекунда|миллисекунд|мс"],
  ["time", "us", "0.000001", "us|µs|μs|microsecond|microseconds|mikrosekund|mks|мкс"],
  ["time", "min", "60", "min|mins|minute|minutes|daqiqa|dakika|minuto|minutos|минута|минут|минуты|мин|dk|دقيقة"],
  ["time", "h", "3600", "h|hr|hrs|hour|hours|soat|saat|sa|hora|horas|час|часов|часа|ч|ساعة"],
  ["time", "d", "86400", "d|day|days|kun|gun|dia|dias|день|дней|дня|дн|يوم"],
  ["time", "wk", "604800", "wk|week|weeks|hafta|semana|semanas|неделя|недель|недели|нед|أسبوع"],
  // Gregorian averages: month = 365.2425 d / 12, year = 365.2425 d.
  ["time", "mo", "2629746", "mo|mon|month|months|oy|ay|mes|meses|месяц|месяцев|месяца|мес|شهر"],
  ["time", "yr", "31556952", "yr|y|yrs|year|years|yil|ano|anos|год|года|лет|سنة"],
  // ---- data (base: byte) ----
  ["data", "bit", "0.125", "bit|bits|бит|бита"],
  ["data", "B", "1", "b|byte|bytes|bayt|octet|байт|байта|байтов"],
  ["data", "KB", "1000", "kb|kilobyte|kilobytes|kilobayt|килобайт|килобайта|кб"],
  ["data", "MB", "1000000", "mb|megabyte|megabytes|megabayt|мегабайт|мегабайта|мб"],
  ["data", "GB", "1000000000", "gb|gig|gigabyte|gigabytes|gigabayt|гигабайт|гигабайта|гб"],
  ["data", "TB", "1000000000000", "tb|terabyte|terabytes|terabayt|терабайт|терабайта|тб"],
  ["data", "PB", "1000000000000000", "pb|petabyte|petabytes|petabayt|петабайт|пб"],
  ["data", "KiB", "1024", "kib|kibibyte|kibibytes|кибибайт"],
  ["data", "MiB", "1048576", "mib|mebibyte|mebibytes|мебибайт"],
  ["data", "GiB", "1073741824", "gib|gibibyte|gibibytes|гибибайт"],
  ["data", "TiB", "1099511627776", "tib|tebibyte|tebibytes|тебибайт"],
  ["data", "kbit", "125", "kbit|kilobit|kilobits|kbits|kilobit"],
  ["data", "Mbit", "125000", "mbit|megabit|megabits|mbits"],
  ["data", "Gbit", "125000000", "gbit|gigabit|gigabits|gbits"],
  // ---- pressure (base: pascal) ----
  ["pressure", "pa", "1", "pa|pascal|paskal|pascales|паскаль|па|باسكال"],
  ["pressure", "hpa", "100", "hpa|hectopascal|gektopaskal|гпа|гектопаскаль"],
  ["pressure", "kpa", "1000", "kpa|kilopascal|kilopaskal|кпа|килопаскаль"],
  ["pressure", "mpa", "1000000", "mpa|megapascal|megapaskal|мпа|мегапаскаль"],
  ["pressure", "bar", "100000", "bar|bars|бар|بار"],
  ["pressure", "mbar", "100", "mbar|millibar|millibars|мбар|миллибар"],
  ["pressure", "atm", "101325", "atm|atmosphere|atmospheres|atmosfera|atmosfer|атмосфера|атм|атмосфер"],
  ["pressure", "psi", "6894.757293168", "psi"],
  ["pressure", "mmhg", "133.322387415", "mmhg|mm hg|mm sim ust|mm simob ustuni|ммртст|мм рт ст|milimetros de mercurio"],
  ["pressure", "torr", "101325/760", "torr|торр"],
  // ---- energy (base: joule) ----
  ["energy", "j", "1", "j|joule|joules|joul|julio|julios|jul|джоуль|дж|جول"],
  ["energy", "kj", "1000", "kj|kilojoule|kilojoul|kilojulio|кдж|килоджоуль"],
  ["energy", "cal", "4.184", "cal|calorie|calories|kaloriya|kalori|caloria|calorias|калория|кал|калорий"],
  ["energy", "kcal", "4184", "kcal|kilocalorie|kilocalories|kilokaloriya|kilokalori|kilocaloria|ккал|килокалория|килокалорий"],
  ["energy", "wh", "3600", "wh|watt hour|vatt soat|ватт час|вт ч|втч|watt saat"],
  ["energy", "kwh", "3600000", "kwh|kilowatt hour|kilowatt hours|kilovatt soat|kvt soat|kvtch|kvts|киловатт час|квт ч|квтч|kilowatt saat|كيلوواط ساعة"],
  ["energy", "ev", "0.0000000000000000001602176634", "ev|electronvolt|electron volt|электронвольт|эв"],
  ["energy", "btu", "1055.05585262", "btu"],
  // ---- angle (base: degree) ----
  ["angle", "deg", "1", "deg|degrees|degree|gradus|daraja|derece|grado|grados|градус|градуса|градусов|°|درجة"],
  ["angle", "rad", `180/${PI}`, "rad|radian|radians|radyan|radianes|радиан|радиана|радиан|راديان"],
  ["angle", "gon", "0.9", "gon|gradian|gradians|гон|градиан"],
  ["angle", "arcmin", "1/60", "arcmin|arcminute|arcminutes|′|угловая минута"],
  ["angle", "arcsec", "1/3600", "arcsec|arcsecond|arcseconds|″|угловая секунда"],
  ["angle", "turn", "360", "turn|turns|revolution|revolutions|aylanish|oborot|оборот|оборотов|vuelta|vueltas"],
  // ---- power (base: watt) ----
  ["power", "w", "1", "w|watt|watts|vatt|vatio|vatios|ватт|вт|واط"],
  ["power", "kw", "1000", "kw|kilowatt|kilowatts|kilovatt|киловатт|квт|كيلوواط"],
  ["power", "mw", "1000000", "mw|megawatt|megawatts|megavatt|мегаватт|мвт"],
  ["power", "hp", "745.69987158227022", "hp|horsepower|ot kuchi|beygir gucu|beygir|caballo|caballos|лошадиная сила|лошадиных сил|л с|лс"],
  ["power", "ps", "735.49875", "ps|metric horsepower|metric hp|cv|caballo de vapor|pferdestarke"],
];

// Words that mean degrees of angle or of temperature. They resolve to the angle unit with a Celsius alternative.
const DEGREE_WORDS = new Set(["deg", "degrees", "degree", "gradus", "daraja", "derece", "grado", "grados", "градус", "градуса", "градусов", "°", "درجة"]);

/** Lower-case, strip accents, apostrophes, dots and hyphens; collapse whitespace. Shared with currency.ts. */
export function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[µμ]/g, "u")
    .replace(/[’'‘ʻʼ`´ʹ]/g, "")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[.^]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Suffixes tried (longest first) when a token is not a known alias: plurals and case endings.
const SUFFIXES = ["lar", "ler", "dan", "es", "ga", "da", "ов", "ев", "ей", "ам", "ах", "ы", "и", "а", "у", "е", "s"];

/** Candidate spellings of a normalized token: itself, then with one suffix removed. */
export function tokenCandidates(n: string): string[] {
  const out = [n];
  for (const sfx of SUFFIXES) {
    if (n.length - sfx.length >= 2 && n.endsWith(sfx)) out.push(n.slice(0, n.length - sfx.length));
  }
  return out;
}

interface UnitInfo {
  ref: UnitRef;
  factor: string;
}

let ALIASES: Map<string, UnitRef> | null = null;
let INFO: Map<string, UnitInfo> | null = null;
const CONFLICTS: string[] = [];
const FACTOR_CACHE = new Map<string, Decimal>();

function build(): void {
  const aliases = new Map<string, UnitRef>();
  const info = new Map<string, UnitInfo>();
  const celsiusRow = ROWS.find((r) => r[1] === "c") as Row;
  const celsius: UnitRef = Object.freeze({ code: "c", category: celsiusRow[0] });
  for (const [category, code, factor, names] of ROWS) {
    const base: UnitRef = code === "c" ? celsius : Object.freeze({ code, category });
    info.set(code, { ref: base, factor });
    const ambiguous: UnitRef =
      code === "deg" ? Object.freeze({ code, category, alt: celsius }) : base;
    for (const name of names.split("|")) {
      const key = normalizeToken(name);
      if (!key) continue;
      const ref = code === "deg" && DEGREE_WORDS.has(key) ? ambiguous : base;
      const prev = aliases.get(key);
      if (prev && prev.code !== ref.code) CONFLICTS.push(`${key}: ${prev.code} / ${ref.code}`);
      else if (!prev) aliases.set(key, ref);
    }
  }
  ALIASES = aliases;
  INFO = info;
}

/** Alias collisions between different units found while building the table (for tests). */
export function unitAliasConflicts(): string[] {
  if (!ALIASES) build();
  return CONFLICTS.slice();
}

/** All canonical units (code and category), mainly for help texts and tests. */
export function listUnits(): { code: string; category: UnitCategory }[] {
  return ROWS.map((r) => ({ code: r[1], category: r[0] }));
}

/** Resolve a unit word or symbol (any of the supported languages) to a unit, or null. */
export function findUnit(token: string): UnitRef | null {
  if (typeof token !== "string" || token.length === 0 || token.length > 48) return null;
  if (!ALIASES) build();
  const n = normalizeToken(token);
  if (n.length === 0) return null;
  for (const c of tokenCandidates(n)) {
    const hit = (ALIASES as Map<string, UnitRef>).get(c);
    if (hit) return hit;
  }
  return null;
}

function factorOf(code: string): Decimal {
  let f = FACTOR_CACHE.get(code);
  if (f) return f;
  const spec = (INFO as Map<string, UnitInfo>).get(code)?.factor ?? "1";
  const slash = spec.indexOf("/");
  f = slash < 0 ? Decimal.parse(spec) : Decimal.parse(spec.slice(0, slash)).div(Decimal.parse(spec.slice(slash + 1)));
  FACTOR_CACHE.set(code, f);
  return f;
}

/**
 * Pick the effective pair of units: an ambiguous degree word falls back to Celsius when the other side
 * is a temperature. Returns null when the categories do not match.
 */
export function resolveUnitPair(from: UnitRef, to: UnitRef): [UnitRef, UnitRef] | null {
  if (from.category === to.category) return [from, to];
  if (from.alt && from.alt.category === to.category) return [from.alt, to];
  if (to.alt && to.alt.category === from.category) return [from, to.alt];
  return null;
}

const KELVIN_OFFSET = Decimal.parse("273.15");
const THIRTY_TWO = Decimal.from(32);

function toCelsius(v: Decimal, code: string): Decimal {
  if (code === "f") return v.sub(THIRTY_TWO).mul(Decimal.from(5)).div(Decimal.from(9));
  if (code === "k") return v.sub(KELVIN_OFFSET);
  return v;
}

function fromCelsius(v: Decimal, code: string): Decimal {
  if (code === "f") return v.mul(Decimal.from(9)).div(Decimal.from(5)).add(THIRTY_TWO);
  if (code === "k") return v.add(KELVIN_OFFSET);
  return v;
}

/** Convert `value` between two units of the same category. Throws UnitError (code "units_mismatch") otherwise. */
export function convertUnit(value: Decimal, from: UnitRef, to: UnitRef): Decimal {
  if (!ALIASES) build();
  const pair = resolveUnitPair(from, to);
  if (!pair) throw new UnitError(from.code, to.code);
  const [a, b] = pair;
  if (a.code === b.code) return value;
  if (a.category === "temperature") return fromCelsius(toCelsius(value, a.code), b.code);
  return value.mul(factorOf(a.code)).div(factorOf(b.code));
}
