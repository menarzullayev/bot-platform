import { describe, expect, it } from "vitest";
import { LANGS as ENV_LANGS } from "../../src/env";
import {
  COMMAND_NAMES,
  DICTIONARIES,
  LANGS,
  LIMITS,
  MESSAGE_KEYS,
  PLACEHOLDERS,
  PLAIN_KEYS,
  commandsFor,
  detectLang,
  isLang,
  isRtl,
  profileFor,
  t,
  telegramLanguageCode,
  wrapForRtl,
  type Lang,
  type MessageKey,
} from "../../src/i18n";
import { en } from "../../src/i18n/en";
import { withoutProtected } from "../../src/i18n/translit";
import { uzLatn } from "../../src/i18n/uz-latn";

const placeholdersOf = (s: string): string[] => [...new Set(s.match(/\{[A-Za-z_][A-Za-z0-9_]*\}/g) ?? [])].sort();
const entries = (lang: Lang): [MessageKey, string][] => MESSAGE_KEYS.map((k) => [k, DICTIONARIES[lang][k]]);

describe("language list", () => {
  it("matches src/env.ts", () => {
    expect([...LANGS]).toEqual([...ENV_LANGS]);
    expect(LANGS).toHaveLength(7);
  });
  it("has a dictionary for every language", () => {
    for (const l of LANGS) expect(DICTIONARIES[l]).toBeTruthy();
  });
});

