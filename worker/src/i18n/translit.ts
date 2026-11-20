// Deterministic Uzbek Latin (1995 alphabet) -> Cyrillic transliteration.
// Only words are converted. Placeholders, /commands, URLs, @mentions, emoji, digits, math, currency codes,
// HTML tags/entities, <code>/<pre> bodies and `backtick` code are copied unchanged.

const APOSTROPHES = "ʻʼ‘’'`";
const TUTUQ = "ʼ"; // U+02BC: always the tutuq belgisi (ъ), even after o/g

// Segments that must survive untouched. Order matters: earlier alternatives win at the same position.
const PROTECTED = new RegExp(
  [
    "<(?:code|pre)\\b[^>]*>[\\s\\S]*?<\\/(?:code|pre)>", // code bodies
    "<\\/?[a-zA-Z][^>]*>", // other HTML tags
    "&(?:[a-zA-Z]+|#\\d+|#x[0-9a-fA-F]+);", // HTML entities
    "\\{[A-Za-z_][A-Za-z0-9_]*\\}", // {placeholders}
    "https?:\\/\\/[^\\s<)]+", // URLs
    "(?<![A-Za-z0-9_])t\\.me\\/[^\\s<)]+",
    "(?<![A-Za-z0-9_])@[A-Za-z0-9_]{3,}", // @mentions
    "(?<![A-Za-z0-9_\\/])\\/[a-z][a-z_]*", // /commands (not "km/soat")
    "`[^`]*`", // backtick code
    "\\d[\\d\\s.,]*\\s?[A-Za-z]{1,6}\\s+(?:to|in)\\s+[A-Za-z]{1,6}\\b", // calculator input examples in plain text: 100 km to mi
    "\\b[A-Z]{3}\\b", // currency / ISO codes: USD, UZS, EUR (QQS is Uzbek, see ACRONYMS)
    "TezCalc", // brand stays Latin
    "\\bPro\\b|\\bStars?[a-z]*|\\bTelegram[a-z]*|\\bMini App\\b", // product names stay Latin (decision 2026-11-20)
  ].join("|"),
  "g",
);

const MAP: Record<string, string> = {
  a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л", m: "м",
  n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "х", y: "й", z: "з",
};

// Uzbek acronyms that look like ISO codes but must be written in Cyrillic (QQS -> ҚҚС, VAT).
const ACRONYMS: Record<string, string> = { QQS: "ҚҚС" };

const isLatin = (c: string | undefined): boolean => c !== undefined && /^[A-Za-z]$/.test(c);
const isApos = (c: string | undefined): boolean => c !== undefined && c.length === 1 && APOSTROPHES.includes(c);
/** o' / g' mark (any apostrophe variant except the explicit tutuq). */
const isOMark = (c: string | undefined): boolean => isApos(c) && c !== TUTUQ;

// "ts" is ц only at the start of a word or in these loanword endings; elsewhere it is т+с (ket+sa, ayt+sa).
const TS_LOAN = /^(iy|ion|ent|irk|ikl)/i;

function plain(s: string): string {
  let out = "";
  let prevLetter = false;
  let prevVowel = false;
  let i = 0;
  const put = (cyr: string, upper: boolean, vowel: boolean): void => {
    out += upper ? cyr.toUpperCase() : cyr;
    prevLetter = true;
    prevVowel = vowel;
  };
  while (i < s.length) {
    const c = s[i];
    const lc = c.toLowerCase();
    const up = c !== lc;
    const next = s[i + 1];
    const nl = next?.toLowerCase();

    if (isApos(c)) {
      if (prevLetter && (c === TUTUQ || isLatin(next))) {
        out += "ъ";
        prevVowel = false;
      } else {
        out += c;
        prevLetter = false;
        prevVowel = false;
      }
      i++;
      continue;
    }
    if (!isLatin(c)) {
      out += c;
      prevLetter = false;
      prevVowel = false;
      i++;
      continue;
    }
    const wordStart = !prevLetter;

    if ((lc === "o" || lc === "g") && isOMark(next)) {
      put(lc === "o" ? "ў" : "ғ", up, lc === "o");
      i += 2;
      continue;
    }
    if (lc === "s" && nl === "h") {
      put("ш", up, false);
      i += 2;
      continue;
    }
    if (lc === "c" && nl === "h") {
      put("ч", up, false);
      i += 2;
      continue;
    }
    if (lc === "k" && nl === "s" && /^iy/i.test(s.slice(i + 2, i + 4))) {
      put("к", up, false); // funksiya -> функция: "ks" before "iy" stands for кц
      out += "ц";
      i += 2;
      continue;
    }
    if (lc === "t" && nl === "s" && (wordStart || TS_LOAN.test(s.slice(i + 2, i + 6)))) {
      put("ц", up, false);
      i += 2;
      continue;
    }
    if (lc === "y") {
      if (nl === "o" && isOMark(s[i + 2])) {
        put("й", up, false); // yoʻq -> йўқ: the "o'" is handled on the next turn
        i++;
        continue;
      }
      if (nl === "o") {
        put("ё", up, true);
        i += 2;
        continue;
      }
      if (nl === "u") {
        put("ю", up, true);
        i += 2;
        continue;
      }
      if (nl === "a") {
        put("я", up, true);
        i += 2;
        continue;
      }
      if (nl === "e") {
        if (wordStart || prevVowel) put("е", up, true);
        else {
          out += up ? "Й" : "й";
          put("е", false, true);
        }
        i += 2;
        continue;
      }
      put("й", up, false);
      i++;
      continue;
    }
    if (lc === "e") {
      put(wordStart || prevVowel ? "э" : "е", up, true);
      i++;
      continue;
    }
    put(MAP[lc], up, "aiou".includes(lc));
    i++;
  }
  return out;
}

/** Transliterate Uzbek Latin text to Cyrillic, leaving non-word segments untouched. */
export function latinToCyrillic(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(PROTECTED)) {
    const at = m.index ?? 0;
    out += plain(text.slice(last, at)) + (ACRONYMS[m[0]] ?? m[0]);
    last = at + m[0].length;
  }
  return out + plain(text.slice(last));
}

/** The text with all protected segments removed (used by tests to find Latin letters that should have been converted). */
export function withoutProtected(text: string): string {
  return text.replace(PROTECTED, " ");
}

/** Transliterate every value of a dictionary. */
export function transliterateMessages<T extends Record<string, string>>(dict: T): T {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(dict)) out[k] = latinToCyrillic(v);
  return out as T;
}
