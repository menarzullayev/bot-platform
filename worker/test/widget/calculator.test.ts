import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { LANGS, type Lang } from "../../src/env";
import { buildCalculatorWidget } from "../../src/widget/calculator";
import { INNER_KEYS, WIDGET_LABELS } from "../../src/widget/labels";
import { WIDGET_SEND_PREFIX, parseWidgetSendData, widgetSendParams } from "../../src/widget/send";

const HTML_MAX = 30000; // spec: <= 30000 (API limit 32768)
const ZLIB_MAX = 3800; // spec: <= 3800 (API limit 4096, node zlib may differ by a few dozen bytes)

const zlibSize = (s: string) => deflateSync(Buffer.from(s, "utf8"), { level: 9 }).length;

describe("size limits, every language", () => {
  for (const lang of LANGS) {
    it(`${lang}: html <= ${HTML_MAX} bytes, zlib <= ${ZLIB_MAX} bytes, no NUL, valid UTF-8`, () => {
      const html = buildCalculatorWidget(lang);
      const bytes = Buffer.byteLength(html, "utf8");
      const z = zlibSize(html);
      console.log(`widget size ${lang}: ${bytes} bytes, zlib ${z} bytes`);
      expect(bytes).toBeGreaterThan(0);
      expect(bytes).toBeLessThanOrEqual(HTML_MAX);
      expect(z).toBeLessThanOrEqual(ZLIB_MAX);
      expect(html.includes("\u0000")).toBe(false);
      expect(Buffer.from(html, "utf8").toString("utf8")).toBe(html); // no lone surrogates
    });
  }
});

describe("no network or out-of-profile features", () => {
  for (const lang of LANGS) {
    const html = buildCalculatorWidget(lang);
    it(`${lang}: no network / dynamic code identifiers`, () => {
      expect(html).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|Worker|eval)\b/);
      expect(html).not.toMatch(/\bimport\b|new\s+Function|https?:\/\/|@import|url\(/i);
      expect(html).not.toMatch(/navigator\.clipboard|window\.open|\blocation\b/);
    });
    it(`${lang}: nothing outside widget profile 1 (forms, vh, focus, keyboard, fonts, overflow scroll)`, () => {
      expect(html).not.toMatch(/<(input|select|textarea|form|label|progress|meter|iframe|img|video|audio|link|meta)\b/i);
      expect(html).not.toMatch(/\d\s*(vh|dvh|svh)\b|:focus|text-shadow|@font-face|overflow\s*:\s*(auto|scroll)|position\s*:\s*sticky/);
      expect(html).not.toMatch(/keydown|keyup|keypress|touchstart|tabindex|contenteditable|draggable|autofocus/);
      expect(html).not.toMatch(/font-family/);
    });
    it(`${lang}: colours only from Telegram theme variables`, () => {
      const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
      expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
      expect(css).toContain("--tg-theme-bg-color".replace("bg", "secondary-bg"));
      expect(css).toContain("--tg-theme-button-color");
    });
  }

  it("production sources contain no eval / new Function", () => {
    const dir = join(__dirname, "../../src/widget");
    for (const f of readdirSync(dir)) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/\beval\s*\(|new\s+Function/);
      expect(text, f).not.toMatch(/\bfetch\s*\(/);
    }
  });
});

describe("valid HTML", () => {
  const VOID = new Set(["br", "hr", "img", "input", "meta", "link"]);
  for (const lang of LANGS) {
    it(`${lang}: tags are balanced, ids unique, script and style present once`, () => {
      const html = buildCalculatorWidget(lang);
      expect(html.match(/<style>/g)).toHaveLength(1);
      expect(html.match(/<script>/g)).toHaveLength(1);
      expect(html.match(/<\/script>/g)).toHaveLength(1);
      // script body must not contain a premature closing tag
      const script = /<script>([\s\S]*)<\/script>/.exec(html)![1];
      expect(script).not.toMatch(/<\/script|<!--/i);
      const markup = html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<script>[\s\S]*?<\/script>/, "");
      const stack: string[] = [];
      for (const m of markup.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi)) {
        const name = m[2].toLowerCase();
        if (VOID.has(name)) continue;
        if (m[1]) {
          expect(stack.pop(), `closing </${name}>`).toBe(name);
        } else stack.push(name);
      }
      expect(stack).toEqual([]);
      const ids = [...markup.matchAll(/\bid=([a-z0-9]+)/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ["cb", "sb", "h0", "h1", "e", "r", "a", "b"]) expect(ids).toContain(id);
    });
    it(`${lang}: script parses`, () => {
      const script = /<script>([\s\S]*)<\/script>/.exec(buildCalculatorWidget(lang))![1];
      expect(() => new Function(script)).not.toThrow(); // test-only compile, never executed here
    });
  }
});