describe.each(LANGS)("dictionary %s", (lang) => {
  it("has every key, no extras, no empty values", () => {
    const d = DICTIONARIES[lang] as Record<string, string>;
    expect(Object.keys(d).sort()).toEqual([...MESSAGE_KEYS].sort());
    for (const [k, v] of entries(lang)) {
      expect(typeof v, k).toBe("string");
      expect(v.trim().length, k).toBeGreaterThan(0);
      expect(v, k).not.toMatch(/TODO|undefined|\[object/);
    }
  });

  it("has the same placeholder set as English for every key", () => {
    for (const k of MESSAGE_KEYS) {
      expect(placeholdersOf(DICTIONARIES[lang][k]), `${lang}.${k}`).toEqual(placeholdersOf(en[k]));
    }
  });

  it("declares exactly the documented placeholders", () => {
    for (const k of MESSAGE_KEYS) {
      expect(placeholdersOf(DICTIONARIES[lang][k]), `${lang}.${k}`).toEqual((PLACEHOLDERS[k] ?? []).map((p) => `{${p}}`).sort());
    }
  });

  it("uses balanced, allowed HTML and no stray < > &", () => {
    const allowed = new Set(["b", "i", "u", "s", "code", "pre", "a", "blockquote"]);
    for (const [k, v] of entries(lang)) {
      const stack: string[] = [];
      for (const m of v.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g)) {
        const name = m[2].toLowerCase();
        expect(allowed.has(name), `${lang}.${k} tag <${name}>`).toBe(true);
        if (m[1]) expect(stack.pop(), `${lang}.${k} closing </${name}>`).toBe(name);
        else stack.push(name);
      }
      expect(stack, `${lang}.${k} unclosed`).toEqual([]);
      const text = v.replace(/<\/?[a-zA-Z][^>]*>/g, "");
      expect(text, `${lang}.${k} raw < or >`).not.toMatch(/[<>]/);
      expect(text.replace(/&(?:lt|gt|amp|quot|#\d+);/g, ""), `${lang}.${k} raw &`).not.toMatch(/&/);
    }
  });

  it("keeps plain-text keys free of HTML", () => {
    for (const k of PLAIN_KEYS) {
      const v = DICTIONARIES[lang][k];
      // settings-style rows may carry <code>; the plain keys must not
      expect(v, `${lang}.${k}`).not.toMatch(/[<>&]/);
    }
  });

  it("respects Telegram length limits", () => {
    for (const [k, v] of entries(lang)) {
      expect(v.length, `${lang}.${k}`).toBeLessThanOrEqual(LIMITS.message);
    }
    const d = DICTIONARIES[lang];
    expect(d.bot_name.length).toBeLessThanOrEqual(LIMITS.botName);
    expect(d.bot_short_description.length).toBeLessThanOrEqual(LIMITS.shortDescription);
    expect(d.bot_description.length).toBeLessThanOrEqual(LIMITS.description);
    for (const c of COMMAND_NAMES) {
      const len = d[`cmd_${c}` as MessageKey].length;
      expect(len, `${lang}.cmd_${c}`).toBeGreaterThanOrEqual(3);
      expect(len, `${lang}.cmd_${c}`).toBeLessThanOrEqual(LIMITS.commandDescription);
    }
    expect(d.btn_back.length).toBeLessThanOrEqual(LIMITS.button);
    expect(d.inline_help_title.length).toBeLessThanOrEqual(64);
  });

  it("mentions the bot and the key commands in help", () => {
    const h = DICTIONARIES[lang].help;
    for (const needle of ["@tezcalc_bot", "/convert", "/loan", "/settings", "/pro"]) expect(h).toContain(needle);
  });

  it("points to /deleteme in privacy and /paysupport in terms", () => {
    expect(DICTIONARIES[lang].privacy).toContain("/deleteme");
    expect(DICTIONARIES[lang].terms).toContain("/paysupport");
  });
});

describe("script checks", () => {
  it("uz-latn has no Cyrillic", () => {
    for (const [k, v] of Object.entries(uzLatn)) expect(v, k).not.toMatch(/[Ѐ-ӿ]/);
  });

  it("uz-cyrl has no Latin letters or apostrophe marks left outside protected segments", () => {
    for (const [k, v] of entries("uz-cyrl")) {
      const rest = withoutProtected(v);
      expect(rest, `uz-cyrl.${k}`).not.toMatch(/[A-Za-z]/);
      expect(rest, `uz-cyrl.${k}`).not.toMatch(/[ʻʼ‘’'`]/);
    }
  });

  it("uz-cyrl differs from uz-latn only in words (commands, code and placeholders identical)", () => {
    const grab = (s: string) => [...s.matchAll(/<code>[\s\S]*?<\/code>|\{[a-z]+\}|\/[a-z]{3,}/g)].map((m) => m[0]);
    for (const k of MESSAGE_KEYS) expect(grab(DICTIONARIES["uz-cyrl"][k]), k).toEqual(grab(uzLatn[k]));
  });

  it("uz-cyrl is generated: user-facing text really is Cyrillic", () => {
    for (const k of ["start", "help", "privacy", "terms", "bot_description"] as const) {
      expect(DICTIONARIES["uz-cyrl"][k]).toMatch(/[Ѐ-ӿ]{4,}/);
    }
    expect(DICTIONARIES["uz-cyrl"].lang_menu_title).toBe("🌐 Тилни танланг");
    expect(DICTIONARIES["uz-cyrl"].btn_back).toBe("↩️ Орқага");
  });

  it("ru is Cyrillic, ar is Arabic script, others are Latin", () => {
    expect(DICTIONARIES.ru.help).toMatch(/[Ѐ-ӿ]{4,}/);
    expect(DICTIONARIES.ar.help).toMatch(/[؀-ۿ]{4,}/);
    for (const l of ["en", "tr", "es", "uz-latn"] as const) {
      expect(DICTIONARIES[l].help).not.toMatch(/[Ѐ-ӿ؀-ۿ]/);
    }
  });
});

describe("RTL", () => {
  it("isRtl is true only for Arabic", () => {
    for (const l of LANGS) expect(isRtl(l), l).toBe(l === "ar");
  });
  it("wrapForRtl isolates math in Arabic with LRI..PDI", () => {
    expect(wrapForRtl("ar", "2+3*4")).toBe("⁦2+3*4⁩");
  });
  it("wrapForRtl is idempotent and ignores empty input", () => {
    const once = wrapForRtl("ar", "x^2");
    expect(wrapForRtl("ar", once)).toBe(once);
    expect(wrapForRtl("ar", "")).toBe("");
  });
  it("wrapForRtl leaves LTR languages untouched", () => {
    for (const l of LANGS.filter((x) => x !== "ar")) expect(wrapForRtl(l, "2+3*4")).toBe("2+3*4");
  });
  it("Arabic help isolates its code samples", () => {
    expect(DICTIONARIES.ar.help).toContain("⁦<code>2+3*4</code>⁩");
  });
});

describe("detectLang", () => {
  const table: [string | undefined | null, Lang][] = [
    ["uz", "uz-latn"],
    ["UZ", "uz-latn"],
    ["uz-UZ", "uz-latn"],
    ["uz_UZ", "uz-latn"],
    ["uz-Latn", "uz-latn"],
    ["uz-Latn-UZ", "uz-latn"],
    ["uz-Cyrl", "uz-cyrl"],
    ["uz-cyrl-uz", "uz-cyrl"],
    ["uz_Cyrl", "uz-cyrl"],
    ["ru", "ru"],
    ["ru-RU", "ru"],
    ["en", "en"],
    ["en-US", "en"],
    ["en-GB", "en"],
    ["tr", "tr"],
    ["tr-TR", "tr"],
    ["ar", "ar"],
    ["ar-SA", "ar"],
    ["es", "es"],
    ["es-419", "es"],
    ["es-MX", "es"],
    ["de", "en"],
    ["pt-BR", "en"],
    ["zh-hans", "en"],
    ["kk", "en"],
    ["", "en"],
    [undefined, "en"],
    [null, "en"],
    ["   ", "en"],
    ["-", "en"],
    ["uzbek", "en"],
  ];
  it.each(table)("%s -> %s", (code, expected) => {
    expect(detectLang(code)).toBe(expected);
  });
  it("uses the given fallback for unsupported codes", () => {
    expect(detectLang("de", "uz-latn")).toBe("uz-latn");
    expect(detectLang(undefined, "ru")).toBe("ru");
    expect(detectLang("tr", "ru")).toBe("tr");
  });
  it("isLang validates", () => {
    expect(isLang("uz-cyrl")).toBe(true);
    expect(isLang("de")).toBe(false);
    expect(isLang(undefined)).toBe(false);
  });
});

describe("t()", () => {
  it("returns the localized text", () => {
    expect(t("ru", "btn_back")).toBe(DICTIONARIES.ru.btn_back);
    expect(t("en", "btn_back")).toBe("↩️ Back");
  });
  it("substitutes placeholders", () => {
    expect(t("en", "start", { name: "Ali" })).toContain("Hi, Ali!");
    expect(t("uz-latn", "pro_active", { date: "2026-12-01" })).toContain("2026-12-01");
    expect(t("en", "pro_price", { stars: 99 })).toContain("99 ⭐");
  });
  it("replaces every occurrence and leaves unknown placeholders", () => {
    expect(t("en", "err_syntax", { pos: 7 })).toContain("position 7");
    expect(t("en", "err_syntax")).toContain("{pos}");
    expect(t("en", "err_syntax", {})).toContain("{pos}");
  });
  it("inserts values verbatim (no $-pattern expansion)", () => {
    expect(t("en", "err_unknown", { name: "$& $1 $$" })).toContain("“$& $1 $$”");
  });
  it("falls back to English when a language lacks the key", () => {
    const d = DICTIONARIES.tr as Record<string, string>;
    const saved = d.err_div0;
    delete d.err_div0;
    try {
      expect(t("tr", "err_div0")).toBe(en.err_div0);
    } finally {
      d.err_div0 = saved;
    }
  });
  it("returns the key for an unknown key and falls back for an unknown language", () => {
    expect(t("en", "nope" as MessageKey)).toBe("nope");
    expect(t("xx" as Lang, "btn_back")).toBe(en.btn_back);
  });
});

describe("Telegram registration helpers", () => {
  it("commandsFor lists every command with a description", () => {
    for (const l of LANGS) {
      const list = commandsFor(l);
      expect(list.map((c) => c.command)).toEqual([...COMMAND_NAMES]);
      for (const c of list) {
        expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/);
        expect(c.description.length).toBeGreaterThanOrEqual(3);
        expect(c.description.length).toBeLessThanOrEqual(256);
      }
    }
    expect(commandsFor("de" as Lang).length).toBe(COMMAND_NAMES.length);
  });
  it("profileFor returns the bot texts", () => {
    for (const l of LANGS) {
      const p = profileFor(l);
      expect(p.name).toBe(DICTIONARIES[l].bot_name);
      expect(p.shortDescription.length).toBeLessThanOrEqual(120);
      expect(p.description.length).toBeLessThanOrEqual(512);
    }
  });
  it("telegramLanguageCode: uz-latn -> uz, uz-cyrl -> none, others identity", () => {
    expect(telegramLanguageCode("uz-latn")).toBe("uz");
    expect(telegramLanguageCode("uz-cyrl")).toBeNull();
    for (const l of ["ru", "en", "tr", "ar", "es"] as const) expect(telegramLanguageCode(l)).toBe(l);
  });
  it("every registered language code is unique", () => {
    const codes = LANGS.map(telegramLanguageCode).filter((c): c is string => c !== null);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
