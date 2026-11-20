import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DICTIONARIES, LANGS, MESSAGE_KEYS } from "../../src/i18n";
import catalogKeys from "../../../miniapp/src/catalog-keys.json";
import { MS, MS_KEYS, ms, placeholdersOf } from "../../../miniapp/src/strings";
import { isMsKey, plainText, tr } from "../../../miniapp/src/i18n";
import { categories } from "../../../miniapp/src/lib/convert";
import { TOOLS, TOOL_IDS, computeTool, defaultsOf } from "../../../miniapp/src/lib/finance";

const SRC = fileURLToPath(new URL("../../../miniapp/src", import.meta.url).href);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("Mini App strings: seven languages", () => {
  it("every key exists and is a non-empty plain string in all 7 languages", () => {
    for (const lang of LANGS) {
      expect(Object.keys(MS[lang]).sort(), lang).toEqual([...MS_KEYS].sort());
      for (const k of MS_KEYS) {
        const v = MS[lang][k];
        expect(typeof v, `${lang}.${k}`).toBe("string");
        expect(v.trim().length, `${lang}.${k}`).toBeGreaterThan(0);
        expect(v, `${lang}.${k} contains markup`).not.toMatch(/<[a-z/][^>]*>/i);
      }
    }
  });

  it("placeholders are identical in every language", () => {
    for (const k of MS_KEYS) {
      const want = placeholdersOf(MS.en[k]);
      for (const lang of LANGS) expect(placeholdersOf(MS[lang][k]), `${lang}.${k}`).toEqual(want);
    }
  });

  it("no language silently falls back to English text", () => {
    const allowedSame = new Set(["pro_badge", "conv_rate_line", "graph_fx_ph", "solve_integral", "nav_graph", "fin_vat", "r_vat"]);
    for (const lang of ["uz-latn", "ru", "tr", "ar", "es"] as const) {
      let same = 0;
      for (const k of MS_KEYS) if (MS[lang][k] === MS.en[k] && !allowedSame.has(k)) same++;
      expect(same, `${lang}: strings identical to English`).toBeLessThan(MS_KEYS.length * 0.08);
    }
  });

  it("scripts match the language: Cyrillic for ru/uz-cyrl, Arabic for ar", () => {
    const cyr = /[Ѐ-ӿ]/;
    const arab = /[؀-ۿ]/;
    const code = new Set(["pro_badge", "conv_rate_line", "graph_fx_ph"]);
    for (const k of MS_KEYS) {
      if (code.has(k)) continue;
      expect(cyr.test(MS.ru[k]), `ru.${k}`).toBe(true);
      expect(cyr.test(MS["uz-cyrl"][k]), `uz-cyrl.${k}`).toBe(true);
      expect(arab.test(MS.ar[k]), `ar.${k}`).toBe(true);
      expect(arab.test(MS.en[k]) || cyr.test(MS.en[k]), `en.${k}`).toBe(false);
    }
  });

  it("uz-cyrl is derived from uz-latn (no stray Latin words)", () => {
    for (const k of MS_KEYS) {
      const stripped = MS["uz-cyrl"][k].replace(/\{[a-z_]+\}/gi, "").replace(/\b[A-Z]{2,4}\b/g, "").replace(/\bPro\b|\bf\(x\)|\bx\b|\bsin\b|\bTezCalc\b/g, "");
      expect(stripped, `uz-cyrl.${k}`).not.toMatch(/[a-z]{3,}/i);
    }
  });

  it("navigation labels are short enough for a six-tab bar", () => {
    for (const lang of LANGS) {
      for (const k of ["nav_calc", "nav_convert", "nav_graph", "nav_solve", "nav_finance", "nav_settings"] as const) {
        expect(MS[lang][k].length, `${lang}.${k}`).toBeLessThanOrEqual(11);
      }
    }
  });

  it("ms() fills placeholders and falls back to English for an unknown language", () => {
    expect(ms("en", "pro_upgrade", { stars: 99 })).toContain("99");
    expect(ms("ru", "calc_history_count", { n: 3, max: 20 })).toBe("Хранится 3 из 20");
    expect(ms("xx" as never, "nav_calc")).toBe("Calc");
  });

  it("every dynamically built key resolves (categories, solve modes, finance fields and rows)", () => {
    for (const c of categories()) expect(isMsKey(`cat_${c}`), `cat_${c}`).toBe(true);
    for (const m of ["derivative", "integral", "equation", "system", "arith"]) expect(isMsKey(`solve_${m}`), m).toBe(true);
    const known = (k: string): boolean => isMsKey(k) || (catalogKeys as string[]).includes(k);
    for (const id of TOOL_IDS) {
      expect(isMsKey(TOOLS[id].title), TOOLS[id].title).toBe(true);
      for (const f of TOOLS[id].fields) {
        expect(isMsKey(f.label), f.label).toBe(true);
        for (const [, label] of f.options ?? []) expect(isMsKey(label), label).toBe(true);
      }
      const r = computeTool(id, defaultsOf(id), "en");
      if (r.ok) for (const row of r.rows) expect(known(row.label), row.label).toBe(true);
    }
    for (const k of ["r_col_month", "r_col_payment", "r_col_principal", "r_col_interest", "r_col_balance", "r_schedule", "fin_bad_input"]) expect(isMsKey(k)).toBe(true);
  });

  it("Mini App keys never shadow catalog keys", () => {
    const catalog = new Set<string>(MESSAGE_KEYS);
    for (const k of MS_KEYS) expect(catalog.has(k), k).toBe(false);
  });
});

describe("catalog keys reused from the bot's i18n", () => {
  it("every whitelisted key exists in every language of the catalog", () => {
    const valid = new Set<string>(MESSAGE_KEYS);
    for (const k of catalogKeys as string[]) {
      expect(valid.has(k), k).toBe(true);
      for (const lang of LANGS) expect(DICTIONARIES[lang][k as keyof (typeof DICTIONARIES)["en"]], `${lang}.${k}`).toBeTruthy();
    }
    expect(new Set(catalogKeys).size).toBe((catalogKeys as string[]).length);
  });

  it("source code uses only whitelisted catalog keys (the bundle contains nothing else)", () => {
    const whitelist = new Set(catalogKeys as string[]);
    const catalog = new Set<string>(MESSAGE_KEYS);
    const used = new Set<string>();
    for (const file of walk(SRC).filter((f) => /\.ts$/.test(f) && !/strings\.ts$/.test(f))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/["']([a-z][a-z0-9]*(?:_[a-z0-9]+)+)["']/g)) if (catalog.has(m[1])) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(10);
    for (const k of used) expect(whitelist.has(k), `catalog key "${k}" is used but missing from catalog-keys.json`).toBe(true);
  });

  it("tr() strips Telegram HTML and substitutes parameters", () => {
    expect(tr("en", "pro_price", { stars: 150 })).toContain("150");
    expect(tr("en", "pro_price", { stars: 150 })).not.toMatch(/<[^>]+>/);
    expect(tr("ru", "err_syntax", { pos: 3 })).toContain("3");
    expect(plainText("<b>a</b> &lt;b&gt; &amp; <code>x</code>")).toBe("a <b> & x");
    expect(tr("en", "nav_calc")).toBe("Calc");
  });
});