describe("labels per language", () => {
  it("all 7 languages have every key, non-empty", () => {
    expect(Object.keys(WIDGET_LABELS).sort()).toEqual([...LANGS].sort());
    for (const lang of LANGS) {
      for (const key of [...INNER_KEYS, "caption"] as const) {
        expect(WIDGET_LABELS[lang][key].trim().length, `${lang}.${key}`).toBeGreaterThan(0);
      }
      expect(WIDGET_LABELS[lang].a.split("|")).toHaveLength(6);
      expect(WIDGET_LABELS[lang].caption.length).toBeLessThanOrEqual(1024);
    }
  });

  it("the widget HTML embeds its own language strings and not another language's", () => {
    for (const lang of LANGS) {
      const html = buildCalculatorWidget(lang);
      for (const key of INNER_KEYS) expect(html, `${lang}.${key}`).toContain(JSON.stringify(WIDGET_LABELS[lang][key]));
      expect(html).toContain(`>${WIDGET_LABELS[lang].c}</button>`); // static copy button text
    }
    const distinct = new Set(LANGS.map((l) => buildCalculatorWidget(l)));
    expect(distinct.size).toBe(LANGS.length);
    // the English error text must not leak into the Russian build, and vice versa
    expect(buildCalculatorWidget("ru")).not.toContain("Division by 0");
    expect(buildCalculatorWidget("en")).not.toContain("Деление");
  });

  it("scripts match the language: uz-cyrl / ru Cyrillic, ar Arabic, tr/es/uz-latn Latin", () => {
    const cyr = /[Ѐ-ӿ]/;
    const arab = /[؀-ۿ]/;
    for (const key of ["t", "c", "z", "s", "m", "b", "cd"] as const) {
      expect(WIDGET_LABELS["uz-cyrl"][key]).toMatch(cyr);
      expect(WIDGET_LABELS.ru[key]).toMatch(cyr);
      expect(WIDGET_LABELS.ar[key]).toMatch(arab);
      for (const l of ["uz-latn", "en", "tr", "es"] as Lang[]) expect(WIDGET_LABELS[l][key]).not.toMatch(cyr);
    }
    expect(WIDGET_LABELS["uz-cyrl"].z).toMatch(/[ўқғҳ]/); // Uzbek-specific letters, not plain Russian
  });

  it("arabic: dir=rtl on the root, every math element stays dir=ltr, Western digits only", () => {
    const html = buildCalculatorWidget("ar");
    expect(html).toMatch(/<div lang=ar dir=rtl>/);
    for (const id of ["h0", "h1", "e", "r", "a", "b"]) expect(html).toMatch(new RegExp(`id=${id} dir=ltr`));
    expect(html).not.toMatch(/[٠-٩۰-۹]/);
    for (const lang of LANGS.filter((l) => l !== "ar")) expect(buildCalculatorWidget(lang)).toMatch(/<div lang=[\w-]+ dir=ltr>/);
  });
});

// ---------- run the widget script against a tiny fake DOM ----------

