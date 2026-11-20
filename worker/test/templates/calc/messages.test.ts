import { afterEach, describe, expect, it } from "vitest";
import { DICTIONARIES } from "../../../src/i18n";
import { en } from "../../../src/i18n/en";
import { setLogSink } from "../../../src/log";
import { CalcFakeDb, NOW, harness, seedRates, setUser, text } from "./util";

afterEach(() => setLogSink(null));

const reply = (h: ReturnType<typeof harness>) => h.sent("sendMessage")[0];

describe("plain calculations (private chat)", () => {
  it("answers `expr = result` in HTML", async () => {
    const h = harness();
    await h.send(text("2+3*4"));
    const m = reply(h);
    expect(m.payload.text).toBe("<code>2+3*4</code> = <code>14</code>");
    expect(m.payload.parse_mode).toBe("HTML");
    expect(m.payload.chat_id).toBe(5);
  });

  it.each([
    ["480 * 15%", "72"],
    ["200 + 10%", "220"],
    ["80 - 25%", "60"],
    ["(15+5)/4", "5"],
    ["2^10", "1,024"],
    ["sqrt(144)", "12"],
    ["5!", "120"],
    ["0.1+0.2", "0.3"],
  ])("%s -> %s", async (expr, result) => {
    const h = harness();
    await h.send(text(expr));
    expect(String(reply(h).payload.text)).toBe(`<code>${expr}</code> = <code>${result}</code>`);
  });

  it("uses degrees by default and radians when the user chose them", async () => {
    const h = harness();
    await h.send(text("sin(30)"));
    expect(String(reply(h).payload.text)).toContain("<code>0.5</code>");
    setUser(h.db, 6, { angle: "rad" });
    await h.send(text("sin(0)", { from: 6 }));
    await h.send(text("cos(pi)", { from: 6 }));
    expect(h.texts()[2]).toContain("<code>-1</code>");
  });

  it("honours the digits setting (6 significant digits)", async () => {
    const h = harness();
    setUser(h.db, 5, { digits: 6 });
    await h.send(text("1/3"));
    expect(String(reply(h).payload.text)).toContain("<code>0.333333</code>");
  });

  it("formats numbers per language (separators)", async () => {
    const cases: [string, string][] = [
      ["en", "1,234,567.5"],
      ["ru", "1 234 567,5"],
      ["uz", "1 234 567,5"],
      ["tr", "1.234.567,5"],
      ["es", "1.234.567,5"],
    ];
    for (const [lang, shown] of cases) {
      const h = harness();
      await h.send(text("1234567.5", { lang }));
      expect(String(reply(h).payload.text), lang).toContain(`<code>${shown}</code>`);
    }
  });

  it("wraps the math in LRI..PDI for Arabic", async () => {
    const h = harness();
    await h.send(text("2+3", { lang: "ar" }));
    expect(String(reply(h).payload.text)).toBe("<code>⁦2+3⁩</code> = <code>⁦5⁩</code>");
  });

  it("keeps `ans` between messages of the same user only", async () => {
    const h = harness();
    await h.send(text("6*7"));
    await h.send(text("ans+8"));
    await h.send(text("ans", { from: 9 }));
    expect(h.texts()[1]).toContain("<code>50</code>");
    expect(h.texts()[2]).toContain(en.err_unknown.replace("{name}", "ans").slice(0, 20));
  });

  it("does not write to D1 for a plain calculation (one read, no write)", async () => {
    const h = harness();
    h.db.resetCounters();
    await h.send(text("1+1"));
    expect(h.db.reads).toBe(1);
    expect(h.db.writes).toBe(0);
  });

  it("uses the stored language over language_code", async () => {
    const h = harness();
    setUser(h.db, 5, { lang: "ru" });
    await h.send(text("1/0", { lang: "en" }));
    expect(h.texts()[0]).toBe(DICTIONARIES.ru.err_div0);
  });

  it("falls back to detectLang(language_code) without a stored language", async () => {
    const h = harness();
    await h.send(text("1/0", { lang: "tr" }));
    expect(h.texts()[0]).toBe(DICTIONARIES.tr.err_div0);
  });

  it("falls back to the default language for an unsupported language_code", async () => {
    const h = harness({ appConfig: { defaultLang: "ru" } });
    await h.send(text("1/0", { lang: "de" }));
    expect(h.texts()[0]).toBe(DICTIONARIES.ru.err_div0);
  });

  it("strips a leading @bot mention in private chats", async () => {
    const h = harness();
    await h.send(text("@tezcalc_bot 2+2"));
    expect(h.texts()[0]).toBe("<code>2+2</code> = <code>4</code>");
  });
});

