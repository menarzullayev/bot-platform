import { describe, expect, it } from "vitest";
import { latinToCyrillic, withoutProtected } from "../../src/i18n/translit";

// [uz-latn, uz-cyrl]
const WORDS: [string, string][] = [
  ["oʻzbek", "ўзбек"],
  ["Oʻzbekiston", "Ўзбекистон"],
  ["gʻalaba", "ғалаба"],
  ["sogʻ", "соғ"],
  ["shahar", "шаҳар"],
  ["chiroyli", "чиройли"],
  ["yoʻl", "йўл"],
  ["yoz", "ёз"],
  ["yuz", "юз"],
  ["yangi", "янги"],
  ["yetti", "етти"],
  ["eshik", "эшик"],
  ["maʼno", "маъно"],
  ["maʼlumot", "маълумот"],
  ["tez", "тез"],
  ["kalkulyator", "калкулятор"],
  ["hisoblash", "ҳисоблаш"],
  ["foiz", "фоиз"],
  ["qarz", "қарз"],
  ["xato", "хато"],
  ["jami", "жами"],
  ["oylik toʻlov", "ойлик тўлов"],
  ["tong", "тонг"],
  ["tsikl", "цикл"],
  ["operatsiya", "операция"],
  ["ketsa", "кетса"],
  ["ketsin", "кетсин"],
  ["aytsa", "айтса"],
  ["Yevro", "Евро"],
  ["poeziya", "поэзия"],
  ["mayda", "майда"],
  ["ayol", "аёл"],
  ["yoʻq", "йўқ"],
  ["yaʼni", "яъни"],
  ["SHAHAR", "ШАҲАР"],
  ["Chorshanba", "Чоршанба"],
  ["Telegram", "Telegram"],
  ["YOʻL", "ЙЎЛ"],
  ["Yoz", "Ёз"],
  ["mashhur", "машҳур"],
  ["toʻgʻri", "тўғри"],
  ["ma'no", "маъно"], // ASCII apostrophe between letters = tutuq
  ["o'zbek", "ўзбек"], // ASCII apostrophe after o = oʻ
  ["g'oya", "ғоя"],
  ["koʻproq", "кўпроқ"],
  ["Eng yaxshi", "Энг яхши"],
  ["Pro obuna", "Pro обуна"],
  ["natija", "натижа"],
  ["Qoʻshish", "Қўшиш"],
  ["funksiya", "функция"],
  ["Funksiyalar", "Функциялар"],
  ["inlayn rejim", "инлайн режим"],
  ["ksenon", "ксенон"],
];

const PROTECTED_CASES: [string, string][] = [
  ["Salom, {name}!", "Салом, {name}!"],
  ["/start ni bosing", "/start ни босинг"],
  ["<b>Sozlamalar</b>", "<b>Созламалар</b>"],
  ["Misol: <code>2+3*4 to mi</code> natija", "Мисол: <code>2+3*4 to mi</code> натижа"],
  ["50 USD dan UZS ga", "50 USD дан UZS га"],
  ["https://t.me/tezcalc_bot ga kiring", "https://t.me/tezcalc_bot га киринг"],
  ["🧮 Hisob", "🧮 Ҳисоб"],
  ["&lt;5 dan kichik", "&lt;5 дан кичик"],
  ["`2+2` ni yozing", "`2+2` ни ёзинг"],
  ["km/soat", "км/соат"],
  ["@tezcalc_bot ga yozing", "@tezcalc_bot га ёзинг"],
  ["TezCalc bilan", "TezCalc билан"],
  ["12*(3+4) = 84", "12*(3+4) = 84"],
  ["<pre>sin(30) shu</pre> shu", "<pre>sin(30) shu</pre> шу"],
  ["{count} ta {item}", "{count} та {item}"],
  ["Narxi: 30 kun, {stars} ⭐", "Нархи: 30 кун, {stars} ⭐"],
  ["QQS bilan summa", "ҚҚС билан сумма"], // Uzbek acronym, not an ISO code
  ["QQSsiz summa", "ҚҚСсиз сумма"],
  ["Masalan: 12*(3+4) yoki 100 km to mi", "Масалан: 12*(3+4) ёки 100 km to mi"], // plain-text input example stays Latin
  ["1 000 000 UZS to USD ga", "1 000 000 UZS to USD га"],
];

describe("latinToCyrillic: words", () => {
  it.each(WORDS)("%s -> %s", (latin, cyrl) => {
    expect(latinToCyrillic(latin)).toBe(cyrl);
  });
  it("has enough samples", () => {
    expect(WORDS.length + PROTECTED_CASES.length).toBeGreaterThanOrEqual(40);
  });
});

describe("latinToCyrillic: protected segments", () => {
  it.each(PROTECTED_CASES)("%s", (latin, cyrl) => {
    expect(latinToCyrillic(latin)).toBe(cyrl);
  });

  it("keeps every placeholder byte-for-byte", () => {
    const src = "Salom {name}, {pos}-oʻrin va {date} gacha";
    const out = latinToCyrillic(src);
    expect(out.match(/\{[a-z]+\}/g)).toEqual(["{name}", "{pos}", "{date}"]);
  });

  it("is idempotent on already converted text", () => {
    const once = latinToCyrillic("Oʻzbek tili <b>muhim</b> {name}");
    expect(latinToCyrillic(once)).toBe(once);
  });

  it("keeps product names Latin (Pro, Stars, Telegram, Mini App) incl. suffixes", () => {
    expect(latinToCyrillic("Telegram Stars bilan")).toBe("Telegram Stars билан");
    expect(latinToCyrillic("Mening Starslarim")).toBe("Менинг Starslarim");
    expect(latinToCyrillic("Mini App ochish")).toBe("Mini App очиш");
    expect(latinToCyrillic("Programma")).toBe("Программа");
  });

  it("is a pure function (same output on repeated calls)", () => {
    const a = latinToCyrillic("yoʻl yoz oʻzbek");
    expect(latinToCyrillic("yoʻl yoz oʻzbek")).toBe(a);
  });

  it("withoutProtected strips code, tags, placeholders and codes", () => {
    const rest = withoutProtected("<b>x</b> <code>sin(30)</code> {name} /help USD @tezcalc_bot TezCalc &lt;");
    expect(rest).not.toMatch(/[A-Za-z]{2,}/);
  });
});