class El {
  id = "";
  className = "";
  dir = "";
  onclick: (() => void) | null = null;
  children: El[] = [];
  attrs: Record<string, string> = {};
  orig: string | undefined;
  private t = "";
  get textContent() {
    return this.t;
  }
  set textContent(v: string) {
    if (this.orig === undefined) this.orig = v;
    this.t = v;
  }
  appendChild(c: El) {
    this.children.push(c);
    return c;
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
}

function boot(lang: Lang, store: Record<string, string> = {}, tw: "ok" | "none" = "ok") {
  const html = buildCalculatorWidget(lang);
  const script = /<script>([\s\S]*)<\/script>/.exec(html)![1];
  const els = new Map<string, El>();
  const buttons: El[] = [];
  const doc = {
    getElementById(id: string) {
      if (!els.has(id)) {
        const e = new El();
        e.id = id;
        els.set(id, e);
      }
      return els.get(id)!;
    },
    createElement() {
      const e = new El();
      buttons.push(e);
      return e;
    },
  };
  const copied: string[] = [];
  const requests: string[] = [];
  const timers: Array<() => void> = [];
  const win: { TelegramWidget?: unknown } = {};
  if (tw === "ok") {
    win.TelegramWidget = {
      copyText: (t: string) => void copied.push(t),
      request: (d: string) => {
        requests.push(d);
        return Promise.resolve({ result: null });
      },
      ready: () => undefined,
      HapticFeedback: { selectionChanged: () => undefined },
    };
  }
  const ls = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => void (store[k] = v),
  };
  new Function("window", "document", "localStorage", "setTimeout", script)(win, doc, ls, (f: () => void) => void timers.push(f));
  const get = (id: string) => doc.getElementById(id);
  const press = (...keys: string[]) => {
    for (const k of keys) {
      const b = buttons.find((x) => x.orig === k);
      if (!b) throw new Error("no key " + k);
      b.onclick!();
    }
  };
  const type = (s: string) => press(...[...s].map((c) => c));
  return { get, press, type, copied, requests, timers, store, buttons, doc };
}