describe("errors", () => {
  it("division by zero", async () => {
    const h = harness();
    await h.send(text("1/0"));
    expect(h.texts()).toEqual([en.err_div0]);
  });

  it("syntax error carries a 1-based position", async () => {
    const h = harness();
    await h.send(text("2+*3"));
    const t = h.texts()[0];
    expect(t).toContain("Syntax error near position");
    expect(t).toMatch(/position \d+\./);
  });

  it("domain error", async () => {
    const h = harness();
    await h.send(text("sqrt(-1)"));
    expect(h.texts()).toEqual([en.err_domain]);
  });

  it("unknown identifier is reported with its (escaped) name", async () => {
    const h = harness();
    await h.send(text("3 + foo"));
    expect(h.texts()[0]).toContain("“foo”");
  });

  it("too long input", async () => {
    const h = harness();
    await h.send(text("1+".repeat(600) + "1"));
    expect(h.texts()).toEqual([en.err_too_long]);
  });

  it("errors are localized", async () => {
    const h = harness();
    await h.send(text("1/0", { lang: "uz" }));
    expect(h.texts()).toEqual([DICTIONARIES["uz-latn"].err_div0]);
  });
});

describe("conversions in plain messages", () => {
  it("units", async () => {
    const h = harness();
    await h.send(text("100 km to mi"));
    const t = h.texts()[0];
    expect(t).toContain("<code>100 km</code>");
    expect(t).toMatch(/<code>62\.13\d* mi<\/code>/);
  });

  it("currency with a stored table (fresh: shows the update date)", async () => {
    const h = harness();
    seedRates(h.db);
    await h.send(text("100 USD to UZS"));
    const t = h.texts()[0];
    expect(t).toContain("<code>1,200,000 UZS</code>");
    expect(t).toContain("💱");
    expect(t).not.toContain("out of date");
  });

  it("stale rates add the fx_stale warning", async () => {
    const h = harness();
    seedRates(h.db, NOW - 3 * 86_400);
    await h.send(text("100 USD to UZS"));
    expect(h.texts()[0]).toContain("out of date");
  });

  it("no rates at all -> err_no_rate", async () => {
    const h = harness();
    await h.send(text("100 USD to UZS"));
    expect(h.texts()[0]).toContain("No exchange rate is available for USD/UZS");
  });

  it("incompatible units -> err_units_mismatch", async () => {
    const h = harness();
    await h.send(text("5 kg to km"));
    expect(h.texts()).toEqual([en.err_units_mismatch]);
  });

  it("is not captured when it is plain arithmetic (`3 to 4`)", async () => {
    const h = harness();
    await h.send(text("3 to 4"));
    expect(h.texts()[0]).not.toContain("<code>3 ");
  });
});

describe("chit-chat hint", () => {
  it("replies once per 20 minutes", async () => {
    const h = harness();
    await h.send(text("salom"));
    await h.send(text("qalaysiz"));
    expect(h.texts()).toEqual([en.not_math_hint]);
    h.clock.now += 19 * 60;
    await h.send(text("hello there"));
    expect(h.texts()).toHaveLength(1);
    h.clock.now += 2 * 60;
    await h.send(text("hello again"));
    expect(h.texts()).toHaveLength(2);
  });

  it("is per user", async () => {
    const h = harness();
    await h.send(text("salom", { from: 5 }));
    await h.send(text("salom", { from: 6 }));
    expect(h.texts()).toHaveLength(2);
  });

  it("is not triggered by a malformed calculation with digits", async () => {
    const h = harness();
    await h.send(text("2 +"));
    expect(h.texts()[0]).not.toBe(en.not_math_hint);
  });

  it("is localized", async () => {
    const h = harness();
    await h.send(text("привет", { lang: "ru" }));
    expect(h.texts()).toEqual([DICTIONARIES.ru.not_math_hint]);
  });
});

describe("HTML safety", () => {
  it("escapes <script> in an unknown identifier", async () => {
    const h = harness();
    await h.send(text("1 + <script>"));
    const t = h.texts()[0];
    expect(t).not.toContain("<script>");
  });

  it("escapes & and < in the echoed expression", async () => {
    const h = harness();
    seedRates(h.db);
    await h.send(text("1 < 2"));
    const t = h.texts()[0];
    expect(t).not.toMatch(/<(?!\/?(code|b|i)\b)/);
  });

  it("an unknown name containing HTML is escaped inside err_unknown", async () => {
    const h = harness();
    await h.send(text("3 + a&b"));
    const t = h.texts()[0];
    expect(t).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
  });

  it("triple backticks in the input cannot break the message", async () => {
    const h = harness();
    await h.send(text("```2+2```"));
    expect(h.calls.every((c) => c.method === "sendMessage")).toBe(true);
    expect(h.texts()).toHaveLength(1);
  });

  it("an expression echo is escaped (&lt;)", async () => {
    const h = harness();
    await h.send(text("2 <b> 3"));
    const t = h.texts()[0];
    expect(t).not.toContain("<b>");
  });
});