describe("widget UI behaviour (fake DOM)", () => {
  it("builds 35 keys: 15 scientific + 20 main, each with a click handler", () => {
    const w = boot("en");
    expect(w.buttons).toHaveLength(35);
    expect(w.get("a").children).toHaveLength(15);
    expect(w.get("b").children).toHaveLength(20);
    expect(w.buttons.every((b) => typeof b.onclick === "function")).toBe(true);
    expect(w.get("e").textContent).toBe("0");
    expect(w.get("h1").textContent).toBe(WIDGET_LABELS.en.t);
  });

  it("1+2 shows a live preview, = commits it and writes history", () => {
    const w = boot("en");
    w.type("1+2");
    expect(w.get("e").textContent).toBe("1+2");
    expect(w.get("r").textContent).toBe("3");
    expect(w.get("r").className).toBe("");
    w.press("=");
    expect(w.get("r").textContent).toBe("3");
    expect(w.get("r").className).toBe("d");
    expect(w.get("h1").textContent).toBe("1+2=3");
  });

  it("0.1+0.2 = 0.3 and 200+15% = 230", () => {
    const w = boot("en");
    w.type("0.1+0.2");
    w.press("=");
    expect(w.get("r").textContent).toBe("0.3");
    w.press("AC");
    w.type("200+15");
    w.press("%", "=");
    expect(w.get("r").textContent).toBe("230");
  });

  it("an error shows the language-specific text; AC clears it", () => {
    for (const lang of LANGS) {
      const w = boot(lang);
      w.type("1");
      w.press("÷");
      w.type("0");
      w.press("=");
      expect(w.get("r").textContent).toBe(WIDGET_LABELS[lang].z);
      expect(w.get("r").className).toBe("x");
      w.press("AC");
      expect(w.get("r").textContent).toBe("");
      expect(w.get("e").textContent).toBe("0");
      w.type("1");
      w.press("+", "=");
      expect(w.get("r").textContent).toBe(WIDGET_LABELS[lang].s);
    }
  });

  it("DEG is the default; the DEG/RAD toggle changes the label and the result of sin(30)", () => {
    const w = boot("ru");
    const dg = w.buttons.find((b) => b.orig === "DG")!;
    expect(dg.textContent).toBe(WIDGET_LABELS.ru.dg);
    w.press("sin");
    w.type("30)");
    expect(w.get("r").textContent).toBe("0.5"); // degrees
    w.press("DG");
    expect(dg.textContent).toBe(WIDGET_LABELS.ru.rd);
    expect(w.get("r").textContent).toBe("-0.988031624093"); // radians
    w.press("=");
    expect(w.get("r").textContent).toBe("-0.988031624093");
    // the mode is remembered
    const store = w.store;
    const w2 = boot("ru", store);
    expect(w2.buttons.find((b) => b.orig === "DG")!.textContent).toBe(WIDGET_LABELS.ru.rd);
  });

  it("continues from the result after =, starts fresh on a digit", () => {
    const w = boot("en");
    w.type("2+3");
    w.press("=", "×");
    expect(w.get("e").textContent).toBe("5×");
    w.type("2");
    w.press("=");
    expect(w.get("r").textContent).toBe("10");
    w.type("7");
    expect(w.get("e").textContent).toBe("7");
  });

  it("± toggles the sign of the last number, a second dot in one number is ignored, backspace eats sin( whole", () => {
    const w = boot("en");
    w.type("5");
    w.press("±");
    expect(w.get("e").textContent).toBe("−5");
    w.press("±");
    expect(w.get("e").textContent).toBe("5");
    w.press("AC");
    w.type("1.2.");
    expect(w.get("e").textContent).toBe("1.2");
    w.press("AC", "sin");
    expect(w.get("e").textContent).toBe("sin(");
    w.press("⌫");
    expect(w.get("e").textContent).toBe("0");
    w.press("AC");
    w.type("5−3");
    w.press("±");
    expect(w.get("e").textContent).toBe("5−−3");
    w.press("±");
    expect(w.get("e").textContent).toBe("5−3");
  });

  it("x², √, π, ! and ans keys work", () => {
    const w = boot("en");
    w.type("5");
    w.press("x²", "=");
    expect(w.get("r").textContent).toBe("25");
    w.press("√", "ans", ")", "=");
    expect(w.get("r").textContent).toBe("5");
    w.press("AC", "π", "×", "2", "=");
    expect(w.get("r").textContent).toBe("6.28318530718");
    w.press("AC");
    w.type("5");
    w.press("!", "=");
    expect(w.get("r").textContent).toBe("120");
  });

  it("very large results use re-parseable ×10^n notation and copy as 1e25", () => {
    const w = boot("en");
    w.type("10");
    w.press("^");
    w.type("25");
    w.press("=");
    expect(w.get("r").textContent).toBe("1×10^25");
    w.press("^");
    w.type("1");
    expect(w.get("r").textContent).toBe("1×10^25");
    w.press("AC");
    w.type("1");
    w.press("÷");
    w.type("3");
    w.press("=");
    expect(w.get("r").textContent).toBe("0.333333333333");
  });

  it("expression length is capped", () => {
    const w = boot("en");
    for (let i = 0; i < 80; i++) w.press("7");
    expect(w.get("e").textContent.length).toBeLessThanOrEqual(44);
  });

  it("history keeps the last 5 results, shows the last two, persists, stays small, and is restored", () => {
    const store: Record<string, string> = {};
    const w = boot("en", store);
    for (let i = 1; i <= 7; i++) {
      w.press("AC");
      w.type(`${i}+${i}`);
      w.press("=");
    }
    expect(w.get("h0").textContent).toBe("6+6=12");
    expect(w.get("h1").textContent).toBe("7+7=14");
    const saved = JSON.parse(store.c);
    expect(saved.h).toHaveLength(5);
    expect(Buffer.byteLength(store.c)).toBeLessThan(1024); // localStorage limit is 4096 bytes
    // reopen: history, mode and `ans` come back
    const w2 = boot("en", store);
    expect(w2.get("h1").textContent).toBe("7+7=14");
    w2.press("AC", "ans", "+", "1", "=");
    expect(w2.get("r").textContent).toBe("15");
    // tapping a history line loads its result
    w2.get("h1").onclick!();
    expect(w2.get("e").textContent).toBe("15");
  });

  it("corrupt localStorage does not break the widget", () => {
    for (const bad of ["{", "null", '{"h":5}', '{"h":["x"],"x":{}}']) {
      const w = boot("en", { c: bad });
      w.type("1+1");
      w.press("=");
      expect(w.get("r").textContent).toBe("2");
    }
  });

  it("copy and send-to-bot use the visible result; flash labels are localized and restored", async () => {
    const w = boot("tr");
    w.type("1.5×2");
    w.press("=");
    w.get("cb").onclick!();
    expect(w.copied).toEqual(["3"]);
    expect(w.get("cb").textContent).toBe(WIDGET_LABELS.tr.cd);
    w.get("sb").onclick!();
    expect(w.requests).toEqual([WIDGET_SEND_PREFIX + "3"]);
    expect(w.requests[0].length).toBeLessThanOrEqual(64);
    await Promise.resolve();
    await Promise.resolve();
    expect(w.get("sb").textContent).toBe(WIDGET_LABELS.tr.bd);
    w.timers.forEach((f) => f());
    expect(w.get("cb").textContent).toBe(WIDGET_LABELS.tr.c);
    expect(w.get("sb").textContent).toBe(WIDGET_LABELS.tr.b);
    // the exponent form is sent as plain e-notation, which parseWidgetSendData accepts
    w.press("AC");
    w.type("10");
    w.press("^");
    w.type("25");
    w.press("=");
    w.get("sb").onclick!();
    expect(w.requests[1]).toBe("s:1e25");
    expect(parseWidgetSendData(w.requests[1])).toBe(1e25);
  });

  it("nothing to copy or send for an empty/error state; works without TelegramWidget (plain browser)", () => {
    const w = boot("en");
    w.get("cb").onclick!();
    w.get("sb").onclick!();
    expect(w.copied).toEqual([]);
    expect(w.requests).toEqual([]);
    const plain = boot("en", {}, "none");
    plain.type("2+2");
    plain.press("=");
    plain.get("cb").onclick!();
    plain.get("sb").onclick!();
    expect(plain.get("r").textContent).toBe("4");
  });

  it("symbol-only keys carry localized aria-labels", () => {
    const w = boot("ru");
    const names = WIDGET_LABELS.ru.a.split("|");
    expect(w.buttons.find((b) => b.orig === "⌫")!.attrs["aria-label"]).toBe(names[0]);
    expect(w.buttons.find((b) => b.orig === "=")!.attrs["aria-label"]).toBe(names[2]);
    expect(w.buttons.find((b) => b.orig === "√")!.attrs["aria-label"]).toBe(names[5]);
  });

  it("every language boots and calculates", () => {
    for (const lang of LANGS) {
      const w = boot(lang);
      w.type("2+3×4");
      w.press("=");
      expect(w.get("r").textContent).toBe("14");
    }
  });
});

describe("send.ts", () => {
  it("widgetSendParams matches the sendWidget parameter names and limits", () => {
    for (const lang of LANGS) {
      const p = widgetSendParams(lang);
      expect(Object.keys(p).sort()).toEqual(["allow_queries", "caption", "html", "protect_content"]);
      expect(p.html).toBe(buildCalculatorWidget(lang));
      expect(p.caption).toBe(WIDGET_LABELS[lang].caption);
      expect(p.allow_queries).toBe(true);
      expect(Buffer.byteLength(p.html)).toBeLessThanOrEqual(32768);
    }
    expect(widgetSendParams("en", 123).chat_id).toBe(123);
    expect(widgetSendParams("en", "@x").chat_id).toBe("@x");
  });

  it("parseWidgetSendData accepts only the calculator's own format", () => {
    expect(parseWidgetSendData("s:12.5")).toBe(12.5);
    expect(parseWidgetSendData("s:-3")).toBe(-3);
    expect(parseWidgetSendData("s:1.5e-7")).toBe(1.5e-7);
    expect(parseWidgetSendData("x:1")).toBeNull();
    expect(parseWidgetSendData("s:")).toBeNull();
    expect(parseWidgetSendData("s:1+1")).toBeNull();
    expect(parseWidgetSendData("s:Infinity")).toBeNull();
    expect(parseWidgetSendData("s:1e999")).toBeNull();
  });
});