describe("history is written only when the user turned it on", () => {
  it("off by default", async () => {
    const h = harness();
    await h.send(text("2+2"));
    expect(h.db.history).toHaveLength(0);
  });

  it("on: calculations and conversions are saved", async () => {
    const h = harness();
    setUser(h.db, 5, { keep_history: 1 });
    await h.send(text("2+2"));
    await h.send(text("100 km to mi"));
    expect(h.db.history.map((r) => r.expr)).toEqual(["2+2", "100 km to mi"]);
    expect(h.db.history[0]).toMatchObject({ bot_id: "b1", user_id: 5, result: "4", ts: NOW });
  });

  it("errors are never saved", async () => {
    const h = harness();
    setUser(h.db, 5, { keep_history: 1 });
    await h.send(text("1/0"));
    expect(h.db.history).toHaveLength(0);
  });

  it("a failing history write does not hide the answer", async () => {
    const h = harness();
    setLogSink(() => {});
    setUser(h.db, 5, { keep_history: 1 });
    h.db.failSql = /INSERT INTO history/;
    await h.send(text("2+2"));
    expect(h.texts()).toEqual(["<code>2+2</code> = <code>4</code>"]);
  });
});

describe("groups", () => {
  it("stay silent for ordinary messages", async () => {
    const h = harness();
    await h.send(text("2+2", { type: "group" }));
    await h.send(text("hello", { type: "supergroup" }));
    expect(h.calls).toHaveLength(0);
  });

  it("answer an @bot mention (quoting the message)", async () => {
    const h = harness();
    await h.send(text("@tezcalc_bot 12*3+4", { type: "group" }));
    const m = reply(h);
    expect(m.payload.text).toBe("<code>12*3+4</code> = <code>40</code>");
    expect(m.payload.reply_parameters).toMatchObject({ message_id: 10 });
  });

  it("the mention may come last and is case-insensitive", async () => {
    const h = harness();
    await h.send(text("12*3+4 @TezCalc_Bot", { type: "supergroup" }));
    expect(h.texts()[0]).toContain("<code>40</code>");
  });

  it("a mention of another bot is ignored", async () => {
    const h = harness();
    await h.send(text("@other_bot 2+2", { type: "group" }));
    expect(h.calls).toHaveLength(0);
  });

  it("a bare mention with nothing to compute is ignored", async () => {
    const h = harness();
    await h.send(text("@tezcalc_bot", { type: "group" }));
    expect(h.calls).toHaveLength(0);
  });

  it("unknown commands are ignored in groups but answered in private", async () => {
    const h = harness();
    await h.send(text("/nonsense", { type: "group" }));
    expect(h.calls).toHaveLength(0);
    await h.send(text("/nonsense"));
    expect(h.texts()).toEqual([en.unknown_command]);
  });

  it("commands addressed to another bot are ignored", async () => {
    const h = harness();
    await h.send(text("/start@other_bot"));
    expect(h.calls).toHaveLength(0);
  });

  it("history is not written from groups", async () => {
    const h = harness();
    setUser(h.db, 5, { keep_history: 1 });
    await h.send(text("@tezcalc_bot 2+2", { type: "group" }));
    expect(h.db.history).toHaveLength(0);
  });
});

describe("rate limiting", () => {
  it("answers rate_limited in private chats and computes nothing", async () => {
    const h = harness({ rateLimited: () => true });
    await h.send(text("2+2"));
    expect(h.texts()).toEqual([en.rate_limited]);
    expect(h.db.reads).toBe(0);
  });

  it("is silent in groups", async () => {
    const h = harness({ rateLimited: () => true });
    await h.send(text("@tezcalc_bot 2+2", { type: "group" }));
    expect(h.calls).toHaveLength(0);
  });

  it("consumes one token per plain message", async () => {
    const seen: number[] = [];
    const h = harness({ rateLimited: (u) => (seen.push(u), false) });
    await h.send(text("1+1", { from: 77 }));
    expect(seen).toEqual([77]);
  });
});

describe("robustness", () => {
  it("a database failure still answers (defaults)", async () => {
    const h = harness();
    setLogSink(() => {});
    h.db.failSql = /SELECT lang, angle/;
    await h.send(text("2+2"));
    expect(h.texts()).toEqual(["<code>2+2</code> = <code>4</code>"]);
  });

  it("ignores messages without text", async () => {
    const h = harness();
    await h.send({ message: { message_id: 1, date: NOW, chat: { id: 5, type: "private", first_name: "A" }, from: { id: 5, is_bot: false, first_name: "A" }, photo: [] } });
    expect(h.calls).toHaveLength(0);
  });

  it("a freshly seeded CalcFakeDb has no leftovers", () => {
    expect(new CalcFakeDb().history).toEqual([]);
  });
});
